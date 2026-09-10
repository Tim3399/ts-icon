const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

function npmCli() {
  const candidates = [
    process.env.npm_execpath,
    path.join(path.dirname(process.execPath), "node_modules/npm/bin/npm-cli.js"),
    path.resolve(path.dirname(process.execPath), "../lib/node_modules/npm/bin/npm-cli.js"),
  ].filter(Boolean);
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) throw new Error("npm CLI not found. Run this command through npm run.");
  return found;
}

function runNpm(args, cwd, env = process.env) {
  const result = spawnSync(process.execPath, [npmCli(), ...args], {
    cwd,
    env,
    stdio: "inherit",
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`npm ${args.join(" ")} failed (${result.status}).`);
}

module.exports = { npmCli, runNpm };
