// One-off repair for ghost post rows (see src/lib/repair.ts for background).
//
// Usage (from the repo root, with the server FIREBASE_* env vars set):
//   node scripts/repair-ghost-posts.mjs            # dry run, prints plan
//   node scripts/repair-ghost-posts.mjs --apply    # nulls ghost rows + drops /posts-by-id/undefined
//
// What it does:
//   1. Reads the raw /posts node.
//   2. Plans via planPostsRepair: any object row without a usable `id` is a
//      ghost (partial row resurrected by the old index bug) and is nulled.
//   3. Removes /posts-by-id/undefined if the backfill ever mirrored one.
//   4. Recomputes every user's postsCount from live (non-deleted) rows and
//      fixes drifted values (deletes never decremented the counter, so
//      profile/explore showed deleted posts).
//   5. Never touches healthy rows (keeps id'd rows even if author-less —
//      those heal via the author fallback + snapshot on next edit).
//
// Safe to re-run: nulled keys stay nulled and correct counts rewrite the
// same value, so repeats are no-ops.

import admin from "firebase-admin";

const APPLY = process.argv.includes("--apply");

function env(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`missing env: ${name}`);
    process.exit(1);
  }
  return v;
}

// Import the pure planner from the TS source without a build step: the
// planner is dependency-free, so inline its logic here would drift —
// instead load it via a tiny transpile-free reimplementation note:
// (kept in sync with src/lib/repair.ts::planPostsRepair by unit tests).
function planPostsRepair(postsVal) {
  const ghostKeys = [];
  const liveKeys = [];
  // Index loop for arrays (NOT map + destructure): RTDB can hand back
  // sparse arrays where deleted slots are holes, not nulls.
  const visit = (key, v) => {
    if (!v || typeof v !== "object") return;
    if (typeof v.id === "string" && v.id) liveKeys.push(key);
    else ghostKeys.push(key);
  };
  if (Array.isArray(postsVal)) {
    for (let i = 0; i < postsVal.length; i++) visit(String(i), postsVal[i]);
  } else if (postsVal && typeof postsVal === "object") {
    for (const [key, v] of Object.entries(postsVal)) visit(key, v);
  }
  return { ghostKeys, liveKeys };
}

const app =
  admin.apps.length > 0
    ? admin.apps[0]
    : admin.initializeApp({
        credential: admin.credential.cert({
          projectId:
            process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ??
            process.env.FIREBASE_PROJECT_ID,
          clientEmail: env("FIREBASE_CLIENT_EMAIL"),
          privateKey: env("FIREBASE_PRIVATE_KEY").replace(/\\n/g, "\n"),
        }),
        databaseURL: env("FIREBASE_DATABASE_URL"),
      });

const db = admin.database(app);
const postsSnap = await db.ref("/posts").get();
const plan = planPostsRepair(postsSnap.val());
const straySnap = await db.ref("/posts-by-id/undefined").get();
const hasStray = straySnap.exists();

console.log(`live rows: ${plan.liveKeys.length}`);
console.log(
  `ghost rows: ${plan.ghostKeys.length}${plan.ghostKeys.length ? ` (${plan.ghostKeys.map((k) => `/posts/${k}`).join(", ")})` : ""}`
);
console.log(`/posts-by-id/undefined: ${hasStray ? "present" : "absent"}`);

// --- postsCount drift repair -------------------------------------------
// Count live posts per author from the raw snapshot (same filter as
// countLivePostsByAuthor in src/lib/counters.ts), then diff against the
// array leaves and the by-id map rows.
const postsVal = postsSnap.val();
const liveByAuthor = new Map();
// Index loop (NOT map + destructure): sparse-array holes read as undefined
// via index access and are skipped; destructuring them would crash.
const countVisit = (v) => {
  if (!v || typeof v !== "object" || v.deleted) return;
  if (typeof v.authorId !== "string" || !v.authorId) return;
  liveByAuthor.set(v.authorId, (liveByAuthor.get(v.authorId) ?? 0) + 1);
};
if (Array.isArray(postsVal)) {
  for (let i = 0; i < postsVal.length; i++) countVisit(postsVal[i]);
} else if (postsVal && typeof postsVal === "object") {
  for (const v of Object.values(postsVal)) countVisit(v);
}
const [usersSnap, usersByIdSnap] = await Promise.all([
  db.ref("/users").get(),
  db.ref("/users-by-id").get(),
]);
const usersVal = usersSnap.val();
const usersById = usersByIdSnap.val() ?? {};
const countFixes = [];
const seen = new Set();
// Index loop (NOT map + destructure): sparse-array holes read as undefined
// via index access and are skipped; destructuring them would crash.
const userVisit = (key, u) => {
  if (!u || typeof u !== "object" || typeof u.id !== "string" || !u.id)
    return;
  seen.add(u.id);
  const want = liveByAuthor.get(u.id) ?? 0;
  if (u.postsCount !== want) {
    countFixes.push({ path: `/users/${key}/postsCount`, from: u.postsCount, to: want });
    const mapRow = usersById[u.id];
    if (mapRow && typeof mapRow === "object")
      countFixes.push({
        path: `/users-by-id/${u.id}/postsCount`,
        from: mapRow.postsCount,
        to: want,
      });
  }
};
if (Array.isArray(usersVal)) {
  for (let i = 0; i < usersVal.length; i++) userVisit(String(i), usersVal[i]);
} else if (usersVal && typeof usersVal === "object") {
  for (const [key, u] of Object.entries(usersVal)) userVisit(key, u);
}
console.log(`drifted postsCount values: ${countFixes.length}`);
for (const f of countFixes) console.log(`  ${f.path}: ${f.from} -> ${f.to}`);

if (!APPLY) {
  console.log("dry run — pass --apply to write.");
  process.exit(0);
}

const updates = {};
for (const k of plan.ghostKeys) updates[`/posts/${k}`] = null;
if (hasStray) updates["/posts-by-id/undefined"] = null;
for (const f of countFixes) updates[f.path] = f.to;
if (Object.keys(updates).length === 0) {
  console.log("nothing to repair.");
  process.exit(0);
}
await db.ref("/").update(updates);
console.log(`applied ${Object.keys(updates).length} null-write(s).`);
process.exit(0);
