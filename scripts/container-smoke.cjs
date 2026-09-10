const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { randomUUID } = require("node:crypto");

const suffix = randomUUID().slice(0, 8);
const network = `ts-icon-smoke-${suffix}`;
const volume = `${network}-data`;
const containers = [];
const backend = process.env.SMOKE_BACKEND_IMAGE || "ts-icon-backend:ci";
const frontend = process.env.SMOKE_FRONTEND_IMAGE || "ts-icon-frontend:ci";
const tools = process.env.SMOKE_TOOLS_IMAGE || "ts-icon-tools:ci";

function docker(args, tolerateFailure = false) {
  const result = spawnSync("docker", args, { encoding: "utf8", timeout: 60000, windowsHide: true });
  if (!tolerateFailure && (result.error || result.status !== 0)) {
    throw new Error(
      `docker ${args[0]} failed: ${result.error?.message || result.stderr || result.stdout}`,
    );
  }
  return result.stdout?.trim() || "";
}
function tool(args) {
  return docker([
    "run",
    "--rm",
    "--network",
    network,
    "-v",
    `${volume}:/data`,
    "-e",
    "DATABASE_URL=file:/data/dev.db",
    tools,
    ...args,
  ]);
}
function start(name, image, port, environment, aliases = []) {
  const id = docker([
    "run",
    "--detach",
    "--name",
    `${network}-${name}`,
    "--network",
    network,
    ...aliases.flatMap((alias) => ["--network-alias", alias]),
    "-p",
    `127.0.0.1::${port}`,
    "-v",
    `${volume}:/data`,
    ...Object.entries(environment).flatMap(([key, value]) => ["-e", `${key}=${value}`]),
    image,
    ...(name === "frontend"
      ? []
      : ["npm", "run", name === "public" ? "start:public" : "start:local"]),
  ]);
  containers.push(id);
  const binding = docker(["port", id, String(port)]).split("\n")[0];
  return { id, url: `http://${binding}` };
}
function request(url, options = {}) {
  return fetch(url, { ...options, signal: options.signal || AbortSignal.timeout(5000) });
}
async function ready(url) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    try {
      const response = await request(url, { signal: AbortSignal.timeout(1500) });
      if (response.status === 200) return;
    } catch {
      /* Startup is still in progress. */
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Readiness timed out: ${url}`);
}

async function main() {
  try {
    docker(["network", "create", network]);
    docker(["volume", "create", volume]);
    console.log(tool(["npm", "run", "db:migrate"]));
    console.log(
      tool([
        "node",
        "-e",
        `
      const fs=require('node:fs'); const crypto=require('node:crypto');
      const {PrismaClient}=require('@prisma/client'); const {PrismaBetterSqlite3}=require('@prisma/adapter-better-sqlite3');
      const prisma=new PrismaClient({adapter:new PrismaBetterSqlite3({url:'/data/dev.db'})});
      (async()=>{const image=await require('sharp')({create:{width:500,height:44,channels:4,background:'#3584e4'}}).png().toBuffer();
      await prisma.channelImage.create({data:{channelId:'101',channelName:'CI smoke',image,mimeType:'image/png',size:image.length,contentHash:crypto.createHash('sha256').update(image).digest('hex')}});
      await prisma.$disconnect(); fs.chownSync('/data',1000,1000); fs.chownSync('/data/dev.db',1000,1000);})().catch(e=>{console.error(e);process.exitCode=1});
    `,
      ]),
    );
    console.log(tool(["npm", "run", "db:backup", "--", "--output", "/data/verified-backup.db"]));
    console.log(
      tool([
        "npm",
        "run",
        "db:restore",
        "--",
        "--source",
        "/data/verified-backup.db",
        "--apply",
        "--offline",
      ]),
    );
    const publicApp = start("public", backend, 3000, { DATABASE_URL: "file:/data/dev.db" }, [
      "public",
    ]);
    const adminApp = start(
      "local",
      backend,
      3001,
      {
        DATABASE_URL: "file:/data/dev.db",
        TS_HOST: "127.0.0.1",
        TS_USERNAME: "smoke",
        TS_USERPASSWORD: "smoke",
        PUBLIC_BASE_URL: "https://public.example.test",
        OIDC_ISSUER_URL: "https://login.example.test/realms/smoke",
        OIDC_AUDIENCE: "smoke",
      },
      ["local"],
    );
    const frontendApp = start("frontend", frontend, 8080, {});
    await Promise.all([
      ready(`${publicApp.url}/health/ready`),
      ready(`${adminApp.url}/health/ready`),
      ready(`${frontendApp.url}/health/live`),
    ]);
    assert.equal((await request(`${adminApp.url}/images-local/options`)).status, 401);
    const image = await request(`${frontendApp.url}/images/by-id/101.png`);
    assert.equal(image.status, 200);
    assert.equal(image.headers.get("content-type"), "image/png");
    const bytes = Buffer.from(await image.arrayBuffer());
    assert.equal(bytes.readUInt32BE(16), 500);
    assert.equal(bytes.readUInt32BE(20), 44);
    assert.equal(
      (
        await request(`${frontendApp.url}/images/by-id/101.png`, {
          headers: { "If-None-Match": image.headers.get("etag") },
        })
      ).status,
      304,
    );
    assert.equal((await request(`${frontendApp.url}/admin-api/images-local/options`)).status, 401);
    assert.equal((await request(`${frontendApp.url}/metrics`)).status, 404);
    assert.equal((await request(`${frontendApp.url}/admin-api/metrics`)).status, 404);
    assert.equal((await request(`${frontendApp.url}/metrics/`)).status, 404);
    assert.equal((await request(`${frontendApp.url}/admin-api/metrics/`)).status, 404);
    const page = await request(`${frontendApp.url}/channels`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /<div id="root">/);
    assert.notEqual(docker(["exec", publicApp.id, "id", "-u"]), "0");
    docker([
      "exec",
      publicApp.id,
      "node",
      "-e",
      `
      const assert=require('node:assert/strict'); const fs=require('node:fs');
      assert.equal(fs.statSync('/data/dev.db').uid, process.getuid());
      const db=new (require('better-sqlite3'))('/data/dev.db');
      db.exec('BEGIN IMMEDIATE; UPDATE ChannelImage SET channelName=channelName; ROLLBACK;'); db.close();
    `,
    ]);
    docker([
      "exec",
      publicApp.id,
      "node",
      "-e",
      "if(require('fs').existsSync('/app/node_modules/prisma')) process.exit(1)",
    ]);
    console.log(
      "Container smoke passed: migrations, restore, schema readiness, PNG/cache, protected API, SPA, metrics edge and non-root runtime.",
    );
  } catch (error) {
    for (const id of containers) console.error(docker(["logs", "--tail", "60", id], true));
    throw error;
  } finally {
    for (const id of containers) docker(["rm", "--force", id], true);
    docker(["volume", "rm", volume], true);
    docker(["network", "rm", network], true);
  }
}
// Fetch and AbortSignal timers alone can be unreferenced in Node. Keep this CLI
// alive until assertions and resource cleanup finish; every request is bounded.
const keepAlive = setInterval(() => {}, 1000);
main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => clearInterval(keepAlive));
