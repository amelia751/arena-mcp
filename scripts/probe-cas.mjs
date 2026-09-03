/**
 * Does the store really refuse a write whose version tag is out of date?
 *
 * Everything the app does to keep two writers from erasing each other rests on
 * that promise, so it is worth checking against the real store rather than a
 * stub. Reads credentials from the local Netlify CLI login; prints none of them.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { getStore } from "@netlify/blobs";

const state = JSON.parse(await readFile(path.join(process.cwd(), ".netlify", "state.json"), "utf8"));
const cli = JSON.parse(
  await readFile(
    path.join(os.homedir(), "Library", "Preferences", "netlify", "config.json"),
    "utf8",
  ),
);
const token =
  cli.users?.[Object.keys(cli.users ?? {})[0]]?.auth?.token ?? cli.accessToken;
if (!token) throw new Error("no Netlify CLI login found");

const store = getStore({ name: "cas-probe", siteID: state.siteId, token, consistency: "strong" });
const KEY = "probe.json";

await store.setJSON(KEY, { round: 0 });
const first = await store.getWithMetadata(KEY, { type: "text" });
console.log("etag present:", Boolean(first?.etag));

const stale = first.etag;
const a = await store.setJSON(KEY, { round: 1 }, { onlyIfMatch: stale });
console.log("write with a current tag  -> modified:", a.modified);

// The same tag is now out of date, because the write above moved it on.
const b = await store.setJSON(KEY, { round: 2 }, { onlyIfMatch: stale });
console.log("write with a stale tag    -> modified:", b.modified);

const after = await store.get(KEY, { type: "json" });
console.log("value left in the store   ->", JSON.stringify(after));

const enforced = a.modified === true && b.modified === false && after.round === 1;
console.log(enforced ? "\nCAS is enforced" : "\nCAS IS NOT ENFORCED — writes can clobber");

await store.delete(KEY);
process.exit(enforced ? 0 : 1);
