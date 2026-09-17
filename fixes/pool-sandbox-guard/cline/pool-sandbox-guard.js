// Pool Sandbox Guard - Cline plugin (mirrors fixes/pool-sandbox-guard).
// Blocks tool calls touching paths outside the persistent studio dir, and
// global/system installs that would be wiped on pool-machine restart.
// Roots: __POOL_ROOTS__.
// Install: drop in ~/.cline/plugins/ (auto-discovered, all sessions).
// beforeTool returns { skip: true, reason } to block (official pattern).
import path from "node:path";
import os from "node:os";
const STUDIO = "__POOL_ROOT__";
const STUDIO_ALIAS = "__POOL_ALIAS__";
const ROOTS_DISPLAY = "__POOL_ROOTS__";
const BLOCK_MSG = `Blocked: this disk sandbox is on a pool machine. Only ${ROOTS_DISPLAY} persists \u2014 everything outside will be cleaned after restart. Re-run inside the studio directory.`;
const INSTALL_MSG = `Blocked: global/system installs do NOT persist on this pool-machine sandbox. Only ${ROOTS_DISPLAY} survives restart. Install inside the studio instead (never use sudo).`;
const FILE_TOOLS = new Set(["read_files", "editor", "apply_patch"]);
const SHELL_TOOLS = new Set(["run_commands"]);
const SEARCH_TOOLS = new Set(["search_codebase"]);
let workspaceRoot = process.cwd();
function roots() {
  const home = os.homedir() || process.env.HOME || STUDIO;
  const out = new Set([STUDIO, STUDIO_ALIAS]);
  for (const c of [home, workspaceRoot]) {
    if (typeof c !== "string" || !c) continue;
    const abs = path.resolve(c);
    if (abs === STUDIO || abs === STUDIO_ALIAS || abs === path.resolve(home)) out.add(abs);
    else if (abs.startsWith(STUDIO + "/") || abs.startsWith(STUDIO_ALIAS + "/")) out.add(abs);
  }
  return [...out];
}
function canon(p, rs) {
  let n = p;
  for (const r of rs) {
    if (r !== STUDIO && (n === r || n.startsWith(r + "/"))) { n = STUDIO + n.slice(r.length); break; }
  }
  return n;
}
function isInside(raw, rs) {
  if (typeof raw !== "string" || !raw) return true;
  let p = raw;
  const home = os.homedir() || process.env.HOME || STUDIO;
  if (p === "~" || p.startsWith("~/")) p = path.join(home, p === "~" ? "" : p.slice(2));
  let abs;
  try { abs = path.resolve(p); } catch { return true; }
  const n = canon(abs, rs);
  if (n === "/dev/null" || n.startsWith("/dev/std") || n.startsWith("/proc/") || n.startsWith("/sys/") || n === "/proc" || n === "/sys" || n === "/dev") return true;
  const nr = rs.map((r) => canon(r, rs));
  return nr.some((r) => n === r || n.startsWith(r + "/"));
}
function extractAbsolutePaths(cmd) {
  const out = [];
  const re = /"(\/[^"\n]*)"|'(\/[^'\n]*)'|(?<![\w$./~=-])(\/[A-Za-z0-9._~+][A-Za-z0-9._~+/-]*)/g;
  let m;
  while ((m = re.exec(cmd)) !== null) { const q = m[1] ?? m[2] ?? m[3]; if (q) out.push(q.replace(/[),;:!]+$/, "")); }
  return out;
}
function extractCdTargets(cmd) {
  const out = [];
  const re = /(?:^|[;&|]+)\s*(?:builtin\s+)?(?:cd|pushd)\s+([^\s;&|]+)/g;
  let m;
  while ((m = re.exec(cmd)) !== null) { const t = m[1].trim().replace(/^["']|["']$/g, ""); if (t && t !== "-" && t !== "--") out.push(t); }
  return out;
}
function extractShellCommands(input) {
  if (typeof input === "string") return [input];
  if (Array.isArray(input)) return input.filter((e) => typeof e === "string");
  if (input && typeof input === "object") {
    const v = input.command ?? input.commands ?? input.cmd;
    if (typeof v === "string") return [v];
    if (Array.isArray(v)) return v.filter((e) => typeof e === "string");
  }
  return [];
}
function extractFilePaths(input) {
  const paths = [];
  const visit = (v) => {
    if (typeof v === "string") { if (v.includes("/") || v.startsWith("~")) paths.push(v); }
    else if (Array.isArray(v)) v.forEach(visit);
    else if (v && typeof v === "object") {
      if (typeof v.path === "string") paths.push(v.path);
      if (typeof v.file_path === "string") paths.push(v.file_path);
      if (typeof v.filePath === "string") paths.push(v.filePath);
      visit(v.files); visit(v.file_paths); visit(v.paths);
    }
  };
  visit(input);
  return paths;
}
function extractApplyPatchPaths(patch) {
  const out = [];
  for (const line of String(patch).split(/\r?\n/)) {
    const m = /^\*\*\* (?:Add File|Update File|Move to|Delete File|Rename from|Rename to):\s*(.+?)\s*$/.exec(line);
    if (m) out.push(m[1].trim());
  }
  return out;
}
function splitSegments(cmd) { return cmd.split(/&&|\|\||[;|\n]+|\$\(/).map((s) => s.trim()).filter(Boolean); }
function stripAssignments(s) {
  let prev;
  do { prev = s; s = s.replace(/^([A-Za-z_][A-Za-z0-9_]*=(?:"[^"]*"|'[^']*'|[^\s]+)\s+)+/, "").trim(); s = s.replace(/^(env|command|builtin|time)(\s+|$)/, "").trim(); } while (s !== prev);
  return s;
}
function leadingAssigns(seg) {
  const out = {};
  const m = seg.match(/^([A-Za-z_][A-Za-z0-9_]*=(?:"[^"]*"|'[^']*'|[^\s]+)\s+)+/);
  if (!m) return out;
  const re = /([A-Za-z_][A-Za-z0-9_]*)=("[^"]*"|'[^']*'|[^\s]+)/g;
  let a;
  while ((a = re.exec(m[0])) !== null) out[a[1]] = a[2].replace(/^["']|["']$/g, "");
  return out;
}
function optionValues(seg, names) {
  const out = [];
  for (const n of names) {
    const esc = n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const longEq = new RegExp(`${esc}=([^\\s"']+|"[^"]*"|'[^']*')`, "g");
    let m;
    while ((m = longEq.exec(seg)) !== null) out.push(m[1].replace(/^["']|["']$/g, ""));
    const sp = new RegExp(n.startsWith("--") ? `${esc}\\s+([^\\s"']+|"[^"]*"|'[^']*')` : `(?:^|\\s)${esc}\\s+([^\\s"']+|"[^"]*"|'[^']*')`, "g");
    while ((m = sp.exec(seg)) !== null) out.push(m[1].replace(/^["']|["']$/g, ""));
  }
  return out;
}
function assignInside(assigns, names, rs) {
  const home = os.homedir() || process.env.HOME || rs[0];
  for (const n of names) {
    const v = assigns[n];
    if (typeof v === "string" && v) {
      const ex = v.replace(/^~(?=\/|$)/, home);
      if (path.isAbsolute(ex) && isInside(path.resolve(ex), rs)) return true;
    }
  }
  return false;
}
function envInside(name, rs) { const v = process.env[name]; return typeof v === "string" && !!v && isInside(v, rs); }
function anyOptionInside(seg, names, wd, rs) {
  const home = os.homedir() || process.env.HOME || rs[0];
  return optionValues(seg, names).some((v) => {
    const ex = v.replace(/^~(?=\/|$)/, home);
    if (path.isAbsolute(ex) || ex.startsWith("~/") || ex === "~") return isInside(ex, rs);
    if (ex.startsWith("./") || ex.startsWith("../") || ex === "." || ex === "..") return isInside(path.resolve(wd, ex), rs);
    return false;
  });
}
function checkGlobalInstall(expandedCmd, wd, rs) {
  let venvSourcedInside = false;
  { const actRe = /(?:source\s+|\.\s+)([^\s;"'|]+bin\/activate)/g; let am;
    while ((am = actRe.exec(expandedCmd)) !== null) {
      const cand = am[1].replace(/^["']|["']$/g, "");
      const r = path.isAbsolute(cand) ? path.resolve(cand) : path.resolve(wd, cand);
      if (isInside(r, rs)) { venvSourcedInside = true; break; }
    } }
  for (const rawSeg of splitSegments(expandedCmd)) {
    const stripped = stripAssignments(rawSeg);
    if (!stripped) continue;
    const assigns = leadingAssigns(rawSeg);
    const m0 = stripped.match(/^([^\s]+)/);
    const raw = m0 ? m0[1].replace(/^["']|["']$/g, "") : "";
    const argv0 = (raw.split("/").pop() || "").toLowerCase();
    const has = (re) => re.test(stripped);
    if (/^(apt|apt-get|yum|dnf|microdnf|pacman|yay|paru|apk|zypper|emerge|snap|pkg|brew|dpkg|rpm)(\s|$)/.test(stripped)) {
      if (/\s(install|uninstall|remove|upgrade|update|reinstall|purge|autoremove|dist-upgrade|full-upgrade|clean|tap|untap|link|unlink|-i)\b/.test(stripped))
        return { label: argv0 || "pkg", hint: "System packages mutate the image and are wiped. Work inside the studio instead." };
    }
    if (argv0 === "npm" && /\s(-g|--global)(?=[\s=]|$)/.test(stripped))
      return { label: "npm -g", hint: "Use `npm i` in the project or `npm i --prefix ~/...` instead." };
    if (argv0 === "yarn" && /\byarn\s+global\b/.test(stripped))
      return { label: "yarn global", hint: "Use project-local yarn instead." };
    if ((argv0 === "pnpm" || argv0 === "bun") && /\s(-g|--global)(?=[\s=]|$)/.test(stripped))
      return { label: `${argv0} -g`, hint: `Use project-local ${argv0} instead.` };
    if (/\b(pip3?|python3?\s+-m\s+pip|uv\s+pip)\s+install\b/.test(stripped) || /^\s*uv\s+add\b/.test(stripped)) {
      const srcd = /venv\/bin\/activate|\.venv\/bin\/|VIRTUAL_ENV|CONDA_PREFIX|PIP_TARGET|UV_PROJECT_ENVIRONMENT|PYTHONUSERBASE|--target|--prefix|--root/.test(rawSeg);
      let bin = false;
      if (raw.includes("/")) { const home = os.homedir() || process.env.HOME || rs[0]; const ex = raw.replace(/^~(?=\/|$)/, home); const r = path.isAbsolute(ex) ? path.resolve(ex) : path.resolve(wd, ex); bin = isInside(r, rs); }
      const im = rawSeg.match(/^\s*(?:VIRTUAL_ENV|CONDA_PREFIX|UV_PROJECT_ENVIRONMENT|PIP_TARGET)=([^\s]+)/);
      const inlineVenv = !!im && isInside(im[1].replace(/^["']|["']$/g, "").replace(/^~(?=\/|$)/, os.homedir() || rs[0]), rs);
      if (!(srcd || bin || inlineVenv || venvSourcedInside || envInside("VIRTUAL_ENV", rs) || envInside("CONDA_PREFIX", rs) || envInside("UV_PROJECT_ENVIRONMENT", rs) || envInside("PIP_TARGET", rs) || envInside("PYTHONUSERBASE", rs)))
        return { label: "pip install", hint: "Site-packages here is outside ~/ (wiped). Use `python -m venv ~/venv && source ~/venv/bin/activate` then pip install, or `pip install --target=~/libs <pkg>`." };
      continue;
    }
    if (argv0 === "pipx" && /(^|\s)(install|inject|upgrade|reinstall)\b/.test(stripped))
      return { label: "pipx", hint: "pipx targets ~/.local (outside ~/ here, wiped). Use `python -m venv ~/venv` + pip, or `pip install --target=~/libs` instead." };
    if (argv0 === "cpan" || argv0 === "cpanm")
      return { label: argv0, hint: "Install Perl modules with local::lib under ~/ instead of system-wide." };
    if (argv0 === "cargo" && /(^|\s)install\b/.test(stripped)) {
      if (!envInside("CARGO_HOME", rs) && !assignInside(assigns, ["CARGO_HOME"], rs) && !anyOptionInside(rawSeg, ["--root"], wd, rs))
        return { label: "cargo install", hint: "Set `export CARGO_HOME=~/.cargo` (inside studio) first, or `cargo install --root ~/...`." };
    }
    if (argv0 === "go" && /(^|\s)install\b/.test(stripped)) {
      if (!envInside("GOBIN", rs) && !envInside("GOPATH", rs) && !assignInside(assigns, ["GOBIN", "GOPATH"], rs))
        return { label: "go install", hint: "Set `export GOBIN=~/go/bin` (inside studio) first." };
    }
    if (argv0 === "gem" && /(^|\s)install\b/.test(stripped)) {
      if (!envInside("GEM_HOME", rs) && !assignInside(assigns, ["GEM_HOME"], rs) && !anyOptionInside(rawSeg, ["--install-dir", "--bindir"], wd, rs))
        return { label: "gem install", hint: "Set `export GEM_HOME=~/.gem` (inside studio) first, or `gem install --install-dir ~/...`." };
    }
    if (argv0 === "make" && /(^|\s)install\b/.test(stripped)) {
      if (!/\bPREFIX=(~\/|__POOL_ROOT_RX__(\/|$)|__POOL_ALIAS_RX__(\/|$))/.test(stripped) && !/\bDESTDIR=/.test(stripped))
        return { label: "make install", hint: "Use `make install PREFIX=~/...` so files land inside the studio." };
    }
    if (argv0 === "cmake" && /(^|\s)--install\b/.test(stripped)) {
      if (!anyOptionInside(rawSeg, ["--prefix"], wd, rs))
        return { label: "cmake --install", hint: "Use `cmake --install ... --prefix ~/...` so files land inside the studio." };
    }
    if (argv0 === "meson" && /(^|\s)install\b/.test(stripped))
      return { label: "meson install", hint: "Reconfigure with `-Dprefix=~/...` so install lands inside the studio." };
    if (argv0 === "ninja" && /(^|\s)install\b/.test(stripped))
      return { label: "ninja install", hint: "Reconfigure the build with prefix under ~/ so install lands inside the studio." };
    if (/^(systemctl|service)(\s|$)/.test(stripped) && /\s(start|stop|restart|enable|disable|mask)\b/.test(stripped))
      return { label: argv0, hint: "System services do not persist on this box." };
  }
  return undefined;
}
function collectKeyPaths(input, keys) {
  const out = [];
  const pushVal = (v) => {
    if (typeof v === "string") out.push(v);
    else if (Array.isArray(v)) v.forEach(pushVal);
    else if (v && typeof v === "object") {
      if (typeof v.path === "string") out.push(v.path);
      if (typeof v.file_path === "string") out.push(v.file_path);
      if (typeof v.filePath === "string") out.push(v.filePath);
    }
  };
  if (typeof input === "string") { out.push(input); return out; }
  if (input && typeof input === "object" && !Array.isArray(input)) { for (const k of keys) { if (k in input) pushVal(input[k]); } return out; }
  if (Array.isArray(input)) { input.forEach(pushVal); return out; }
  return out;
}
function expandHome(cmd) {
  const home = os.homedir() || process.env.HOME || STUDIO;
  return cmd.replace(/\$\{HOME\}/g, home).replace(/\$HOME(?=\/|$)/g, home).replace(/(^|[\s;&|(=])~(?=\/|$)/g, `$1${home}`);
}
function shellPlan(input) {
  let cmds = extractShellCommands(input);
  if (input && typeof input === "object" && !Array.isArray(input) && Array.isArray(input.args) && input.args.every((a) => typeof a === "string") && cmds.length > 0)
    cmds = cmds.map((c) => `${c} ${input.args.join(" ")}`.trim());
  let wd = workspaceRoot;
  if (input && typeof input === "object" && typeof input.cwd === "string" && input.cwd) wd = input.cwd;
  if (!path.isAbsolute(wd)) wd = path.resolve(workspaceRoot, wd);
  return { cmds, wd };
}
function isOutsidePath(p) { return typeof p === "string" && (p === "~" || p.startsWith("~/") || path.isAbsolute(p)); }
const plugin = {
  name: "pool-sandbox-guard",
  manifest: { capabilities: ["hooks"] },
  setup(_api, ctx) {
    const r = ctx && ctx.workspaceInfo && ctx.workspaceInfo.rootPath;
    if (typeof r === "string" && r) workspaceRoot = r;
  },
  hooks: {
    async beforeTool(ctx) {
      const rs = roots();
      const c = ctx || {};
      const toolCall = c.toolCall || {};
      const input = c.input;
      const tool = (c.tool && c.tool.name) || toolCall.toolName || "";
      const block = (d) => { console.error(`[pool-sandbox-guard] blocked ${tool}: ${d}`); return { skip: true, reason: d ? `${BLOCK_MSG} (${d})` : BLOCK_MSG }; };
      const blockInstall = (label, hint) => { console.error(`[pool-sandbox-guard] blocked install ${tool}: ${label}`); return { skip: true, reason: `${INSTALL_MSG} (${label}) ${hint}` }; };
      if (tool === "read_files" || tool === "editor") {
        for (const p of collectKeyPaths(input, ["path", "file_path", "filePath", "file", "filename", "filepath", "files", "file_paths", "paths"])) {
          if (isOutsidePath(p) && !isInside(p, rs)) return block(`${tool} path outside studio: ${p}`);
        }
      }
      if (tool === "apply_patch") {
        const rec = (input && typeof input === "object" && !Array.isArray(input)) ? input : {};
        const patch = typeof input === "string" ? input : rec.patchText ?? rec.input ?? rec.patch ?? "";
        for (const p of extractApplyPatchPaths(patch)) {
          if (isOutsidePath(p) && !isInside(p, rs)) return block(`apply_patch path outside studio: ${p}`);
        }
        for (const p of collectKeyPaths(input, ["path", "file_path", "filePath", "files", "file_paths", "paths"])) {
          if (isOutsidePath(p) && !isInside(p, rs)) return block(`apply_patch path outside studio: ${p}`);
        }
      }
      if (tool === "search_codebase") {
        for (const p of collectKeyPaths(input, ["path", "dir", "directory", "cwd", "root"])) {
          if (isOutsidePath(p) && !isInside(p, rs)) return block(`search_codebase path outside studio: ${p}`);
        }
      }
      if (tool === "run_commands") {
        const { cmds, wd } = shellPlan(input);
        if (!isInside(wd, rs)) return block(`run_commands cwd outside studio: ${wd}`);
        const home = os.homedir() || process.env.HOME || rs[0];
        for (const cmd of cmds) {
          if (/(^|[;\s&|(\n]+)\s*(?:[A-Za-z_]\w*=[^\s;&|]+\s+)*(sudo|doas)(?![\w-])/.test(cmd))
            return block(`sudo/doas elevation is not allowed here (${String(cmd).slice(0, 60)})`);
          for (const t of extractCdTargets(cmd)) {
            const ex = (t === "~" || t.startsWith("~/")) ? t.replace(/^~(?=\/|$)/, home) : t;
            const r = path.isAbsolute(ex) ? path.resolve(ex) : path.resolve(wd, ex);
            if (!isInside(r, rs)) return block(`shell cd outside studio: ${t}`);
          }
          const ex = expandHome(cmd);
          const hit = checkGlobalInstall(ex, wd, rs);
          if (hit) return blockInstall(hit.label, hit.hint);
          for (const p of extractAbsolutePaths(ex)) {
            if (!isInside(p, rs)) return block(`shell path outside studio: ${p}`);
          }
          const assignRe = /(?:^|[;\s&|])([A-Za-z_][A-Za-z0-9_]*)=(\/[A-Za-z0-9._~+/-]*)/g;
          let am;
          while ((am = assignRe.exec(ex)) !== null) {
            if (!isInside(am[2], rs)) return block(`shell ${am[1]} outside studio: ${am[2]}`);
          }
        }
      }
      return undefined;
    },
  },
};
export { plugin };
export default plugin;
