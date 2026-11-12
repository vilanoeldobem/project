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

/** Value of `--var NAME:value` in the `dev` script. */
export function devVar(name) {
  return new RegExp(`--var ${name}:(\\S+)`).exec(JSON.parse(read("package.json")).scripts.dev)?.[1];
}
