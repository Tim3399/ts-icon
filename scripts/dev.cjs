const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
const children = [];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (!child.pid) continue;
    if (process.platform === "win32") {
      spawnSync("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
        stdio: "ignore",
        windowsHide: true,
      });
    } else {
      try {
        process.kill(-child.pid, "SIGTERM");
      } catch {
        /* Child already exited. */
      }
    }
  }
  process.exitCode = code;
}
for (const [label, args, cwd] of [
  [
    "public",
    [
      require.resolve("@nestjs/cli/bin/nest.js"),
      "start",
      "--watch",
      "--path",
      "tsconfig.dev.public.json",
      "--entryFile",
      "main.public",
    ],
    root,
  ],
  [
    "admin",
    [
      require.resolve("@nestjs/cli/bin/nest.js"),
      "start",
      "--watch",
      "--path",
      "tsconfig.dev.local.json",
      "--entryFile",
      "main.local",
    ],
    root,
  ],
  [
    "frontend",
    [path.join(root, "webapp-banner-tool/node_modules/vite/bin/vite.js"), "--host", "127.0.0.1"],
    path.join(root, "webapp-banner-tool"),
  ],
]) {
  const child = spawn(process.execPath, args, {
    cwd,
    stdio: "inherit",
    windowsHide: true,
    detached: process.platform !== "win32",
  });
  children.push(child);
  child.on("error", (error) => {
    console.error(`${label}: ${error.message}`);
    stop(1);
  });
  child.on("exit", (code) => {
    if (!stopping) {
      console.error(`${label} stopped (${code}).`);
      stop(code || 1);
    }
  });
}
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
