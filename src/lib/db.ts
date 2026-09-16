import { getRtdb, isRtdbConfigured, rtdb } from "@/lib/fbrdb";
import { isSupportUser } from "@/lib/support";
import { cached, invalidatePrefix } from "@/lib/cache";


export type SocialLink = { label: string; url: string };

export type UserSpotify = {
  kind: "track" | "artist";
  id: string;
  url: string;
  title: string | null;
  subtitle: string | null;
  image: string | null;
};

export type User = {
  id: string;
  email: string;
  name: string;
  login42: string | null;
  googleId: string | null;
  avatar: string | null;
  campus: string | null;
  coalition: string | null;
  bio: string;
  socials: SocialLink[];
  cover: string | null;
  coverVideo: string | null;
  spotify: UserSpotify | null;
  lastSeen: string | null;
  createdAt: string;
  nameLower?: string;
  postsCount?: number;
  followersCount?: number;
  followingCount?: number;
};

export type AuthorSnapshot = {
  id: string;
  name: string;
  login42: string | null;
  avatar: string | null;
  campus: string | null;
  isSupport?: boolean | null;
};

export type PostVideo = {
  url: string;
  thumb: string | null;
  w: number | null;
  h: number | null;
  duration: number | null;
  bytes: number | null;
};

export type Post = {
  id: string;
  authorId: string;
  body: string;
  image: string | null;
  thumb: string | null;
  imgW?: number | null;
  imgH?: number | null;
  video: PostVideo | null;
  cloudIds?: string[] | null;
  edited: boolean;
  deleted: boolean;
  pinned?: boolean;
  pinnedAt?: string | null;
  createdAt: string;
  author?: AuthorSnapshot | null;
  likesCount?: number;
  commentsCount?: number;
};

export type Comment = {
  id: string;
  postId: string;
  authorId: string;
  body: string;
  kind: "text" | "sticker";
  edited: boolean;
  deleted: boolean;
  replyTo: QuotedReply;
  createdAt: string;
  author?: AuthorSnapshot | null;
};

export type Notification = {
  id: string;
  userId: string;
  kind: "like" | "comment" | "follow";
  fromId: string;
  postId: string | null;
  read: boolean;
  createdAt: string;
};

export type QuotedReply = {
  id: string;
  body: string;
  name: string;
  senderId: string;
} | null;

export type Conversation = {
  id: string;
  aId: string;
  bId: string;
  createdAt: string;
};

export type MessageAttachment = {
  url: string;
  duration: number | null;
  peaks: number[] | null;
  bytes: number | null;
  mime: string | null;
  publicId?: string | null;
};

export type Message = {
  id: string;
  convoId: string;
  senderId: string;
  body: string;
  kind: "text" | "sticker" | "voice";
  read: boolean;
  edited: boolean;
  deleted: boolean;
  replyTo: QuotedReply;
  createdAt: string;
  attachment?: MessageAttachment | null;
};

export type Like = { postId: string; userId: string };
export type Follow = { followerId: string; followingId: string };
export type MediaKind = "image" | "video" | "voice";

type DB = {
  users: User[];
  posts: Post[];
  comments: Comment[];
  likes: Like[];
  follows: Follow[];
  notifications: Notification[];
  conversations: Conversation[];
  messages: Message[];
};

const empty: DB = {
  users: [],
  posts: [],
  comments: [],
  likes: [],
  follows: [],
  notifications: [],
  conversations: [],
  messages: [],
};

function assertRtdb(): void {
  if (!isRtdbConfigured()) {
    throw new Error(
      "RTDB not configured — set FIREBASE_DATABASE_URL, FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY"
    );
  }
}

let mutex: Promise<void> = Promise.resolve();

function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const run = mutex.then(fn, fn);
  mutex = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

export function normalizeUser(u: User): User {
  if (!("lastSeen" in u)) (u as User).lastSeen = null;
  if ((u as User).login42 === undefined) (u as User).login42 = null;
  if ((u as User).googleId === undefined) (u as User).googleId = null;
  if ((u as User).avatar === undefined) (u as User).avatar = null;
  if ((u as User).campus === undefined) (u as User).campus = null;
  if ((u as User).coalition === undefined) (u as User).coalition = null;
  if ((u as User).cover === undefined) (u as User).cover = null;
  if ((u as User).coverVideo === undefined) (u as User).coverVideo = null;
  if ((u as User).spotify === undefined) (u as User).spotify = null;
  else if ((u as User).spotify !== null) {
    const s = (u as User).spotify as unknown as Record<string, unknown>;
    if (
      !s ||
      typeof s !== "object" ||
      (s.kind !== "track" && s.kind !== "artist") ||
      typeof s.id !== "string" ||
      !s.id
    ) {
      (u as User).spotify = null;
    }
  }
  if (typeof (u as User).bio !== "string") (u as User).bio = "";
  if (typeof (u as User).name !== "string") (u as User).name = "";
  if (typeof (u as User).email !== "string") (u as User).email = "";
  if (!Array.isArray((u as User).socials)) (u as User).socials = [];
  else {
    (u as User).socials = (u as User).socials
      .filter((s) => s && typeof s.url === "string" && typeof s.label === "string")
      .slice(0, 4);
  }
  return u;
}

export function normalizePost(p: Post): Post {
  if (!("edited" in p)) (p as Post).edited = false;
  if (!("deleted" in p)) (p as Post).deleted = false;
  if ((p as Post).pinned === undefined) (p as Post).pinned = false;
  if ((p as Post).pinnedAt === undefined) (p as Post).pinnedAt = null;
  if ((p as Post).image === undefined) (p as Post).image = null;
  if ((p as Post).thumb === undefined) (p as Post).thumb = null;
  if ((p as Post).video === undefined) (p as Post).video = null;
  if ((p as Post).cloudIds === undefined) (p as Post).cloudIds = null;
  if ((p as Post).imgW === undefined) (p as Post).imgW = null;
  if ((p as Post).imgH === undefined) (p as Post).imgH = null;
  if ((p as Post).author === undefined) (p as Post).author = null;
  if (typeof (p as Post).likesCount !== "number")
    (p as Post).likesCount = 0;
  if (typeof (p as Post).commentsCount !== "number")
    (p as Post).commentsCount = 0;
  return p;
}

export function normalizeComment(c: Comment): Comment {
  if (!("kind" in c)) (c as Comment).kind = "text";
  if (!("edited" in c)) (c as Comment).edited = false;
  if (!("deleted" in c)) (c as Comment).deleted = false;
  if (!("replyTo" in c)) (c as Comment).replyTo = null;
  return c;
}

export function normalizeMessage(m: Message): Message {
  if (!("kind" in m)) (m as Message).kind = "text";
  if (!("read" in m)) (m as Message).read = true;
  if (!("edited" in m)) (m as Message).edited = false;
  if (!("deleted" in m)) (m as Message).deleted = false;
  if (!("replyTo" in m)) (m as Message).replyTo = null;
  return m;
}

function normalize(db: DB): DB {
  for (const u of db.users) normalizeUser(u as User);
  for (const p of db.posts) normalizePost(p as Post);
  for (const c of db.comments) normalizeComment(c as Comment);
  for (const m of db.messages) normalizeMessage(m as Message);
  db.conversations ??= [];
  db.messages ??= [];
  return db;
}

async function readFresh(): Promise<DB> {
  assertRtdb();
  const snap = await rtdb("root.get", () => getRtdb().ref("/").get());
  return normalize({ ...empty, ...((snap.val() ?? {}) as Partial<DB>) });
}

export async function readDB(): Promise<DB> {
  return enqueue(readFresh);
}

export async function updateDB<T>(fn: (db: DB) => T): Promise<T> {
  return enqueue(async () => {
    assertRtdb();
    let captured: T | undefined;
    let ran = false;
    const res = await rtdb(`root.transaction`, () =>
      getRtdb()
        .ref("/")
        .transaction((current: unknown) => {
          const db = normalize({
            ...empty,
            ...((current ?? {}) as Partial<DB>),
          });
          captured = fn(db);
          ran = true;
          return db;
        })
    );
    if (!res.committed || !ran || captured === undefined) {
      throw new Error("rtdb transaction conflict — retry the request");
    }
    return captured;
  });
}


export type CollectionName =
  | "users"
  | "posts"
  | "comments"
  | "likes"
  | "follows"
  | "notifications"
  | "conversations"
  | "messages";

type CollectionRow = {
  users: User;
  posts: Post;
  comments: Comment;
  likes: Like;
  follows: Follow;
  notifications: Notification;
  conversations: Conversation;
  messages: Message;
};

function normalizeRow<N extends CollectionName>(
  name: N,
  row: CollectionRow[N]
): CollectionRow[N] {
  if (name === "users") return normalizeUser(row as unknown as User) as CollectionRow[N];
  if (name === "posts") return normalizePost(row as unknown as Post) as CollectionRow[N];
  if (name === "comments")
    return normalizeComment(row as unknown as Comment) as CollectionRow[N];
  if (name === "messages")
    return normalizeMessage(row as unknown as Message) as CollectionRow[N];
  return row;
}

function toRows<N extends CollectionName>(
  name: N,
  val: unknown
): CollectionRow[N][] {
  return collectionEntries(name, val).map(({ row }) => row);
}

export function collectionEntries<N extends CollectionName>(
  name: N,
  val: unknown
): { key: string; row: CollectionRow[N] }[] {
  const out: { key: string; row: CollectionRow[N] }[] = [];
  if (Array.isArray(val)) {
    for (let i = 0; i < val.length; i++) {
      const v: unknown = val[i];
      if (v && typeof v === "object")
        out.push({ key: String(i), row: normalizeRow(name, v as CollectionRow[N]) });
    }
    return out;
  }
  if (val && typeof val === "object") {
    for (const [key, v] of Object.entries(val as Record<string, unknown>)) {
      if (v && typeof v === "object")
        out.push({ key, row: normalizeRow(name, v as CollectionRow[N]) });
    }
  }
  return out;
}

export async function readCollection<N extends CollectionName>(
  name: N
): Promise<CollectionRow[N][]> {
  assertRtdb();
  const snap = await rtdb(`${name}.get`, () =>
    getRtdb().ref(`/${name}`).get()
  );
  return toRows(name, snap.val());
}

export async function readCollectionEntries<N extends CollectionName>(
  name: N
): Promise<{ key: string; row: CollectionRow[N] }[]> {
  assertRtdb();
  const snap = await rtdb(`${name}.get`, () =>
    getRtdb().ref(`/${name}`).get()
  );
  return collectionEntries(name, snap.val());
}

export type CollectionQuery = {
  orderBy: string;
  equalTo?: string | number | boolean | null;
  startAt?: string | number;
  endAt?: string | number;
  endBefore?: string | number;
  limit?: number;
  first?: number;
};

export async function queryCollection<N extends CollectionName>(
  name: N,
  q: CollectionQuery
): Promise<CollectionRow[N][]> {
  assertRtdb();
  try {
    const snap = await rtdb(`${name}.query`, () => {
      let query = getRtdb().ref(`/${name}`).orderByChild(q.orderBy);
      if (q.equalTo !== undefined) query = query.equalTo(q.equalTo);
      if (q.startAt !== undefined) query = query.startAt(q.startAt);
      if (q.endAt !== undefined) query = query.endAt(q.endAt);
      else if (q.endBefore !== undefined) query = query.endBefore(q.endBefore);
      if (q.limit !== undefined) query = query.limitToLast(q.limit);
      else if (q.first !== undefined) query = query.limitToFirst(q.first);
      return query.get();
    });
    return toRows(name, snap.val());
  } catch (e) {
    return queryFallback(name, q, e);
  }
}

const warnedFallbacks = new Set<string>();

function warnFallback(name: string, orderBy: string, cause: unknown): void {
  const key = `${name}:${orderBy}`;
  if (warnedFallbacks.has(key)) return;
  warnedFallbacks.add(key);
  console.warn(
    `[${name}.query] no "${orderBy}" index in database rules — using slower full scan (results still correct). Deploy database.rules.json to silence this. Cause: ${(cause as Error)?.message ?? cause}`
  );
}
function applyQueryFilter<T>(
  rows: T[],
  val: (r: T) => string | number | boolean | null,
  q: CollectionQuery
): T[] {
  const cmp = (
    a: string | number | boolean | null,
    b: string | number | boolean | null
  ): number => {
    if (a === b) return 0;
    if (a === null) return -1;
    if (b === null) return 1;
    return a < b ? -1 : 1;
  };
  let out = rows.filter((r) => {
    const v = val(r);
    if (q.equalTo !== undefined && v !== q.equalTo) return false;
    if (q.startAt !== undefined && cmp(v, q.startAt) < 0) return false;
    if (q.endAt !== undefined && cmp(v, q.endAt) > 0) return false;
    if (q.endBefore !== undefined && cmp(v, q.endBefore) >= 0) return false;
    return true;
  });
  out = out.sort((a, b) => cmp(val(a), val(b)));
  if (q.limit !== undefined) out = out.slice(-q.limit);
  else if (q.first !== undefined) out = out.slice(0, q.first);
  return out;
}

function orderValue<N extends CollectionName>(
  name: N,
  q: CollectionQuery,
  r: CollectionRow[N]
): string | number | boolean | null {
  const v = (r as unknown as Record<string, unknown>)[q.orderBy];
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean")
    return v;
  return null;
}

async function queryFallback<N extends CollectionName>(
  name: N,
  q: CollectionQuery,
  cause: unknown
): Promise<CollectionRow[N][]> {
  warnFallback(name, q.orderBy, cause);
  const rows = await readCollection(name);
  return applyQueryFilter(rows, (r) => orderValue(name, q, r), q);
}

export async function queryCollectionEntries<N extends CollectionName>(
  name: N,
  q: CollectionQuery
): Promise<{ key: string; row: CollectionRow[N] }[]> {
  assertRtdb();
  const collect = () => {
    let query = getRtdb().ref(`/${name}`).orderByChild(q.orderBy);
    if (q.equalTo !== undefined) query = query.equalTo(q.equalTo);
    if (q.startAt !== undefined) query = query.startAt(q.startAt);
    if (q.endAt !== undefined) query = query.endAt(q.endAt);
    else if (q.endBefore !== undefined) query = query.endBefore(q.endBefore);
    if (q.limit !== undefined) query = query.limitToLast(q.limit);
    else if (q.first !== undefined) query = query.limitToFirst(q.first);
    return query;
  };
  try {
    const out: { key: string; row: CollectionRow[N] }[] = [];
    await rtdb(`${name}.query`, () =>
      collect()
        .get()
        .then((snap) => {
          snap.forEach((child) => {
            const v = child.val();
            if (v && typeof v === "object" && child.key !== null) {
              out.push({
                key: child.key,
                row: normalizeRow(name, v as CollectionRow[N]),
              });
            }
            return false;
          });
          return undefined;
        })
    );
    return out;
  } catch (e) {
    warnFallback(name, q.orderBy, e);
    const snap = await rtdb(`${name}.get`, () =>
      getRtdb().ref(`/${name}`).get()
    );
    const val = snap.val();
    const all: { key: string; row: CollectionRow[N] }[] = [];
    if (Array.isArray(val)) {
      val.forEach((v, i) => {
        if (v && typeof v === "object")
          all.push({ key: String(i), row: normalizeRow(name, v) });
      });
    } else if (val && typeof val === "object") {
      for (const [key, v] of Object.entries(val)) {
        if (v && typeof v === "object")
          all.push({ key, row: normalizeRow(name, v as CollectionRow[N]) });
      }
    }
    return applyQueryFilter(
      all,
      ({ row }) => orderValue(name, q, row),
      q
    );
  }
}

export async function transactCollection<N extends CollectionName, T>(
  name: N,
  fn: (rows: CollectionRow[N][]) => T
): Promise<T> {
  return enqueue(async () => {
    assertRtdb();
    let captured: T | undefined;
    let ran = false;
    const res = await rtdb(`${name}.transaction`, () =>
      getRtdb()
        .ref(`/${name}`)
        .transaction((current: unknown) => {
          const rows = toRows(name, current);
          captured = fn(rows);
          ran = true;
          return rows;
        })
    );
    if (!res.committed || !ran || captured === undefined) {
      throw new Error("rtdb transaction conflict — retry the request");
    }
    return captured;
  });
}

export async function pushToCollection<N extends CollectionName>(
  name: N,
  row: CollectionRow[N]
): Promise<CollectionRow[N]> {
  return transactCollection(name, (rows) => {
    rows.push(normalizeRow(name, row));
    return row;
  });
}

export async function setPath(path: string, value: unknown): Promise<void> {
  assertRtdb();
  await rtdb(`set:${path}`, () => getRtdb().ref(path).set(value));
}

export async function updatePaths(
  paths: Record<string, unknown>
): Promise<void> {
  assertRtdb();
  const keys = Object.keys(paths);
  if (keys.length === 0) return;
  await rtdb("multi.update", () => getRtdb().ref("/").update(paths));
}

export async function readPath<T>(path: string): Promise<T | null> {
  assertRtdb();
  const snap = await rtdb(`get:${path}`, () => getRtdb().ref(path).get());
  return (snap.val() ?? null) as T | null;
}

export function encodeEmailKey(email: string): string {
  return email.toLowerCase().replace(/\./g, ",");
}

export async function readUserById(id: string): Promise<User | null> {
  assertRtdb();
  try {
    const snap = await rtdb(`user.map:${id}`, () =>
      getRtdb().ref(`/users-by-id/${id}`).get()
    );
    const v = snap.val();
    if (v && typeof v === "object") return normalizeUser(v as User);
  } catch {
  }
  const users = await readCollection("users");
  return users.find((u) => u.id === id) ?? null;
}

export async function writeUserById(id: string, user: User): Promise<void> {
  await setPath(`/users-by-id/${id}`, user);
}

export async function transactLeaf<T>(
  path: string,
  fn: (current: unknown) => T | undefined
) {
  assertRtdb();
  return rtdb(`tx:${path}`, () => getRtdb().ref(path).transaction(fn));
}

export function newPushKey(collection: string): string {
  assertRtdb();
  const key = getRtdb().ref(`/${collection}`).push().key;
  if (!key) throw new Error("push key failed");
  return key;
}

export async function chunkedUpdate(
  entries: [string, unknown][],
  size = 500
): Promise<void> {
  for (let i = 0; i < entries.length; i += size) {
    await updatePaths(Object.fromEntries(entries.slice(i, i + size)));
  }
}

export async function readPostById(id: string): Promise<Post | null> {
  assertRtdb();
  try {
    const snap = await rtdb(`post.map:${id}`, () =>
      getRtdb().ref(`/posts-by-id/${id}`).get()
    );
    const v = snap.val();
    if (v && typeof v === "object") return normalizePost(v as Post);
  } catch {
  }
  const posts = await readCollection("posts");
  return posts.find((p) => p.id === id) ?? null;
}

export async function writePostById(id: string, post: Post): Promise<void> {
  await setPath(`/posts-by-id/${id}`, post);
}

export async function removePostById(id: string): Promise<void> {
  await setPath(`/posts-by-id/${id}`, null);
}

export async function indexUserHandles(
  user: Pick<User, "id" | "login42" | "name">,
  _prevName?: string | null
): Promise<void> {
  const paths: Record<string, unknown> = {
    [`/users-by-handle/${user.id.toLowerCase()}`]: user.id,
    [`/users-by-handle/${user.name.toLowerCase()}`]: user.id,
  };
  if (user.login42) paths[`/users-by-handle/${user.login42.toLowerCase()}`] = user.id;
  await updatePaths(paths);
}

export async function resolveUserId(handle: string): Promise<string | null> {
  assertRtdb();
  const h = handle.replace(/^@/, "").toLowerCase();
  for (const key of [`/users-by-handle/${h}`, `/users-by-handle/@${h}`]) {
    try {
      const snap = await rtdb(`handle:${h}`, () => getRtdb().ref(key).get());
      const v = snap.val();
      if (typeof v === "string" && v) return v;
    } catch {
    }
  }
  const users = await readCollection("users");
  return (
    users.find(
      (u) =>
        u.login42?.toLowerCase() === h ||
        u.name.toLowerCase() === h ||
        u.id === handle
    )?.id ?? null
  );
}

export function cachedUserById(id: string): Promise<User | null> {
  return cached(`user:${id}`, 30_000, () => readUserById(id));
}

export function bustUserCache(id: string): void {
  invalidatePrefix(`user:${id}`);
}

export type UserUpsert = {
  email: string;
  name: string;
  login42: string | null;
  googleId: string | null;
  avatar: string | null;
  campus: string | null;
  coalition: string | null;
};

export async function upsertUserByEmail(input: UserUpsert): Promise<User> {
  const key = `/users-by-email/${encodeEmailKey(input.email)}`;
  const pointed = await readPath<string>(key).catch(() => null);
  if (typeof pointed === "string" && pointed) {
    const existing = await readUserById(pointed);
    if (existing) {
      let dirty = false;
      if (input.googleId && !existing.googleId) {
        existing.googleId = input.googleId;
        dirty = true;
      }
      if (!existing.name && input.name) {
        existing.name = input.name;
        dirty = true;
      }
      if (input.avatar && existing.avatar !== input.avatar) {
        existing.avatar = input.avatar;
        dirty = true;
      }
      if (!existing.login42 && input.login42) {
        existing.login42 = input.login42;
        dirty = true;
      }
      if (input.campus && !existing.campus) {
        existing.campus = input.campus;
        dirty = true;
      }
      if (input.coalition && !existing.coalition) {
        existing.coalition = input.coalition;
        dirty = true;
      }
      if (dirty) {
        await writeUserById(existing.id, existing).catch(() => null);
        const entries = await readCollectionEntries("users").catch(() => []);
        const hit = entries.find(({ row }) => row.id === existing.id);
        if (hit)
          await setPath(`/users/${hit.key}`, existing).catch(() => null);
        await indexUserHandles(existing).catch(() => null);
        bustUserCache(existing.id);
      }
      return existing;
    }
  }
  const freshId = uid("u");
  const tx = await transactLeaf(key, (cur) =>
    typeof cur === "string" && cur ? undefined : freshId
  );
  if (!tx.committed) {
    const winner = await readPath<string>(key).catch(() => null);
    if (typeof winner === "string" && winner) {
      const racer = await readUserById(winner);
      if (racer) return racer;
    }
    throw new Error("signup race — retry the request");
  }
  const legacy = await readCollection("users").catch(() => []);
  const match = legacy.find(
    (u) => u.email.toLowerCase() === input.email.toLowerCase()
  );
  if (match) {
    await setPath(key, match.id).catch(() => null);
    return match;
  }
  const fresh: User = {
    id: freshId,
    email: input.email,
    name: input.name,
    login42: input.login42,
    googleId: input.googleId,
    avatar: input.avatar,
    campus: input.campus,
    coalition: input.coalition,
    bio: "",
    socials: [],
    cover: null,
    coverVideo: null,
    spotify: null,
    lastSeen: null,
    createdAt: new Date().toISOString(),
    nameLower: input.name.toLowerCase(),
    postsCount: 0,
    followersCount: 0,
    followingCount: 0,
  };
  await pushToCollection("users", fresh);
  await Promise.all([
    writeUserById(fresh.id, fresh).catch(() => null),
    indexUserHandles(fresh).catch(() => null),
  ]);
  return fresh;
}

export function uid(prefix = "id"): string {
  try {
    const uuid =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID().replace(/-/g, "").slice(0, 12)
        : null;
    if (uuid) return `${prefix}_${uuid}`;
  } catch {
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

export function userPublic(u: User) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    login42: u.login42,
    avatar: u.avatar,
    campus: u.campus,
    coalition: u.coalition,
    bio: u.bio,
    socials: Array.isArray(u.socials) ? u.socials : [],
    cover: u.cover ?? null,
    coverVideo: u.coverVideo ?? null,
    spotify: u.spotify ?? null,
    lastSeen: u.lastSeen ?? null,
    isSupport: isSupportUser(u),
  };
}
