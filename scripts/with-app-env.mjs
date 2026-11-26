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
  } catch (error) {
    console.warn("Could not read .grok/app-env.json:", error);
  }
}

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("Usage: node scripts/with-app-env.mjs <command> [...args]");
  process.exit(1);
}

// Invoke Vite's JavaScript entry point with Node. This avoids Windows
// spawn() failures when the npm executable is exposed as vite.cmd.
if (args[0] === "vite") {
  args[0] = resolve(process.cwd(), "node_modules/vite/bin/vite.js");
  args.unshift(process.execPath);
}

const child = spawn(args[0], args.slice(1), {
  stdio: "inherit",
  env: { ...process.env, ...extraEnv },
  shell: false,
});

child.on("error", (error) => {
  console.error(`Failed to start command "${args[0]}":`, error);
  process.exitCode = 1;
});

child.on("exit", (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0);
});
