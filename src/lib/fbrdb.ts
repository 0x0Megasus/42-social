import { cert, deleteApp, getApps, initializeApp, type App } from "firebase-admin/app";
import { getDatabase, type Database } from "firebase-admin/database";

export function isRtdbConfigured(): boolean {
  return Boolean(
    process.env.FIREBASE_DATABASE_URL &&
      process.env.FIREBASE_CLIENT_EMAIL &&
      process.env.FIREBASE_PRIVATE_KEY
  );
}

function initApp(): App {
  const found = getApps()[0];
  if (found) return found;
  const privateKey = (process.env.FIREBASE_PRIVATE_KEY ?? "").replace(
    /\\n/g,
    "\n"
  );
  return initializeApp({
    credential: cert({
      projectId:
        process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ??
        process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey,
    }),
    databaseURL: process.env.FIREBASE_DATABASE_URL,
  });
}

function dropApps(): void {
  for (const a of getApps()) void deleteApp(a).catch(() => null);
}

export function getRtdb(): Database {
  try {
    const existing = getApps()[0];
    if (existing) return getDatabase(existing);
  } catch {
    dropApps();
  }
  try {
    return getDatabase(initApp());
  } catch {
    dropApps();
    return getDatabase(initApp());
  }
}

const RTDB_TIMEOUT_MS = 20_000;

export class RtdbTimeoutError extends Error {
  constructor(label: string) {
    super(`rtdb timeout: ${label}`);
    this.name = "RtdbTimeoutError";
  }
}

function resetApp(): void {
  dropApps();
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
