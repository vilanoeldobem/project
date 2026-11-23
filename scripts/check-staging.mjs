// Build and validate the five isolated staging packages, without publishing or applying migrations.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(new URL("../apps/api/package.json", import.meta.url));
const { unstable_readConfig: readConfig } = require("wrangler");
const hosts = { api: "api", server: "server", client: "play", dash: "dash", site: "www" };
const frontends = ["client", "dash", "site"];
const env = { ...process.env, WRANGLER_SEND_METRICS: "false", CI: "true" };

function run(app, args) {
  execFileSync("pnpm", ["--filter", `@vila/${app}`, "exec", ...args], { cwd: root, env, stdio: "inherit" });
}

for (const [app, host] of Object.entries(hosts)) {
  const dir = resolve(root, "apps", app);
  const config = resolve(dir, "wrangler.jsonc");
  const staging = readConfig({ config, env: "staging" }, { hideWarnings: true });
  const production = readConfig({ config }, { hideWarnings: true });
  assert.equal(staging.name, `${production.name}-staging`, `${app}: expected an isolated Worker`);
  assert.deepEqual(staging.routes, [{ pattern: `${host}-staging.vilanoeldobem.com.br`, custom_domain: true }]);
  assert.equal(staging.workers_dev, false);
  assert.equal(staging.preview_urls, false);

  if (frontends.includes(app)) {
    assert.equal(resolve(dir, staging.assets.directory), resolve(dir, ".wrangler/staging-assets"));
  }
  if (app === "api") {
    const db = staging.d1_databases.find(binding => binding.binding === "DB");
    assert.equal(db?.database_name, "vilanoeldobem-staging");
    assert.ok(db.database_id && !production.d1_databases.some(binding => binding.database_id === db.database_id));
    assert.equal(staging.vars.ACCOUNTS_ENABLED, "false", "accounts require explicit activation after review");
  }
  if (app === "server") {
    assert.equal(staging.services.find(binding => binding.binding === "API")?.service, "vilanoeldobem-api-staging");
  }
}

for (const app of frontends) {
  run(app, ["vite", "build", "--mode", "staging"]);
  const dir = resolve(root, "apps", app, ".wrangler/staging-assets");
  const headers = readFileSync(resolve(dir, "_headers"), "utf8");
  const files = readdirSync(dir, { recursive: true });
  assert.ok(files.includes("index.html"));
  for (const file of files.filter(file => file === "_headers" || /\.(html|js)$/.test(file))) {
    const contents = readFileSync(resolve(dir, file), "utf8");
    assert.ok(!/(?:https?|wss):\/\/(?:(?:www|play|server|api|dash)\.)?vilanoeldobem\.com\.br\b/.test(contents),
      `${app}/${file}: staging package contains a production URL`);
    assert.ok(!/googletagmanager\.com|google-analytics\.com/.test(contents),
      `${app}/${file}: staging package contains a Google Analytics URL`);
  }
  if (app !== "site") assert.match(headers, /https:\/\/api-staging\.vilanoeldobem\.com\.br/);
  if (app === "client") assert.match(headers, /wss:\/\/server-staging\.vilanoeldobem\.com\.br/);
}

for (const app of Object.keys(hosts)) {
  run(app, ["wrangler", "deploy", "--env", "staging", "--dry-run", "--x-provision=false"]);
}
