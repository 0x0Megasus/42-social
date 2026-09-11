// Firebase Admin (server-only) for Realtime Database.
// Configured via FIREBASE_DATABASE_URL + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY.
// Imported only from server code (route handlers / server components).
import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
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
