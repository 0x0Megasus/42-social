// One-shot upload: data/db.json -> Firebase Realtime Database root.
// Usage: npm run migrate:rtdb   (needs FIREBASE_* in .env.local)
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { cert, initializeApp } from "firebase-admin/app";
import { getDatabase } from "firebase-admin/database";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function env() {
  const raw = existsSync(join(root, ".env.local"))
    ? readFileSync(join(root, ".env.local"), "utf8")
    : "";
  const out = {};
  for (const line of raw.split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) {
      let v = m[2].trim();
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      )
        v = v.slice(1, -1);
      out[m[1]] = v;
    }
  }
  return out;
}

const e = env();
for (const k of [
  "FIREBASE_DATABASE_URL",
  "FIREBASE_CLIENT_EMAIL",
  "FIREBASE_PRIVATE_KEY",
]) {
  if (!e[k]) {
    console.error(`missing ${k} in .env.local`);
    process.exit(1);
  }
}

const dbPath = join(root, "data", "db.json");
if (!existsSync(dbPath)) {
  console.error("data/db.json not found — nothing to migrate");
  process.exit(1);
}
const data = JSON.parse(readFileSync(dbPath, "utf8"));

initializeApp({
  credential: cert({
    projectId: e.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? e.FIREBASE_PROJECT_ID,
    clientEmail: e.FIREBASE_CLIENT_EMAIL,
    privateKey: e.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
  }),
  databaseURL: e.FIREBASE_DATABASE_URL,
});

const n = Object.fromEntries(
  Object.entries(data).map(([k, v]) => [k, Array.isArray(v) ? v.length : v])
);
console.log("uploading:", JSON.stringify(n));
await getDatabase().ref("/").set(data);
console.log("done — root replaced with local data");
process.exit(0);
