// ============================================================
// Firestore CRUD Helpers — All DFD Data Stores (D1-D6)
// ============================================================
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  addDoc,
  query,
  where,
  orderBy,
  limit,
  writeBatch,
  Timestamp,
  serverTimestamp,
  type DocumentData,
} from 'firebase/firestore';
import { db } from './config';
import type {
  UserProfile,
  Role,
  Feature,
  Invitation,
  ActivityLog,
  SystemSettings,
} from '@/lib/types';
import { LogAction, LogSeverity } from '@/lib/types';

// ---- Timestamp Helpers ----

function toDate(ts: unknown): Date {
  if (ts instanceof Timestamp) return ts.toDate();
  if (ts instanceof Date) return ts;
  if (typeof ts === 'string') return new Date(ts);
  return new Date();
}

function parseTimestamps<T extends DocumentData>(data: DocumentData): T {
  const result = { ...data };
  const dateFields = ['createdAt', 'updatedAt', 'lastLoginAt', 'expiresAt', 'acceptedAt', 'revokedAt'];
  for (const field of dateFields) {
    if (result[field]) {
      result[field] = toDate(result[field]);
    }
  }
  return result as T;
}

// ============================================================
// D1: Users Collection
// ============================================================

export async function getUser(uid: string): Promise<UserProfile | null> {
  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists()) return null;
  return parseTimestamps<UserProfile>({ ...snap.data(), uid: snap.id });
}

export async function createUser(userData: Partial<UserProfile> & { uid: string }): Promise<void> {
  const now = serverTimestamp();
  await setDoc(doc(db, 'users', userData.uid), {
    ...userData,
    createdAt: now,
    updatedAt: now,
    lastLoginAt: null,
  });
}

export async function updateUser(uid: string, data: Partial<UserProfile>): Promise<void> {
  await updateDoc(doc(db, 'users', uid), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

export async function updateLastLogin(uid: string): Promise<void> {
  await updateDoc(doc(db, 'users', uid), {
    lastLoginAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function listUsers(): Promise<UserProfile[]> {
  const snap = await getDocs(
    query(collection(db, 'users'), orderBy('createdAt', 'desc'))
  );
  return snap.docs.map((d) => parseTimestamps<UserProfile>({ ...d.data(), uid: d.id }));
}

export async function listUsersByStatus(status: string): Promise<UserProfile[]> {
  const snap = await getDocs(
    query(collection(db, 'users'), where('status', '==', status), orderBy('createdAt', 'desc'))
  );
  return snap.docs.map((d) => parseTimestamps<UserProfile>({ ...d.data(), uid: d.id }));
}

export async function getUserByEmail(email: string): Promise<UserProfile | null> {
  const snap = await getDocs(
    query(collection(db, 'users'), where('email', '==', email), limit(1))
  );
  if (snap.empty) return null;
  const d = snap.docs[0];
  return parseTimestamps<UserProfile>({ ...d.data(), uid: d.id });
}

export async function getUserCount(): Promise<number> {
  const snap = await getDocs(collection(db, 'users'));
  return snap.size;
}

export async function getActiveUserCount(): Promise<number> {
  const snap = await getDocs(
    query(collection(db, 'users'), where('status', '==', 'active'))
  );
  return snap.size;
}

// ============================================================
// D2: Roles Collection
// ============================================================

export async function getRoles(): Promise<Role[]> {
  const snap = await getDocs(collection(db, 'roles'));
  return snap.docs.map((d) => parseTimestamps<Role>({ ...d.data(), roleId: d.id }));
}

export async function getRoleBySlug(slug: string): Promise<Role | null> {
  const snap = await getDocs(
    query(collection(db, 'roles'), where('slug', '==', slug), limit(1))
  );
  if (snap.empty) return null;
  const d = snap.docs[0];
  return parseTimestamps<Role>({ ...d.data(), roleId: d.id });
}

export async function getRoleById(roleId: string): Promise<Role | null> {
  const snap = await getDoc(doc(db, 'roles', roleId));
  if (!snap.exists()) return null;
  return parseTimestamps<Role>({ ...snap.data(), roleId: snap.id });
}

// ============================================================
// D3: Features Collection
// ============================================================

export async function getFeatures(): Promise<Feature[]> {
  const snap = await getDocs(
    query(collection(db, 'features'), orderBy('sortOrder', 'asc'))
  );
  return snap.docs.map((d) => parseTimestamps<Feature>({ ...d.data(), featureId: d.id }));
}

export async function getActiveFeatures(): Promise<Feature[]> {
  const snap = await getDocs(
    query(
      collection(db, 'features'),
      where('status', '==', 'active'),
      orderBy('sortOrder', 'asc')
    )
  );
  return snap.docs.map((d) => parseTimestamps<Feature>({ ...d.data(), featureId: d.id }));
}

export async function getFeatureBySlug(slug: string): Promise<Feature | null> {
  const snap = await getDocs(
    query(collection(db, 'features'), where('slug', '==', slug), limit(1))
  );
  if (snap.empty) return null;
  const d = snap.docs[0];
  return parseTimestamps<Feature>({ ...d.data(), featureId: d.id });
}

export async function createFeature(data: Omit<Feature, 'featureId' | 'createdAt' | 'updatedAt'>): Promise<string> {
  const now = serverTimestamp();
  const ref = await addDoc(collection(db, 'features'), {
    ...data,
    createdAt: now,
    updatedAt: now,
  });
  return ref.id;
}

export async function updateFeature(featureId: string, data: Partial<Feature>): Promise<void> {
  await updateDoc(doc(db, 'features', featureId), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteFeature(featureId: string): Promise<void> {
  await deleteDoc(doc(db, 'features', featureId));
}

export async function updateFeaturesOrder(orders: { featureId: string; sortOrder: number }[]): Promise<void> {
  const batch = writeBatch(db);
  const now = serverTimestamp();
  for (const { featureId, sortOrder } of orders) {
    batch.update(doc(db, 'features', featureId), { sortOrder, updatedAt: now });
  }
  await batch.commit();
}

// ============================================================
// D4: Invitations Collection
// ============================================================

export async function createInvitation(data: Omit<Invitation, 'invitationId' | 'createdAt' | 'acceptedAt' | 'revokedAt' | 'acceptedBy'>): Promise<string> {
  const ref = await addDoc(collection(db, 'invitations'), {
    ...data,
    acceptedBy: null,
    acceptedAt: null,
    revokedAt: null,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function getInvitations(): Promise<Invitation[]> {
  const snap = await getDocs(
    query(collection(db, 'invitations'), orderBy('createdAt', 'desc'))
  );
  return snap.docs.map((d) => parseTimestamps<Invitation>({ ...d.data(), invitationId: d.id }));
}

export async function getInvitationByToken(token: string): Promise<Invitation | null> {
  const snap = await getDocs(
    query(collection(db, 'invitations'), where('token', '==', token), limit(1))
  );
  if (snap.empty) return null;
  const d = snap.docs[0];
  return parseTimestamps<Invitation>({ ...d.data(), invitationId: d.id });
}

export async function updateInvitation(invitationId: string, data: Partial<Invitation>): Promise<void> {
  await updateDoc(doc(db, 'invitations', invitationId), data);
}

export async function getPendingInvitationCount(): Promise<number> {
  const snap = await getDocs(
    query(collection(db, 'invitations'), where('status', '==', 'pending'))
  );
  return snap.size;
}

// ============================================================
// D5: Activity Logs Collection
// ============================================================

export async function writeActivityLog(
  userId: string,
  userEmail: string,
  userRole: string,
  action: LogAction,
  targetType: string,
  targetId: string | null = null,
  targetName: string | null = null,
  metadata: Record<string, unknown> = {},
  severity: LogSeverity = LogSeverity.INFO,
): Promise<void> {
  await addDoc(collection(db, 'activity_logs'), {
    userId,
    userEmail,
    userRole,
    action,
    targetType,
    targetId,
    targetName,
    metadata,
    severity,
    createdAt: serverTimestamp(),
  });
}

export async function getActivityLogs(limitCount: number = 50): Promise<ActivityLog[]> {
  const snap = await getDocs(
    query(collection(db, 'activity_logs'), orderBy('createdAt', 'desc'), limit(limitCount))
  );
  return snap.docs.map((d) => parseTimestamps<ActivityLog>({ ...d.data(), logId: d.id }));
}

export async function getActivityLogsByUser(userId: string, limitCount: number = 50): Promise<ActivityLog[]> {
  const snap = await getDocs(
    query(
      collection(db, 'activity_logs'),
      where('userId', '==', userId),
      orderBy('createdAt', 'desc'),
      limit(limitCount)
    )
  );
  return snap.docs.map((d) => parseTimestamps<ActivityLog>({ ...d.data(), logId: d.id }));
}

// ============================================================
// D6: System Settings Collection
// ============================================================

export async function getSystemSettings(): Promise<SystemSettings | null> {
  const snap = await getDoc(doc(db, 'system_settings', 'global'));
  if (!snap.exists()) return null;
  return parseTimestamps<SystemSettings>(snap.data());
}

export async function updateSystemSettings(data: Partial<SystemSettings>, updatedBy: string): Promise<void> {
  await setDoc(doc(db, 'system_settings', 'global'), {
    ...data,
    updatedAt: serverTimestamp(),
    updatedBy,
  }, { merge: true });
}
