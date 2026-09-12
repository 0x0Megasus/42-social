// Firebase Admin (server-only) for Realtime Database.
// Configured via FIREBASE_DATABASE_URL + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY.
// Imported only from server code (route handlers / server components).
import { cert, deleteApp, getApps, initializeApp, type App } from "firebase-admin/app";
import { getDatabase, type Database } from "firebase-admin/database";

let app: App | null = null;

export function isRtdbConfigured(): boolean {
  return Boolean(
    process.env.FIREBASE_DATABASE_URL &&
      process.env.FIREBASE_CLIENT_EMAIL &&
      process.env.FIREBASE_PRIVATE_KEY
  );
}

export function getRtdb(): Database {
  if (app) return getDatabase(app);
  const privateKey = (process.env.FIREBASE_PRIVATE_KEY ?? "").replace(
    /\\n/g,
    "\n"
  );
  app = getApps().length
    ? getApps()[0]!
    : initializeApp({
        credential: cert({
          projectId:
            process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ??
            process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey,
        }),
        databaseURL: process.env.FIREBASE_DATABASE_URL,
      });
  return getDatabase(app);
}

// A silently-dead RTDB socket hangs forever (long-lived dev process, NAT
// timeouts). Bound every op: on timeout drop the app so the next call
// reconnects fresh, and throw so routes fail loudly (500 + toast)
// instead of hanging clients forever.
const RTDB_TIMEOUT_MS = 20_000;

export class RtdbTimeoutError extends Error {
  constructor(label: string) {
    super(`rtdb timeout: ${label}`);
    this.name = "RtdbTimeoutError";
  }
}

function resetApp(): void {
  const a = app;
  app = null;
  if (a) void deleteApp(a).catch(() => null);
}

export async function rtdb<T>(label: string, fn: () => Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      fn(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new RtdbTimeoutError(label)), RTDB_TIMEOUT_MS);
      }),
    ]);
  } catch (e) {
    if (e instanceof RtdbTimeoutError) resetApp();
    throw e;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
