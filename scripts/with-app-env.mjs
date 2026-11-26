#!/usr/bin/env node
import { spawn } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const envPath = resolve(process.cwd(), ".grok/app-env.json");
let extraEnv = {};
if (existsSync(envPath)) {
  try {
    const data = JSON.parse(readFileSync(envPath, "utf8"));
    for (const [k, v] of Object.entries(data)) {
      if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
        extraEnv[k] = String(v);
      }
    }
    if (data.deploy) {
      // pass through
    }
  } catch {}
}

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("Usage: node scripts/with-app-env.mjs <command> [...args]");
  process.exit(1);
}

const child = spawn(args[0], args.slice(1), {
  stdio: "inherit",
  env: { ...process.env, ...extraEnv },
  shell: false,
});

child.on("exit", (code) => process.exit(code ?? 1));
