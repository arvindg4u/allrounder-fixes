import path from "node:path";
import os from "node:os";

// Blocks any opencode tool call that touches paths outside the studio dir.
// Disk sandbox is on a pool machine: only the studio dir persists,
// everything outside is cleaned after restart.

const STUDIO_CANONICAL = "__POOL_ROOT__";
const STUDIO_ALIAS = "__POOL_ALIAS__";

function resolveRoots(startupDirectory) {
  const home = os.homedir() || process.env.HOME || STUDIO_CANONICAL;
  const candidates = [STUDIO_CANONICAL, STUDIO_ALIAS, home, startupDirectory].filter(
    (p) => typeof p === "string" && p.length > 0
  );
  const resolved = [];
  for (const c of candidates) {
    try {
      const abs = path.resolve(c);
      // Only trust roots that are inside the studio (or are the studio itself).
      // This prevents a poisoned startupDirectory outside the sandbox from
      // widening the allowlist.
      if (abs === STUDIO_CANONICAL || abs === STUDIO_ALIAS || abs === path.resolve(home)) {
        resolved.push(abs);
      } else if (abs.startsWith(STUDIO_CANONICAL + "/") || abs.startsWith(STUDIO_ALIAS + "/")) {
        resolved.push(abs);
      }
    } catch {
      // ignore unresolvable candidates
    }
  }
  // Always keep at least the canonical roots.
  if (resolved.length === 0) resolved.push(STUDIO_CANONICAL, STUDIO_ALIAS);
  return [...new Set(resolved)];
}

function isInside(p, roots) {
  if (typeof p !== "string" || p.length === 0) return true; // non-paths don't trigger
  let abs;
  try {
    // Expand leading ~/ to HOME (which is the studio dir here)
    if (p === "~" || p.startsWith("~/")) {
      const home = os.homedir() || process.env.HOME || STUDIO_CANONICAL;
      p = path.join(home, p.slice(p === "~" ? 1 : 2));
    }
    abs = path.resolve(p);
  } catch {
    return true;
  }
  // Same bind-mount can appear under either alias; normalize both.
  const normalized = abs
    .replace(STUDIO_ALIAS, STUDIO_CANONICAL);
  const normalizedRoots = roots.map((r) => r.replace(STUDIO_ALIAS, STUDIO_CANONICAL));
  // Ephemeral system pseudo-filesystems are not disk writes; allow them.
  if (
    normalized === "/dev/null" ||
    normalized.startsWith("/dev/std") ||
    normalized.startsWith("/proc/") ||
    normalized.startsWith("/sys/") ||
    normalized === "/proc" ||
    normalized === "/sys" ||
    normalized === "/dev"
  ) {
    return true;
  }
  return normalizedRoots.some((r) => normalized === r || normalized.startsWith(r + "/"));
}

// Pull /abs/path tokens out of a shell string (handles quotes).
// Skips the "/..." half of "~/..." (handled via HOME expansion instead).
function extractAbsolutePaths(cmd) {
  if (typeof cmd !== "string") return [];
  const out = [];
  const re = /"(\/[^"\n]*)"|'(\/[^'\n]*)'|(?<![\w$./~=-])(\/[A-Za-z0-9._~+][A-Za-z0-9._~+/-]*)/g;
  let m;
  while ((m = re.exec(cmd)) !== null) {
    const p = m[1] ?? m[2] ?? m[3];
    if (p) {
      // strip trailing punctuation that is not part of the path
      out.push(p.replace(/[),;:!]+$/, ""));
    }
  }
  return out;
}

// Find `cd <target>` / `pushd <target>` targets so relative escapes (cd ..) resolve correctly.
function extractCdTargets(cmd) {
  if (typeof cmd !== "string") return [];
  const out = [];
  const re = /(?:^|[;&|]+|\$\(|\))\s*(?:builtin\s+)?(?:cd|pushd)\s+([^\s;&|]+)/g;
  let m;
  while ((m = re.exec(cmd)) !== null) {
    let t = m[1].trim().replace(/^["']|["']$/g, "");
    if (t && t !== "-" && t !== "--") out.push(t);
  }
  return out;
}

export const PoolSandboxGuard = async ({ directory }) => {
  const ROOTS = resolveRoots(directory);
  const BLOCK_MSG =
    "Blocked: this disk sandbox is on a pool machine. " +
    "Only __POOL_ROOTS__ persists — " +
    "everything outside will be cleaned after restart. " +
    "Re-run your command inside the studio directory.";
  const INSTALL_MSG_BASE =
    "Blocked: global/system installs do NOT persist on this pool-machine sandbox. " +
    "Only __POOL_ROOTS__ survives restart. " +
    "Install inside the studio instead (never use sudo)";

  function deny(detail) {
    throw new Error(detail ? `${BLOCK_MSG} (${detail})` : BLOCK_MSG);
  }

  function denyInstall(label, hint) {
    throw new Error(hint ? `${INSTALL_MSG_BASE}. (${label}) ${hint}` : `${INSTALL_MSG_BASE}. (${label})`);
  }

  function envInside(name) {
    const v = process.env[name];
    return typeof v === "string" && v.length > 0 && isInside(v, ROOTS);
  }

  // Extract `--flag value` / `--flag=value` / `-f value` option values from a segment.
  // `base` resolves wd-relative values (e.g. `--target ./.libs`).
  function optionValues(seg, names) {
    const out = [];
    for (const n of names) {
      const esc = n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const longEq = new RegExp(`${esc}=([^\\s"']+|"[^"]*"|'[^']*')`, "g");
      let m;
      while ((m = longEq.exec(seg)) !== null) out.push(m[1].replace(/^["']|["']$/g, ""));
      if (n.startsWith("--")) {
        const longSp = new RegExp(`${esc}\\s+([^\\s"']+|"[^"]*"|'[^']*')`, "g");
        while ((m = longSp.exec(seg)) !== null) out.push(m[1].replace(/^["']|["']$/g, ""));
      } else {
        const shortSp = new RegExp(`(?:^|\\s)${esc}\\s+([^\\s"']+|"[^"]*"|'[^']*')`, "g");
        while ((m = shortSp.exec(seg)) !== null) out.push(m[1].replace(/^["']|["']$/g, ""));
      }
    }
    return out;
  }

  function anyOptionInside(seg, names, wd) {
    const base = typeof wd === "string" && wd.length > 0 ? wd : ROOTS[0];
    return optionValues(seg, names).some((v) => {
      const expanded = v.replace(/^~(?=\/|$)/, os.homedir() || ROOTS[0]);
      if (path.isAbsolute(expanded) || expanded.startsWith("~/") || expanded === "~") {
        return isInside(expanded, ROOTS);
      }
      // wd-relative values (./.libs, ./.venv, ../x) resolve against the tool cwd
      if (expanded.startsWith("./") || expanded.startsWith("../") || expanded === "." || expanded === "..") {
        return isInside(path.resolve(base, expanded), ROOTS);
      }
      return false;
    });
  }

  // Split a shell line into per-command segments (rough but good enough for guarding).
  function splitSegments(cmd) {
    return cmd.split(/&&|\|\||[;|\n]+|\$\(/).map((s) => s.trim()).filter(Boolean);
  }

  function stripAssignments(s) {
    let prev;
    do {
      prev = s;
      s = s.replace(/^([A-Za-z_][A-Za-z0-9_]*=(?:"[^"]*"|'[^']*'|[^\s]+)\s+)+/, "").trim();
      s = s.replace(/^(env|command|builtin|time)(\s+|$)/, "").trim();
    } while (s !== prev);
    return s;
  }

  // VAR=val prefixes on the same segment (checked BEFORE stripping, so
  // `GOBIN=~/go/bin go install` counts as studio-local).
  function leadingAssigns(seg) {
    const m = seg.match(/^([A-Za-z_][A-Za-z0-9_]*=(?:"[^"]*"|'[^']*'|[^\s]+)\s+)+/);
    const out = {};
    if (!m) return out;
    const re = /([A-Za-z_][A-Za-z0-9_]*)=("[^"]*"|'[^']*'|[^\s]+)/g;
    let a;
    while ((a = re.exec(m[0])) !== null) out[a[1]] = a[2].replace(/^["']|["']$/g, "");
    return out;
  }

  function assignInside(assigns, names) {
    const home = os.homedir() || process.env.HOME || ROOTS[0];
    for (const n of names) {
      const v = assigns[n];
      if (typeof v === "string" && v.length > 0) {
        const expanded = v.replace(/^~(?=\/|$)/, home);
        if (path.isAbsolute(expanded) && isInside(path.resolve(expanded), ROOTS)) return true;
      }
    }
    return false;
  }

  function argv0Of(segment) {
    const s = stripAssignments(segment);
    const m = s.match(/^([^\s]+)/);
    if (!m) return { argv0: "", raw: "", rest: "", cleaned: s };
    const raw = m[1].replace(/^["']|["']$/g, "");
    const base = raw.split("/").pop().toLowerCase();
    return { argv0: base, raw, rest: s.slice(m[1].length), cleaned: s };
  }

  // Block system-wide / global installs that would be wiped on restart.
  // Runs on the $HOME-expanded command so `$HOME/...` tricks can't hide.
  function checkGlobalInstall(expandedCmd, wd) {
    const base = typeof wd === "string" && wd.length > 0 ? wd : ROOTS[0];
    // `source <inside>/bin/activate && pip install` in the same command means
    // the venv is studio-local even though the server env doesn't show it.
    // Resolve both absolute and wd-relative activate paths.
    let venvSourcedInside = false;
    {
      const actRe = /(?:source\s+|\.\s+)([^\s;"'|]+bin\/activate)/g;
      let am2;
      while ((am2 = actRe.exec(expandedCmd)) !== null) {
        const cand = am2[1].replace(/^["']|["']$/g, "");
        const resolved = path.isAbsolute(cand) ? path.resolve(cand) : path.resolve(base, cand);
        if (isInside(resolved, ROOTS)) { venvSourcedInside = true; break; }
      }
    }
    for (const seg of splitSegments(expandedCmd)) {
      const stripped = stripAssignments(seg);
      if (!stripped) continue;

      // Any sudo/doas elevation = system change outside the studio. Block first.
      if (/^(sudo|doas)\b/.test(stripped)) {
        denyInstall("sudo", "Do not use sudo — redo the install inside ~/ without sudo (e.g. pip --target=~/libs, npm local, venv in ~/).");
      }

      const { argv0, raw, cleaned } = argv0Of(seg);
      if (!argv0) continue;
      const assigns = leadingAssigns(seg);
      const has = (re) => re.test(cleaned);

      // --- system package managers (never persist) ---
      if (["apt", "apt-get", "aptitude", "dpkg", "snap", "yum", "dnf", "microdnf", "pacman", "yay", "paru", "apk", "zypper", "emerge", "rpm", "pkg", "add-apt-repository", "apt-add-repository", "update-alternatives", "systemctl", "service"].includes(argv0)) {
        // Allow read-only queries; block everything that changes the system.
        const readonly =
          (argv0 === "apt" || argv0 === "apt-get") && /^\s*(search|show|list|policy|depends|rdepends|madison|clean\s+--dry-run)\b/.test(cleaned.replace(/^(apt|apt-get)\s+/, " ")) ||
          has(/(^|\s)(--version|-v|\bhelp\b|search|show|list|info|status)\b/) && !has(/(^|\s)(update|upgrade|full-upgrade|dist-upgrade|install|reinstall|remove|purge|autoremove|add|build-dep|source|clean)\b/);
        if (!readonly) {
          denyInstall(argv0, "System packages are wiped on restart — install inside ~/ instead (e.g. pip --target=~/libs, python -m venv ~/venv, npm local, or build from source under ~/).");
        }
        continue;
      }

      // --- Homebrew (HOMEBREW_PREFIX=/home/linuxbrew is outside the studio) ---
      if (argv0 === "brew") {
        if (has(/(^|\s)(install|uninstall|remove|upgrade|update|reinstall|tap|untap|link|unlink|migrate|cleanup)\b/)) {
          denyInstall("brew", "Homebrew is system-wide (wiped) — install inside ~/ instead (build from source or pip/npm local under ~/).");
        }
        continue;
      }

      // --- npm / yarn / pnpm / bun globals ---
      if (argv0 === "npm" && has(/(^|\s)(-g|--global)\b/)) {
        denyInstall("npm -g", "Use a studio-local install instead: `npm i <pkg>` in ~/... or `npm i --prefix ~/... <pkg>` (never -g).");
      }
      if (argv0 === "yarn" && has(/(^|\s)global\b/)) {
        denyInstall("yarn global", "Use `yarn add <pkg>` inside ~/... instead of `yarn global`.");
      }
      if ((argv0 === "pnpm" || argv0 === "bun") && has(/(^|\s)(-g|--global)\b/)) {
        denyInstall(`${argv0} -g`, `Use \`${argv0} add <pkg>\` inside ~/... instead of -g/--global.`);
      }

      // --- pip / uv (global site-packages here is /home/zeus/... = wiped) ---
      const isPipInvoke =
        argv0 === "pip" || argv0 === "pip3" ||
        ((argv0 === "python" || argv0 === "python3" || argv0 === "uv") && has(/\bpip\s+install\b/)) ||
        (argv0 === "uv" && has(/(^|\s)(add|pip)\b/));
      if (isPipInvoke) {
        const readonlyPip = has(/(^|\s)(list|show|freeze|check|--version|-V|\bhelp\b)\b/) && !has(/(^|\s)install\b/);
        if (!readonlyPip && has(/(^|\s)install\b/)) {
          const localTarget = anyOptionInside(cleaned, ["--target", "-t", "--prefix", "--root"], base);
          // A venv pip binary inside the studio installs into that venv (persists).
          // e.g. `tor-proxy-toolkit/.venv/bin/pip install`, `~/venv/bin/pip install`,
          // `__POOL_ROOT__/.../pip install`, `.venv/bin/python -m pip install`
          let pipBinaryInside = false;
          if (raw && raw.includes("/")) {
            const expandedRaw = raw.replace(/^~(?=\/|$)/, os.homedir() || ROOTS[0]);
            const resolvedBin = path.isAbsolute(expandedRaw) ? path.resolve(expandedRaw) : path.resolve(base, expandedRaw);
            pipBinaryInside = isInside(resolvedBin, ROOTS);
          }
          const inlineVenvInside = /^\s*(VIRTUAL_ENV|CONDA_PREFIX|UV_PROJECT_ENVIRONMENT|PIP_TARGET)=([^\s]+)/.test(seg) &&
            isInside(seg.match(/^\s*(?:VIRTUAL_ENV|CONDA_PREFIX|UV_PROJECT_ENVIRONMENT|PIP_TARGET)=([^\s]+)/)[1].replace(/^["']|["']$/g, "").replace(/^~(?=\/|$)/, os.homedir() || ROOTS[0]), ROOTS);
          const venvInside = pipBinaryInside || inlineVenvInside || venvSourcedInside || envInside("VIRTUAL_ENV") || envInside("CONDA_PREFIX") || envInside("UV_PROJECT_ENVIRONMENT") || envInside("PIP_TARGET") || envInside("PYTHONUSERBASE");
          if (!localTarget && !venvInside) {
            denyInstall("pip install", "Site-packages here is outside ~/ (wiped). Use `python -m venv ~/venv && source ~/venv/bin/activate` then pip install, or `pip install --target=~/libs <pkg>`.");
          }
        }
        continue;
      }

      // --- pipx (installs under ~/.local -> /home/zeus/.local = wiped) ---
      if (argv0 === "pipx" && has(/(^|\s)(install|inject|upgrade|reinstall)\b/)) {
        denyInstall("pipx", "pipx targets ~/.local (outside ~/ here, wiped). Use `python -m venv ~/venv` + pip, or `pip install --target=~/libs` instead.");
      }

      // --- cargo / go / gem / cpan ---
      if (argv0 === "cargo" && has(/(^|\s)install\b/)) {
        if (!envInside("CARGO_HOME") && !assignInside(assigns, ["CARGO_HOME"]) && !anyOptionInside(cleaned, ["--root"], base)) {
          denyInstall("cargo install", "Set `export CARGO_HOME=~/.cargo` (inside studio) first, or `cargo install --root ~/...`.");
        }
      }
      if (argv0 === "go" && has(/(^|\s)install\b/)) {
        if (!envInside("GOBIN") && !envInside("GOPATH") && !assignInside(assigns, ["GOBIN", "GOPATH"])) {
          denyInstall("go install", "Set `export GOBIN=~/go/bin` (inside studio) first.");
        }
      }
      if (argv0 === "gem" && has(/(^|\s)install\b/)) {
        if (!envInside("GEM_HOME") && !assignInside(assigns, ["GEM_HOME"]) && !anyOptionInside(cleaned, ["--install-dir", "--bindir"], base)) {
          denyInstall("gem install", "Set `export GEM_HOME=~/.gem` (inside studio) first, or `gem install --install-dir ~/...`.");
        }
      }
      if (argv0 === "cpan" || argv0 === "cpanm") {
        denyInstall(argv0, "Install Perl modules with local::lib under ~/ instead of system-wide.");
      }

      // --- make / cmake / meson installs default to /usr/local (wiped) ---
      if (argv0 === "make" && has(/(^|\s)install\b/)) {
        if (!has(/\bPREFIX=~?\//) && !has(/\bPREFIX=__POOL_ROOT_RX__//) && !has(/\bDESTDIR=/) ) {
          denyInstall("make install", "Use `make install PREFIX=~/...` so files land inside the studio.");
        }
      }
      if (argv0 === "cmake" && has(/(^|\s)--install\b/)) {
        if (!anyOptionInside(cleaned, ["--prefix"], base)) {
          denyInstall("cmake --install", "Use `cmake --install ... --prefix ~/...` so files land inside the studio.");
        }
      }
      if (argv0 === "meson" && has(/(^|\s)install\b/)) {
        denyInstall("meson install", "Reconfigure with `-Dprefix=~/...` so install lands inside the studio.");
      }
      if (argv0 === "ninja" && has(/(^|\s)install\b/)) {
        denyInstall("ninja install", "Reconfigure the build with prefix under ~/ so install lands inside the studio.");
      }
    }
  }

  function checkPath(value, detail) {
    if (typeof value !== "string" || value.length === 0) return;
    // Relative paths resolve against the tool cwd at runtime; the bash/workdir
    // and cd-target checks below cover escapes. Only absolute + ~/ paths can
    // be judged statically here.
    if (value === "~" || value.startsWith("~/") || path.isAbsolute(value)) {
      if (!isInside(value, ROOTS)) deny(`${detail}: ${value}`);
    }
  }

  return {
    "tool.execute.before": async (input, output) => {
      const args = output?.args ?? {};
      const tool = input?.tool ?? "";

      // 1) Direct path-like arguments (read/edit/write/glob/grep/bash workdir/...).
      const pathKeys = [
        "filePath",
        "file",
        "filename",
        "filepath",
        "path",
        "dir",
        "directory",
        "root",
        "workdir",
        "cwd",
        "workingDirectory",
        "basePath",
        "folder",
        "pattern", // glob/grep sometimes carry a path here
      ];
      for (const k of pathKeys) {
        const v = args[k];
        if (typeof v === "string") checkPath(v, `${tool}.${k}`);
        else if (Array.isArray(v)) {
          for (const item of v) {
            if (typeof item === "string") checkPath(item, `${tool}.${k}`);
          }
        }
      }

      // apply_patch embeds paths inside patchText markers.
      if (typeof args.patchText === "string") {
        const re = /^\*\*\* (?:Add File|Update File|Move to|Delete File|Rename from|Rename to):\s*(.+?)\s*$/gm;
        let m;
        while ((m = re.exec(args.patchText)) !== null) {
          checkPath(m[1].trim(), `${tool}.patchText`);
        }
      }

      // 2) bash: workdir + command text.
      if (tool === "bash") {
        const cmd = typeof args.command === "string" ? args.command : "";
        const wd =
          (typeof args.workdir === "string" && args.workdir) ||
          (typeof args.cwd === "string" && args.cwd) ||
          (typeof args.dir === "string" && args.dir) ||
          directory ||
          ROOTS[0];

        if (typeof wd === "string" && (path.isAbsolute(wd) || wd === "~" || wd.startsWith("~/"))) {
          if (!isInside(wd, ROOTS)) deny(`bash.workdir outside studio: ${wd}`);
        }

        // Resolve cd/pushd targets against the workdir to catch `cd ..` escapes.
        const base = typeof wd === "string" ? wd.replace(/^~(?=\/|$)/, os.homedir() || ROOTS[0]) : ROOTS[0];
        for (const target of extractCdTargets(cmd)) {
          const expanded = target === "~" || target.startsWith("~/")
            ? target.replace(/^~(?=\/|$)/, os.homedir() || ROOTS[0])
            : target;
          const resolved = path.isAbsolute(expanded) ? path.resolve(expanded) : path.resolve(base, expanded);
          if (!isInside(resolved, ROOTS)) deny(`bash cd outside studio: ${target}`);
        }

        // Any absolute path literal in the command outside the studio.
        // Expand $HOME / ${HOME} first so `$HOME/../../tmp` can't smuggle an escape.
        const homeDir = os.homedir() || process.env.HOME || ROOTS[0];
        const expandedCmd = cmd
          .replace(/\$\{HOME\}/g, homeDir)
          .replace(/\$HOME(?=\/|$)/g, homeDir)
          .replace(/(^|[\s;&|(=])~(?=\/|$)/g, `$1${homeDir}`);
        // Global/system installs never persist here — redirect into ~/.
        checkGlobalInstall(expandedCmd, base);
        for (const p of extractAbsolutePaths(expandedCmd)) {
          if (!isInside(p, ROOTS)) deny(`bash path outside studio: ${p}`);
        }

        // `VAR=/outside/path` assignments (e.g. OUT=/tmp/x) also write outside.
        const assignRe = /(?:^|[;\s&|])([A-Za-z_][A-Za-z0-9_]*)=(\/[A-Za-z0-9._~+/-]*)/g;
        let am;
        while ((am = assignRe.exec(expandedCmd)) !== null) {
          if (!isInside(am[2], ROOTS)) deny(`bash ${am[1]} outside studio: ${am[2]}`);
        }
      } else {
        // 3) Other tools: be strict if any string arg is an absolute path outside.
        // (Covers lsp, custom tools, MCP tools that take paths.)
        const stack = [args];
        let scanned = 0;
        while (stack.length > 0 && scanned < 50) {
          const cur = stack.pop();
          scanned++;
          if (typeof cur === "string") {
            if (cur.length > 1 && (cur.startsWith("/") || cur === "~" || cur.startsWith("~/"))) {
              // Only treat it as a path if it looks like one (avoid flagging
              // regexes/URLs like "/foo/i" or "https://...").
              if (/^~(\/|$)|^\/(?!\/)[A-Za-z0-9._~+/-]*$/.test(cur) && cur.includes("/") && !cur.includes("://")) {
                if (!isInside(cur, ROOTS)) deny(`${tool} path outside studio: ${cur}`);
              }
            }
          } else if (Array.isArray(cur)) {
            for (const item of cur) stack.push(item);
          } else if (cur && typeof cur === "object") {
            for (const v of Object.values(cur)) stack.push(v);
          }
        }
      }
    },
  };
};

export default PoolSandboxGuard;
