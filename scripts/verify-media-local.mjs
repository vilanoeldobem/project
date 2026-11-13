/** Fresh local workerd/D1/R2 lifecycle with private config and filtered credential environment. */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const api = join(root, "apps/api");
const smoke = join(api, "scripts/verify-files-reconciliation.mjs");
const cli = join(api, "node_modules/wrangler/bin/wrangler.js");
const base = "http://127.0.0.1:8792";
const children = new Set();
let directory;
async function freePort(port) {
  const server = createServer();
  await new Promise((ok, fail) => { server.once("error", fail); server.listen(port, "127.0.0.1", ok); });
  const selected = server.address().port;
  await new Promise((ok, fail) => server.close((error) => error ? fail(error) : ok()));
  return selected;
}
function child(args, env) {
  const process = spawn(globalThis.process.execPath, args, {
    cwd: directory, env, detached: true, stdio: ["ignore", "pipe", "pipe"],
  });
  const task = { process, output: "", error: "", done: false };
  children.add(task);
  process.stdout.on("data", (data) => { task.output = (task.output + data).slice(-65536); });
  process.stderr.on("data", (data) => { task.error = (task.error + data).slice(-16384); });
  task.closed = new Promise((ok) => {
    process.once("error", (error) => { task.error = error.message; });
    process.once("close", (code) => { task.done = true; children.delete(task); ok(code); });
  });
  return task;
}
async function stop(task) {
  if (task.done) return;
  const signal = (value) => {
    try { process.kill(-task.process.pid, value); } catch (error) { if (error.code !== "ESRCH") throw error; }
  };
  signal("SIGTERM");
  await Promise.race([task.closed, delay(3000, undefined, { ref: false })]);
  if (!task.done) { signal("SIGKILL"); await task.closed; }
}

async function run(args, env, timeout = 60000) {
  const task = child(args, env);
  const code = await Promise.race([task.closed, delay(timeout, undefined, { ref: false }).then(() => "timeout")]);
  if (code !== 0) {
    await stop(task);
    throw new Error(`Local smoke command failed (${code}): ${task.error}\n${task.output.slice(-16384)}`);
  }
  return task.output;
}

async function ready(worker, address = `${base}/health`) {
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline) {
    if (worker.done) throw new Error(`Local Worker exited: ${worker.error}`);
    try {
      const response = await fetch(address, { signal: AbortSignal.timeout(500) });
      if (response.ok && (address !== `${base}/health` || (await response.json()).environment === "development")) return;
    } catch { /* Retry readiness until the bounded deadline. */ }
    await delay(100);
  }
  throw new Error(`Local Worker readiness timed out: ${worker.error}`);
}

async function main() {
  const browser = process.argv.includes("--browser");
  const progress = process.argv.includes("--progress");
  const progressSmoke = join(api, "scripts/verify-progress.mjs");
  const withdrawal = process.argv.includes("--withdrawal");
  const withdrawalSmoke = join(api, "scripts/verify-withdrawal.mjs");
  if (browser) assert.ok(process.env.CI && process.env.CHROMIUM_PATH, "Browser orchestration requires CI and installed Chromium");
  const config = JSON.parse((await readFile(join(api, "wrangler.reconciliation-local.jsonc"), "utf8"))
    .replace(/^\s*\/\/.*$/gm, ""));
  assert.equal(config.account_id, undefined);
  assert.deepEqual(config.routes, []);
  assert.equal(config.workers_dev, false);
  assert.equal(config.vars.ENVIRONMENT, "development");
  assert.equal(config.d1_databases.length, 1);
  assert.equal(config.r2_buckets.length, 1);
  const database = config.d1_databases[0], bucket = config.r2_buckets[0];
  assert.equal(database.database_name, "ngo-media-review-local");
  assert.equal(database.database_id, "00000000-0000-0000-0000-000000000007");
  assert.equal(bucket.bucket_name, "ngo-media-review-local");
  assert.equal(database.remote, false);
  assert.equal(bucket.remote, false);
  await freePort(8792);
  const inspector = await freePort(0);
  directory = await mkdtemp(join(tmpdir(), "vila-media-"));
  // A private config directory prevents loading the developer's .dev.vars or local database.
  config.main = resolve(api, config.main);
  database.migrations_dir = resolve(api, database.migrations_dir);
  if (progress) config.vars.QUESTS_V1_ENABLED = "true"; // Only this fresh local Worker's generated config.
  if (withdrawal) config.vars.NGO_WITHDRAWAL_ENABLED = "true"; // Same: never the deployable configuration.
  const configPath = join(directory, "wrangler.json");
  await writeFile(configPath, JSON.stringify(config));
  await writeFile(join(directory, ".dev.vars"), "");
  const env = Object.fromEntries(["PATH", "HOME", "LANG", "CI", "NODE_EXTRA_CA_CERTS"]
    .filter((key) => process.env[key]).map((key) => [key, process.env[key]]));
  Object.assign(env, { WRANGLER_SEND_METRICS: "false", CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: "false",
    WRANGLER_REGISTRY_PATH: join(directory, "registry"), UV_THREADPOOL_SIZE: "2" });
  const local = ["--config", configPath, "--local", "--persist-to", join(directory, "state")];
  await run([cli, "d1", "migrations", "apply", database.database_name, ...local], env);
  const seed = join(directory, "seed.sql");
  await writeFile(seed, await run([smoke, "--seed"], env));
  await run([cli, "d1", "execute", database.database_name, ...local, "--file", seed], env);
  if (progress) {
    const progressSeed = join(directory, "progress-seed.sql");
    await writeFile(progressSeed, await run([progressSmoke, "--seed"], env));
    await run([cli, "d1", "execute", database.database_name, ...local, "--file", progressSeed], env);
  }
  if (withdrawal) {
    const withdrawalSeed = join(directory, "withdrawal-seed.sql");
    await writeFile(withdrawalSeed, await run([withdrawalSmoke, "--seed"], env));
    await run([cli, "d1", "execute", database.database_name, ...local, "--file", withdrawalSeed], env);
  }
  const worker = child([cli, "dev", ...local, "--ip", "127.0.0.1", "--port", "8792",
    "--inspector-port", String(inspector), "--log-level", "warn"], env);
  await ready(worker);
  const output = await run([smoke, base], env);
  assert.match(output, /PASS: canonical files/);
  console.log("PASS: isolated local media lifecycle (workerd, D1, conditional R2 writes)");
  if (progress) {
    const result = await run([progressSmoke, base], env);
    assert.match(result, /PASS: local D1 authoritative state, two-session concurrency/);
    console.log(result.trim());
  }
  if (withdrawal) {
    const result = await run([withdrawalSmoke, base], env);
    assert.match(result, /PASS: local D1\/R2 withdrawal/);
    console.log(result.trim());
  }
  if (browser) {
    for (const [app, port] of [["client", 8799], ["dash", 8797], ["server", 8788]]) {
      await freePort(port);
      const appDir = join(root, "apps", app);
      const localConfig = JSON.parse((await readFile(join(appDir, "wrangler.jsonc"), "utf8")).replace(/^\s*\/\/.*$/gm, ""));
      assert.ok(!localConfig.d1_databases && !localConfig.r2_buckets);
      // The realtime server's only binding to another Worker is `API` (IMPL-0021). It is dropped from this local
      // copy so it can never reach a Worker registered under that name on this machine; a removal request then
      // fails closed, which is what the room does without the binding.
      assert.deepEqual((localConfig.services ?? []).map((s) => s.binding), app === "server" ? ["API"] : []);
      delete localConfig.services;
      delete localConfig.account_id;
      localConfig.name = `vila-media-${app}-local`;
      Object.assign(localConfig, { routes: [], workers_dev: false, preview_urls: false });
      localConfig.vars = { ...localConfig.vars, ENVIRONMENT: "development", ALLOWED_ORIGINS: "http://localhost:8799" };
      if (localConfig.main) localConfig.main = resolve(appDir, localConfig.main);
      if (localConfig.assets) localConfig.assets.directory = resolve(appDir, localConfig.assets.directory);
      const path = join(directory, `${app}.json`);
      await writeFile(path, JSON.stringify(localConfig));
      const service = child([cli, "dev", "--config", path, "--local", "--persist-to", join(directory, app),
        "--ip", "127.0.0.1", "--port", String(port), "--inspector-port", String(await freePort(0)),
        "--infer-origin-from-routes=false", "--log-level", "warn"], env);
      await ready(service, `http://127.0.0.1:${port}/${app === "server" ? "health" : ""}`);
    }
    const result = await run([join(root, "apps/client/scripts/verify-accounts.mjs"),
      "http://localhost:8799", "http://localhost:8792", "http://localhost:8797"], { ...env,
      CHROMIUM_PATH: process.env.CHROMIUM_PATH, VILA_STUB_ANALYTICS: "1", VILA_API_CONFIG: configPath,
      VILA_API_PERSIST_TO: join(directory, "state"), VILA_API_DB: database.database_name }, 360000);
    assert.match(result, /ok.*accounts flow/);
    console.log("PASS: real Chromium account/file flow and disclosure (GTM stubbed; analytics not tested)");
  }
}

for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => {
  void Promise.all([...children].map(stop)).then(async () => {
    if (directory) await rm(directory, { recursive: true, force: true });
  }).finally(() => process.exit(1));
});
try { await main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
finally {
  await Promise.all([...children].map(stop));
  if (directory) await rm(directory, { recursive: true, force: true });
}
