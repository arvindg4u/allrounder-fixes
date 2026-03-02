#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const DEFAULT_APP_BASE_URL = "http://localhost:3000";

function printUsage() {
  console.log(`Alias Login Control CLI

Usage:
  npm run control -- <command> [options]

Commands:
  health
    --base-url <url>

  aliases:list
    --owner-email <email>
    --status <active|paused|disabled>
    --base-url <url>

  aliases:create
    --owner-email <email>
    --alias-email <email>
    --destination-email <email>
    --label <text>
    --base-url <url>
    --idempotency-key <key>

  aliases:create-random
    --owner-email <email>
    --destination-email <email>
    --alias-domain <domain>
    --alias-prefix <text>
    --length <number>
    --label <text>
    --base-url <url>
    --idempotency-key <key>

  aliases:toggle
    --owner-email <email>
    --alias-id <uuid>
    --status <active|paused|disabled>
    --base-url <url>
    --idempotency-key <key>

  aliases:delete
    --owner-email <email>
    --alias-id <uuid>
    --yes
    --base-url <url>
    --idempotency-key <key>

  auth:request-link
    --email <email>
    --redirect-to <url>
    --base-url <url>
    --idempotency-key <key>

  auth:verify
    --token <token>
    --redirect-to <url>
    --base-url <url>

  mail:inbound:test
    --from-email <email>
    --to-email <alias-email>
    --subject <text>
    --text <text>
    --provider-event-id <id>
    --base-url <url>
    --inbound-token <token>         (optional unless ENFORCE_API_TOKENS=true)
    --inbound-signing-secret <secret>

  mail:jobs:list
    --owner-email <email>
    --status <pending|processing|sent|failed|skipped>
    --limit <number>
    --base-url <url>
    --control-token <token>

  mail:worker:run
    --limit <number>
    --base-url <url>
    --worker-token <token>          (optional unless ENFORCE_API_TOKENS=true)

  config:check
    --base-url <url>

Global Reliability Options:
  --retries <number>         (default: 2)
  --retry-delay-ms <number>  (default: 500)
`);
}

function parseArgs(rawArgs) {
  const [command, ...rest] = rawArgs;
  const options = {};

  for (let i = 0; i < rest.length; i += 1) {
    const token = rest[i];
    if (!token.startsWith("--")) {
      throw new Error(`Unexpected token: ${token}`);
    }

    const key = token.slice(2);
    const next = rest[i + 1];
    if (!next || next.startsWith("--")) {
      options[key] = true;
      continue;
    }

    options[key] = next;
    i += 1;
  }

  return { command, options };
}

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const content = fs.readFileSync(filePath, "utf8");
  const lines = content.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

function loadLocalEnv() {
  const cwd = process.cwd();
  readEnvFile(path.join(cwd, ".env.local"));
  readEnvFile(path.join(cwd, ".env"));
}

function requireOption(options, key) {
  const value = options[key];
  if (!value || typeof value !== "string") {
    throw new Error(`Missing required option --${key}`);
  }
  return value;
}

function getStringOption(options, key) {
  const value = options[key];
  return typeof value === "string" ? value : undefined;
}

function getNumberOption(options, key, defaultValue) {
  const value = getStringOption(options, key);
  if (value === undefined) {
    return defaultValue;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Invalid number for --${key}: ${value}`);
  }

  return parsed;
}

function getBaseUrl(options) {
  const baseUrl =
    getStringOption(options, "base-url") ||
    process.env.NEXT_PUBLIC_APP_URL ||
    DEFAULT_APP_BASE_URL;

  return String(baseUrl).replace(/\/$/, "");
}

function getRetryConfig(options) {
  return {
    retries: getNumberOption(options, "retries", 2),
    retryDelayMs: getNumberOption(options, "retry-delay-ms", 500),
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldRetryStatus(status) {
  return status === 429 || status >= 500;
}

function isRedirectStatus(status) {
  return [301, 302, 303, 307, 308].includes(status);
}

async function httpRequest({
  url,
  method = "GET",
  headers = {},
  body,
  redirect = "follow",
  retries,
  retryDelayMs,
}) {
  let attempt = 0;
  let lastError;

  while (attempt <= retries) {
    try {
      const response = await fetch(url, {
        method,
        headers,
        body:
          body === undefined
            ? undefined
            : typeof body === "string"
              ? body
              : JSON.stringify(body),
        redirect,
      });

      const contentType = response.headers.get("content-type") || "";
      let payload;
      if (contentType.includes("application/json")) {
        payload = await response.json();
      } else {
        payload = await response.text();
      }

      const result = {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        payload,
        request: {
          url: String(url),
          method,
          attempt: attempt + 1,
        },
      };

      if (shouldRetryStatus(response.status) && attempt < retries) {
        await sleep(retryDelayMs * Math.pow(2, attempt));
        attempt += 1;
        continue;
      }

      return result;
    } catch (error) {
      lastError = error;

      if (attempt >= retries) {
        throw error;
      }

      await sleep(retryDelayMs * Math.pow(2, attempt));
      attempt += 1;
    }
  }

  throw lastError;
}

async function appApiRequest({
  baseUrl,
  endpoint,
  method = "GET",
  query = {},
  body,
  rawBody,
  headers = {},
  redirect = "follow",
  retry,
}) {
  const url = new URL(endpoint, baseUrl);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value));
    }
  }

  return httpRequest({
    url,
    method,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: rawBody !== undefined ? rawBody : body,
    redirect,
    retries: retry.retries,
    retryDelayMs: retry.retryDelayMs,
  });
}

function getIdempotencyStorePath() {
  const customPath = process.env.CONTROL_IDEMPOTENCY_STORE;
  if (customPath) {
    return customPath;
  }

  const dir = path.join(process.cwd(), ".control");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  return path.join(dir, "idempotency-store.json");
}

function readIdempotencyStore() {
  const storePath = getIdempotencyStorePath();
  if (!fs.existsSync(storePath)) {
    return {};
  }

  try {
    return JSON.parse(fs.readFileSync(storePath, "utf8"));
  } catch {
    return {};
  }
}

function writeIdempotencyStore(store) {
  const storePath = getIdempotencyStorePath();
  fs.writeFileSync(storePath, JSON.stringify(store, null, 2));
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  if (value && typeof value === "object") {
    const keys = Object.keys(value).sort();
    const entries = keys.map((key) => `"${key}":${stableStringify(value[key])}`);
    return `{${entries.join(",")}}`;
  }

  return JSON.stringify(value);
}

function computeIdempotencyKey(command, input) {
  const raw = `${command}:${stableStringify(input)}`;
  return crypto.createHash("sha256").update(raw).digest("hex");
}

async function runIdempotentAction({ command, options, input, execute }) {
  const explicitKey = getStringOption(options, "idempotency-key");
  const key = explicitKey || computeIdempotencyKey(command, input);
  const store = readIdempotencyStore();
  const cached = store[key];

  if (cached && cached.command === command && cached.success === true) {
    return {
      ...cached.result,
      idempotency: {
        key,
        source: "cache",
        createdAt: cached.createdAt,
      },
    };
  }

  const result = await execute();

  if (result.ok) {
    store[key] = {
      command,
      success: true,
      createdAt: new Date().toISOString(),
      result,
    };
    writeIdempotencyStore(store);
  }

  return {
    ...result,
    idempotency: {
      key,
      source: explicitKey ? "explicit" : "derived",
    },
  };
}

function generateRandomAliasEmail(options) {
  const domain =
    getStringOption(options, "alias-domain") || process.env.ALIAS_DOMAIN;
  if (!domain) {
    throw new Error(
      "Missing alias domain. Pass --alias-domain or set ALIAS_DOMAIN in env",
    );
  }

  const prefix = getStringOption(options, "alias-prefix") || "alias";
  const length = getNumberOption(options, "length", 10);
  if (length < 6 || length > 30) {
    throw new Error("--length must be between 6 and 30");
  }

  const explicitIdempotencyKey = getStringOption(options, "idempotency-key");
  let randomPart;

  if (explicitIdempotencyKey) {
    randomPart = crypto
      .createHash("sha256")
      .update(explicitIdempotencyKey)
      .digest("hex")
      .slice(0, length);
  } else {
    randomPart = crypto.randomBytes(Math.ceil(length / 2)).toString("hex").slice(0, length);
  }

  return `${prefix}-${randomPart}@${domain}`.toLowerCase();
}

function sanitizeStatus(status) {
  if (!status) {
    return undefined;
  }

  const normalized = status.toLowerCase();
  if (!["active", "paused", "disabled"].includes(normalized)) {
    throw new Error("Status must be one of: active, paused, disabled");
  }

  return normalized;
}

function sanitizeMailJobStatus(status) {
  if (!status) {
    return undefined;
  }

  const normalized = status.toLowerCase();
  if (!["pending", "processing", "sent", "failed", "skipped"].includes(normalized)) {
    throw new Error("Mail status must be one of: pending, processing, sent, failed, skipped");
  }

  return normalized;
}

function getControlToken(options) {
  return (
    getStringOption(options, "control-token") ||
    process.env.CONTROL_API_TOKEN ||
    undefined
  );
}

function getInboundToken(options) {
  return (
    getStringOption(options, "inbound-token") ||
    process.env.INBOUND_WEBHOOK_TOKEN ||
    undefined
  );
}

function getWorkerToken(options) {
  return (
    getStringOption(options, "worker-token") ||
    process.env.MAIL_WORKER_TOKEN ||
    undefined
  );
}

function areApiTokensEnforced() {
  const raw = (process.env.ENFORCE_API_TOKENS || "").toLowerCase();
  return raw === "true" || raw === "1" || raw === "yes";
}

function buildInboundSignature(rawBody, secret) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");

  return { timestamp, signature: `sha256=${signature}` };
}

async function run() {
  loadLocalEnv();

  const { command, options } = parseArgs(process.argv.slice(2));
  if (!command || command === "help" || command === "--help") {
    printUsage();
    process.exit(0);
  }

  const baseUrl = getBaseUrl(options);
  const retry = getRetryConfig(options);
  const controlToken = getControlToken(options);
  const controlHeaders = controlToken ? { "x-control-token": controlToken } : {};
  let result;

  switch (command) {
    case "health":
      result = await appApiRequest({
        baseUrl,
        endpoint: "/api/health",
        retry,
      });
      break;

    case "aliases:list":
      result = await appApiRequest({
        baseUrl,
        endpoint: "/api/aliases",
        headers: controlHeaders,
        query: {
          ownerEmail: requireOption(options, "owner-email"),
          status: sanitizeStatus(getStringOption(options, "status")),
        },
        retry,
      });
      break;

    case "aliases:create":
      result = await runIdempotentAction({
        command,
        options,
        input: {
          ownerEmail: requireOption(options, "owner-email"),
          aliasEmail: requireOption(options, "alias-email"),
          destinationEmail: requireOption(options, "destination-email"),
          label: getStringOption(options, "label"),
        },
        execute: () =>
          appApiRequest({
            baseUrl,
            endpoint: "/api/aliases",
            method: "POST",
            headers: controlHeaders,
            body: {
              ownerEmail: requireOption(options, "owner-email"),
              aliasEmail: requireOption(options, "alias-email"),
              destinationEmail: requireOption(options, "destination-email"),
              label: getStringOption(options, "label"),
            },
            retry,
          }),
      });
      break;

    case "aliases:create-random": {
      const aliasEmail = generateRandomAliasEmail(options);
      result = await runIdempotentAction({
        command,
        options,
        input: {
          ownerEmail: requireOption(options, "owner-email"),
          destinationEmail: requireOption(options, "destination-email"),
          aliasEmail,
          label: getStringOption(options, "label"),
        },
        execute: () =>
          appApiRequest({
            baseUrl,
            endpoint: "/api/aliases",
            method: "POST",
            headers: controlHeaders,
            body: {
              ownerEmail: requireOption(options, "owner-email"),
              destinationEmail: requireOption(options, "destination-email"),
              aliasEmail,
              label: getStringOption(options, "label"),
            },
            retry,
          }),
      });
      break;
    }

    case "aliases:toggle": {
      const status = sanitizeStatus(getStringOption(options, "status"));
      result = await runIdempotentAction({
        command,
        options,
        input: {
          ownerEmail: requireOption(options, "owner-email"),
          aliasId: requireOption(options, "alias-id"),
          status: status || "toggle",
        },
        execute: () =>
          appApiRequest({
            baseUrl,
            endpoint: `/api/aliases/${requireOption(options, "alias-id")}`,
            method: "PATCH",
            headers: controlHeaders,
            body: {
              ownerEmail: requireOption(options, "owner-email"),
              status,
              action: status ? undefined : "toggle",
            },
            retry,
          }),
      });
      break;
    }

    case "aliases:delete": {
      if (!options.yes) {
        throw new Error("Deletion guard: pass --yes to confirm alias delete");
      }

      result = await runIdempotentAction({
        command,
        options,
        input: {
          ownerEmail: requireOption(options, "owner-email"),
          aliasId: requireOption(options, "alias-id"),
        },
        execute: () =>
          appApiRequest({
            baseUrl,
            endpoint: `/api/aliases/${requireOption(options, "alias-id")}`,
            method: "DELETE",
            headers: controlHeaders,
            body: {
              ownerEmail: requireOption(options, "owner-email"),
            },
            retry,
          }),
      });
      break;
    }

    case "auth:request-link":
      result = await runIdempotentAction({
        command,
        options,
        input: {
          email: requireOption(options, "email"),
          redirectTo: getStringOption(options, "redirect-to"),
        },
        execute: () =>
          appApiRequest({
            baseUrl,
            endpoint: "/api/auth/request-login-link",
            method: "POST",
            headers: controlHeaders,
            body: {
              email: requireOption(options, "email"),
              redirectTo: getStringOption(options, "redirect-to"),
            },
            retry,
          }),
      });
      break;

    case "auth:verify":
      result = await appApiRequest({
        baseUrl,
        endpoint: "/auth/verify",
        method: "GET",
        query: {
          token: requireOption(options, "token"),
          redirectTo: getStringOption(options, "redirect-to"),
        },
        redirect: "manual",
        retry,
      });
      if (isRedirectStatus(result.status)) {
        result = {
          ...result,
          ok: true,
          redirect: {
            location: result.headers.location || null,
          },
        };
      }
      break;

    case "mail:inbound:test": {
      const inboundToken = getInboundToken(options);
      if (!inboundToken && areApiTokensEnforced()) {
        throw new Error(
          "Missing inbound token. Pass --inbound-token or set INBOUND_WEBHOOK_TOKEN",
        );
      }

      const payload = {
        from: requireOption(options, "from-email"),
        to: requireOption(options, "to-email"),
        subject: getStringOption(options, "subject") || "Alias inbound test",
        text:
          getStringOption(options, "text") ||
          "CLI inbound test payload",
      };
      const rawBody = JSON.stringify(payload);
      const headers = {
        "x-provider-event-id":
          getStringOption(options, "provider-event-id") || crypto.randomUUID(),
      };
      if (inboundToken) {
        headers["x-inbound-token"] = inboundToken;
      }

      const inboundSigningSecret =
        getStringOption(options, "inbound-signing-secret") ||
        process.env.INBOUND_SIGNING_SECRET;
      if (inboundSigningSecret) {
        const signature = buildInboundSignature(rawBody, inboundSigningSecret);
        headers["x-inbound-ts"] = signature.timestamp;
        headers["x-inbound-signature"] = signature.signature;
      }

      result = await appApiRequest({
        baseUrl,
        endpoint: "/api/mail/inbound",
        method: "POST",
        headers,
        rawBody,
        retry,
      });
      break;
    }

    case "mail:jobs:list":
      result = await appApiRequest({
        baseUrl,
        endpoint: "/api/mail/jobs",
        headers: controlHeaders,
        query: {
          ownerEmail: requireOption(options, "owner-email"),
          status: sanitizeMailJobStatus(getStringOption(options, "status")),
          limit: getNumberOption(options, "limit", 25),
        },
        retry,
      });
      break;

    case "mail:worker:run": {
      const workerToken = getWorkerToken(options);
      if (!workerToken && areApiTokensEnforced()) {
        throw new Error(
          "Missing worker token. Pass --worker-token or set MAIL_WORKER_TOKEN",
        );
      }

      const workerHeaders = {};
      if (workerToken) {
        workerHeaders["x-worker-token"] = workerToken;
      }

      result = await appApiRequest({
        baseUrl,
        endpoint: "/api/mail/worker/run",
        method: "POST",
        headers: workerHeaders,
        body: {
          limit: getNumberOption(options, "limit", 10),
        },
        retry,
      });
      break;
    }

    case "config:check":
      result = {
        ok: true,
        status: 200,
        statusText: "OK",
        payload: {
          baseUrl,
          retry,
          env: {
            NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || null,
            NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || null,
            NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
              process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ? "[set]" : null,
            SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY
              ? "[set]"
              : null,
            ALIAS_DOMAIN: process.env.ALIAS_DOMAIN || null,
            CONTROL_API_TOKEN: process.env.CONTROL_API_TOKEN ? "[set]" : null,
            INBOUND_WEBHOOK_TOKEN: process.env.INBOUND_WEBHOOK_TOKEN
              ? "[set]"
              : null,
            INBOUND_SIGNING_SECRET: process.env.INBOUND_SIGNING_SECRET
              ? "[set]"
              : null,
            MAIL_WORKER_TOKEN: process.env.MAIL_WORKER_TOKEN ? "[set]" : null,
            OUTBOUND_RELAY_MODE: process.env.OUTBOUND_RELAY_MODE || "log",
            RESEND_API_KEY: process.env.RESEND_API_KEY ? "[set]" : null,
            MAIL_RELAY_FROM: process.env.MAIL_RELAY_FROM || null,
            CONTROL_IDEMPOTENCY_STORE:
              process.env.CONTROL_IDEMPOTENCY_STORE || getIdempotencyStorePath(),
          },
        },
      };
      break;

    default:
      throw new Error(`Unknown command: ${command}`);
  }

  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) {
    process.exitCode = 1;
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  printUsage();
  process.exit(1);
});
