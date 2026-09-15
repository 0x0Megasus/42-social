"use client";

// Firebase (Google provider) client — lazy so first paint stays fast.
let app: unknown | null = null;

export async function getFirebaseApp() {
  if (app) return app as never;
  const { initializeApp, getApps } = await import("firebase/app");
  const { getAuth } = await import("firebase/auth");
  void getAuth; // keep auth chunk-split with app
  const config = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "",
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "",
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "",
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? "",
  };
  if (!config.apiKey) throw new Error("Firebase env missing (.env.local)");
  const { getApps: ga } = { getApps };
  void ga;
  app = getApps().length
    ? getApps()[0]
    : initializeApp(config);
  return app as never;
}

export async function signInWithGoogle(): Promise<string> {
  const fbApp = (await getFirebaseApp()) as never;
  const [{ getAuth, GoogleAuthProvider, signInWithPopup, signOut }] = [
    await import("firebase/auth"),
  ];
  const auth = getAuth(fbApp as never);
  // Always start from a clean Firebase state: after an app-level logout
  // the Firebase user stays signed in (IndexedDB), and reusing that stale
  // session makes the next popup misbehave (instant-close / cancelled).
  // Signing out first forces a real account chooser every attempt.
  await signOut(auth).catch(() => null);
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  const cred = await signInWithPopup(auth, provider);
  return cred.user.getIdToken();
}

// Best-effort Firebase sign-out (call on app logout so no stale Google
// session lingers for the next login attempt).
export async function signOutFirebase(): Promise<void> {
  try {
    const fbApp = (await getFirebaseApp()) as never;
    const { getAuth, signOut } = await import("firebase/auth");
    await signOut(getAuth(fbApp as never)).catch(() => null);
  } catch {
    /* Firebase unavailable — app session logout already happened server-side */
  }
}
