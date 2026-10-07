// ============================================================
// Firebase Admin — server-only (route handlers). Never import
// this from a client component.
//
// Credentials, in order:
//   1. FIREBASE_SERVICE_ACCOUNT — the service account JSON, raw
//      or base64-encoded (use this on Vercel).
//   2. Application Default Credentials — GOOGLE_APPLICATION_CREDENTIALS
//      pointing at a key file locally, or the ambient identity on
//      Firebase App Hosting / Cloud Run.
// ============================================================
import { applicationDefault, cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

const APP_NAME = 'motherlink-admin';

export function isAdminConfigured(): boolean {
  return Boolean(
    process.env.FIREBASE_SERVICE_ACCOUNT ||
      process.env.GOOGLE_APPLICATION_CREDENTIALS ||
      process.env.K_SERVICE // Cloud Run / App Hosting: ambient credentials
  );
}

function loadCredential() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT?.trim();
  if (!raw) return applicationDefault();
  const json = raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
  return cert(JSON.parse(json));
}

function adminApp(): App {
  const existing = getApps().find((a) => a.name === APP_NAME);
  if (existing) return existing;
  return initializeApp(
    {
      credential: loadCredential(),
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    },
    APP_NAME
  );
}

export function adminAuth(): Auth {
  return getAuth(adminApp());
}

export function adminDb(): Firestore {
  return getFirestore(adminApp());
}
