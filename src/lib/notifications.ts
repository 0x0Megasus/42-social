import {
  newPushKey,
  queryCollection,
  readCollection,
  readPath,
  setPath,
  updatePaths,
  type Notification,
} from "@/lib/db";

// Notifications live in per-user keyed maps:
//   /notifications-by-user/{userId}/{pushKey} = Notification
// Reads, mark-read, and deletes are all O(my notifications) — never a
// scan of everyone's. Legacy /notifications array rows (pre-map) are
// merged on read and mirrored by the backfill; new code writes maps only.

export function newNotification(
  userId: string,
  kind: Notification["kind"],
  fromId: string,
  postId: string | null
): Notification {
  const now = new Date().toISOString();
  return {
    id: `n_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    userId,
    kind,
    fromId,
    postId,
    read: false,
    createdAt: now,
  };
}

export async function pushNotification(n: Notification): Promise<void> {
  const key = newPushKey(`notifications-by-user/${n.userId}`);
  await setPath(`/notifications-by-user/${n.userId}/${key}`, n);
}

function validNotification(v: unknown): v is Notification {
  return (
    !!v &&
    typeof v === "object" &&
    typeof (v as Notification).id === "string" &&
    typeof (v as Notification).userId === "string"
  );
}

export async function listNotifications(
  userId: string,
  limit = 30
): Promise<Notification[]> {
  const [mapVal, legacy] = await Promise.all([
    readPath<Record<string, Notification>>(
      `/notifications-by-user/${userId}`
    ).catch(() => null),
    queryCollection("notifications", {
      orderBy: "userId",
      equalTo: userId,
      limit: Math.max(limit, 30),
    }).catch((): Notification[] => []),
  ]);
  const seen = new Map<string, Notification>();
  if (mapVal && typeof mapVal === "object") {
    for (const v of Object.values(mapVal)) {
      if (validNotification(v)) seen.set(v.id, v);
    }
  }
  for (const n of legacy) if (!seen.has(n.id)) seen.set(n.id, n);
  return [...seen.values()]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}

export async function markAllRead(userId: string): Promise<void> {
  const [mapVal, legacy] = await Promise.all([
    readPath<Record<string, Notification>>(
      `/notifications-by-user/${userId}`
    ).catch(() => null),
    queryCollection("notifications", {
      orderBy: "userId",
      equalTo: userId,
      limit: 500,
    }).catch((): Notification[] => []),
  ]);
  const paths: Record<string, unknown> = {};
  if (mapVal && typeof mapVal === "object") {
    for (const [key, n] of Object.entries(mapVal)) {
      if (validNotification(n) && !n.read)
        paths[`/notifications-by-user/${userId}/${key}/read`] = true;
    }
  }
  // Legacy rows are addressed by storage index — resolve fresh per call.
  if (legacy.length > 0) {
    const all = await readCollection("notifications").catch(() => []);
    all.forEach((n, i) => {
      if (n.userId === userId && !n.read)
        paths[`/notifications/${i}/read`] = true;
    });
  }
  await updatePaths(paths);
}

export async function deleteNotifications(
  userId: string,
  id: string | null
): Promise<number> {
  const mapVal = await readPath<Record<string, Notification>>(
    `/notifications-by-user/${userId}`
  ).catch(() => null);
  const paths: Record<string, unknown> = {};
  let removed = 0;
  if (mapVal && typeof mapVal === "object") {
    for (const [key, n] of Object.entries(mapVal)) {
      if (validNotification(n) && (id === null || n.id === id)) {
        paths[`/notifications-by-user/${userId}/${key}`] = null;
        removed++;
      }
    }
  }
  if (id === null || removed === 0) {
    const all = await readCollection("notifications").catch(() => []);
    all.forEach((n, i) => {
      if (n.userId === userId && (id === null || n.id === id)) {
        paths[`/notifications/${i}`] = null;
        removed++;
      }
    });
  }
  await updatePaths(paths);
  return removed;
}
