/**
 * Reads the Worker's configuration as text, for tests that keep the lists of origins consistent: the production
 * `vars` of wrangler.jsonc and the `--var` overrides of the local `dev` script in package.json.
 */
import { readFileSync } from "node:fs";

const read = (name) => readFileSync(new URL(`../${name}`, import.meta.url), "utf8");

/** Value of a production var: the first `"NAME": "value"` in wrangler.jsonc (`env.staging` comes after it). */
export function productionVar(name) {
  return new RegExp(`"${name}":\\s*"([^"]*)"`).exec(read("wrangler.jsonc"))?.[1];
}

/** Every value of a var in wrangler.jsonc, in file order: production first, then each `env` (staging). */
export function configuredVars(name) {
  return [...read("wrangler.jsonc").matchAll(new RegExp(`"${name}":\\s*"([^"]*)"`, "g"))].map((match) => match[1]);
}

/** Names of the environments of the deployable wrangler.jsonc (local simulators live in their own config files). */
export function environments() {
  return [...read("wrangler.jsonc").split(/^\s*"env":\s*\{/m)[1].matchAll(/^    "([\w-]+)":\s*\{/gm)].map((match) => match[1]);
}

/** Value of `--var NAME:value` in the `dev` script. */
export function devVar(name) {
  return new RegExp(`--var ${name}:(\\S+)`).exec(JSON.parse(read("package.json")).scripts.dev)?.[1];
}

/** The `deploy` script of package.json (what `pnpm deploy:api` runs). */
export const deployScript = () => JSON.parse(read("package.json")).scripts.deploy;
