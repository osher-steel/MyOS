import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldPath, FieldValue, getFirestore, Timestamp } from "firebase-admin/firestore";

function readCredential() {
  // In Cloud Functions / Cloud Run always use ADC (the built-in service
  // account). Explicit credentials from .env are only for local development.
  if (process.env.K_SERVICE ?? process.env.FUNCTION_TARGET) {
    return undefined;
  }

  const clientEmail = process.env.APP_FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.APP_FIREBASE_PRIVATE_KEY;

  if (!clientEmail && !privateKey) {
    return undefined;
  }

  if (!clientEmail || !privateKey) {
    throw new Error(
      "APP_FIREBASE_CLIENT_EMAIL and APP_FIREBASE_PRIVATE_KEY must both be set when using explicit Firebase credentials.",
    );
  }

  return cert({
    projectId: process.env.APP_FIREBASE_PROJECT_ID,
    clientEmail,
    privateKey: privateKey.replace(/\\n/g, "\n"),
  });
}

const credential = readCredential();
const projectId = process.env.APP_FIREBASE_PROJECT_ID;

export const firebaseAdminApp =
  getApps()[0] ??
  initializeApp({
    ...(projectId ? { projectId } : {}),
    ...(credential ? { credential } : {}),
  });

export const db = getFirestore(firebaseAdminApp);
export const auth = getAuth(firebaseAdminApp);

export { FieldPath, FieldValue, Timestamp };
