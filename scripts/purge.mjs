/**
 * Empty the deployed store, for when you want a blank page to test against.
 *
 * Uses the Netlify CLI login already on this machine and prints no credentials.
 * Pass a prefix to narrow it: `node scripts/purge.mjs match/` clears matches and
 * leaves the games alone.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { getStore } from "@netlify/blobs";

const prefix = process.argv[2] ?? "";

const state = JSON.parse(await readFile(path.join(process.cwd(), ".netlify", "state.json"), "utf8"));
const cli = JSON.parse(
  await readFile(path.join(os.homedir(), "Library", "Preferences", "netlify", "config.json"), "utf8"),
);
const token = cli.users?.[Object.keys(cli.users ?? {})[0]]?.auth?.token ?? cli.accessToken;
if (!token) throw new Error("no Netlify CLI login found — run `netlify login`");

const store = getStore({ name: "arena", siteID: state.siteId, token, consistency: "strong" });
const { blobs } = await store.list({ prefix });

if (blobs.length === 0) {
  console.log(prefix ? `nothing under ${prefix}` : "the store is already empty");
  process.exit(0);
}

await Promise.all(blobs.map((b) => store.delete(b.key)));
console.log(`removed ${blobs.length} ${blobs.length === 1 ? "entry" : "entries"}`);
