// ============================================================
// Server-side request auth for route handlers (Admin SDK).
//
// Callers send `Authorization: Bearer <Firebase ID token>`.
// ============================================================
import type { DecodedIdToken } from 'firebase-admin/auth';
import { adminAuth, adminDb, isAdminConfigured } from '@/lib/firebase/admin';
import { UserStatus } from '@/lib/types';
import type { Role, UserProfile } from '@/lib/types';

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function errorResponse(err: unknown): Response {
  if (err instanceof HttpError) {
    return Response.json({ error: err.message }, { status: err.status });
  }
  console.error('API error:', err);
  return Response.json({ error: 'Something went wrong.' }, { status: 500 });
}

export function assertConfigured(): void {
  if (!isAdminConfigured()) {
    throw new HttpError(503, 'FIREBASE_SERVICE_ACCOUNT not configured.');
  }
}

/** Verifies the bearer ID token. Does not check for a user profile. */
export async function verifyRequest(req: Request): Promise<DecodedIdToken> {
  assertConfigured();

  const match = /^Bearer (.+)$/.exec(req.headers.get('authorization') ?? '');
  if (!match) throw new HttpError(401, 'Not signed in.');

  try {
    return await adminAuth().verifyIdToken(match[1]);
  } catch {
    throw new HttpError(401, 'Session expired. Sign in again.');
  }
}

export interface ActiveUser {
  uid: string;
  user: UserProfile;
  role: Role;
}

/** Verifies the token and loads the caller's active profile and role. */
export async function requireActiveUser(req: Request): Promise<ActiveUser> {
  const { uid } = await verifyRequest(req);

  const db = adminDb();
  const user = (await db.collection('users').doc(uid).get()).data() as UserProfile | undefined;
  if (!user || user.status !== UserStatus.ACTIVE) throw new HttpError(403, 'Access denied.');

  const role = (await db.collection('roles').doc(user.roleId).get()).data() as Role | undefined;
  if (!role) throw new HttpError(403, 'Access denied.');

  return {
    uid,
    user: { ...user, uid, assignedFeatureIds: user.assignedFeatureIds ?? [] },
    role,
  };
}
