import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from "firebase/auth";

// Firebase web config is public by design; access is enforced by the API, not by hiding these
const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export const firebaseConfigured = Boolean(config.apiKey && config.authDomain && config.projectId);

export async function googleIdToken(): Promise<string> {
  const auth = getAuth(getApps().length ? getApp() : initializeApp(config));
  const { user } = await signInWithPopup(auth, new GoogleAuthProvider());
  const token = await user.getIdToken();
  // The server keeps its own session cookie, so the browser needn't stay signed in to Firebase
  await signOut(auth);
  return token;
}
