import { getRtdb, isRtdbConfigured } from "@/lib/fbrdb";

// Storage engine: Firebase Realtime Database, ONLY.
// The server refuses to boot routes without the three FIREBASE_* env vars,
// so data can never silently fall back to an insecure local store.
// Public API below is unchanged — routes don't touch the transport.

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
  lastSeen: string | null;
  createdAt: string;
};

export type Post = {
  id: string;
  authorId: string;
  body: string;
  image: string | null;
  edited: boolean;
  deleted: boolean;
  createdAt: string;
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

export type Message = {
  id: string;
  convoId: string;
  senderId: string;
  body: string;
  kind: "text" | "sticker";
  read: boolean;
  edited: boolean;
  deleted: boolean;
  replyTo: QuotedReply;
  createdAt: string;
};

type DB = {
  users: User[];
  posts: Post[];
  comments: Comment[];
  likes: { postId: string; userId: string }[];
  follows: { followerId: string; followingId: string }[];
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

// Serialize all DB access: prevents lost updates when requests interleave
// or when two processes (e.g. :3000 + :3101) share the same file.
let mutex: Promise<void> = Promise.resolve();

function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const run = mutex.then(fn, fn);
  mutex = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

function normalize(db: DB): DB {
  for (const u of db.users) {
    if (!("lastSeen" in u)) (u as User).lastSeen = null;
  }
  for (const p of db.posts) {
    if (!("edited" in p)) (p as Post).edited = false;
    if (!("deleted" in p)) (p as Post).deleted = false;
  }
  for (const c of db.comments) {
    if (!("kind" in c)) (c as Comment).kind = "text";
    if (!("edited" in c)) (c as Comment).edited = false;
    if (!("deleted" in c)) (c as Comment).deleted = false;
    if (!("replyTo" in c)) (c as Comment).replyTo = null;
  }
  for (const m of db.messages) {
    if (!("kind" in m)) (m as Message).kind = "text";
    if (!("read" in m)) (m as Message).read = true;
    if (!("edited" in m)) (m as Message).edited = false;
    if (!("deleted" in m)) (m as Message).deleted = false;
    if (!("replyTo" in m)) (m as Message).replyTo = null;
  }
  db.conversations ??= [];
  db.messages ??= [];
  return db;
}

async function readFresh(): Promise<DB> {
  assertRtdb();
  const snap = await getRtdb().ref("/").get();
  return normalize({ ...empty, ...((snap.val() ?? {}) as Partial<DB>) });
}

// Fresh read (never stale).
export async function readDB(): Promise<DB> {
  return enqueue(readFresh);
}

// Atomic read-modify-write via RTDB root transaction (safe across instances).
// `fn` must be SYNCHRONOUS and side-effect free (may run more than once).
// Do NOT call readDB inside `fn`.
export async function updateDB<T>(fn: (db: DB) => T): Promise<T> {
  return enqueue(async () => {
    assertRtdb();
    let captured: T | undefined;
    let ran = false;
    const res = await getRtdb()
      .ref("/")
      .transaction((current: unknown) => {
        const db = normalize({
          ...empty,
          ...((current ?? {}) as Partial<DB>),
        });
        captured = fn(db);
        ran = true;
        return db;
      });
    if (!res.committed || !ran || captured === undefined) {
      throw new Error("rtdb transaction conflict — retry the request");
    }
    return captured;
  });
}

export function uid(prefix = "id"): string {
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
    lastSeen: u.lastSeen ?? null,
  };
}
