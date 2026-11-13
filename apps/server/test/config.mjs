/**
 * Reads the realtime Worker's configuration as text, for tests that keep the deployed defaults honest: the
 * production `vars` and bindings of wrangler.jsonc and the `--var` overrides of the local `dev` script.
 */
import { readFileSync } from "node:fs";

const read = (name) => readFileSync(new URL(`../${name}`, import.meta.url), "utf8");

/** wrangler.jsonc without its `//` comment lines, parsed. */
export const wranglerConfig = () =>
  JSON.parse(
    read("wrangler.jsonc")
      .split("\n")
      .filter((line) => !line.trim().startsWith("//"))
      .join("\n"),
  );

/** Value of `--var NAME:value` in the `dev` script. */
export function devVar(name) {
  return new RegExp(`--var ${name}:(\\S+)`).exec(JSON.parse(read("package.json")).scripts.dev)?.[1];
}
