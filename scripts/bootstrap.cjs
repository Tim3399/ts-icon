const fs = require("node:fs");
const path = require("node:path");
const { runNpm } = require("./lib/npm.cjs");
const root = path.resolve(__dirname, "..");
const local = process.argv.includes("--local");

// TS_MOCK_MODE=true replaces the TeamSpeak server, so its credentials are not needed (as isTsMockMode() in config.ts).
function checkEnv(env) {
  const keys =
    env.TS_MOCK_MODE === "true"
      ? ["PUBLIC_BASE_URL"]
      : ["TS_USERNAME", "TS_USERPASSWORD", "PUBLIC_BASE_URL"];
  for (const key of keys) {
    if (!env[key]) throw new Error(`Set ${key} in .env, then run setup again.`);
  }
  if (env.AUTH_DISABLED !== "true") {
    for (const key of ["OIDC_ISSUER_URL", "OIDC_AUDIENCE"]) {
      if (!env[key] || env[key].includes("your-")) {
        throw new Error(`Set ${key} in .env for Keycloak, or use the documented localhost mode.`);
      }
    }
  }
}

module.exports = { checkEnv };
function main() {
  try {
    const [major, minor] = process.versions.node.split(".").map(Number);
    if (major !== 22 || minor < 22) throw new Error("Use Node 22.22+ (see .nvmrc).");
    for (const directory of [root, path.join(root, "webapp-banner-tool")]) {
      const target = path.join(directory, ".env");
      if (!fs.existsSync(target)) {
        let contents = fs.readFileSync(path.join(directory, ".env.example"), "utf8");
        if (local)
          contents = contents
            .replace("AUTH_DISABLED=false", "AUTH_DISABLED=true")
            .replace("VITE_KEYCLOAK_ENABLED=true", "VITE_KEYCLOAK_ENABLED=false");
        fs.writeFileSync(target, contents, { flag: "wx" });
        console.log(`Created ${target}. Fill in TeamSpeak credentials and deployment settings.`);
      }
    }
    runNpm(["ci"], root);
    runNpm(["ci"], path.join(root, "webapp-banner-tool"));
    require("dotenv").config({ path: path.join(root, ".env"), quiet: true });
    checkEnv(process.env);
    runNpm(["run", "db:generate"], root);
    runNpm(["run", "db:migrate"], root);
    runNpm(["run", "build"], root);
    console.log("Setup complete. Run npm run dev; open http://localhost:5173.");
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

if (require.main === module) main();
