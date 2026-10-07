// ============================================================
// HTML Hosting — server-side store, auth and password helpers.
//
// Everything lives in Firestore behind the Admin SDK:
//   hosted_pages/{id}              metadata + password hash
//   hosted_pages/{id}/chunks/{n}   gzipped HTML, split to fit the
//                                  1 MiB document limit
// Security rules deny all client access to these collections, so a
// password-protected page can only be read through /s/{id}.
// ============================================================
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'crypto';
import { gunzipSync, gzipSync } from 'zlib';
import { FieldValue, Timestamp, type DocumentData } from 'firebase-admin/firestore';
import { adminAuth, adminDb, isAdminConfigured } from '@/lib/firebase/admin';
import { hasFeatureAccess } from '@/lib/utils/permissions';
import { RoleSlug, UserStatus, LogSeverity } from '@/lib/types';
import type { Feature, Role, UserProfile } from '@/lib/types';
import {
  HTML_HOSTING_FEATURE_SLUG,
  MAX_HTML_BYTES,
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  type HostedPage,
} from './types';

const COLLECTION = 'hosted_pages';
const CHUNK_BYTES = 800 * 1024;
const UNLOCK_TTL_SECONDS = 7 * 24 * 60 * 60;
const ID_PATTERN = /^[A-Za-z0-9_-]{8,32}$/;

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function errorResponse(err: unknown): Response {
  if (err instanceof HttpError) {
    return Response.json({ error: err.message }, { status: err.status });
  }
  console.error('html-hosting error:', err);
  return Response.json({ error: 'Something went wrong.' }, { status: 500 });
}

export function assertConfigured(): void {
  if (!isAdminConfigured()) {
    throw new HttpError(503, 'FIREBASE_SERVICE_ACCOUNT not configured.');
  }
}

// ---- Caller auth ----

export interface Caller {
  uid: string;
  email: string;
  name: string;
  roleSlug: RoleSlug;
  isAdmin: boolean;
}

/** Verifies the Firebase ID token and that the user may use this tool. */
export async function requireCaller(req: Request): Promise<Caller> {
  assertConfigured();

  const match = /^Bearer (.+)$/.exec(req.headers.get('authorization') ?? '');
  if (!match) throw new HttpError(401, 'Not signed in.');

  let uid: string;
  try {
    uid = (await adminAuth().verifyIdToken(match[1])).uid;
  } catch {
    throw new HttpError(401, 'Session expired. Sign in again.');
  }

  const db = adminDb();
  const user = (await db.collection('users').doc(uid).get()).data() as UserProfile | undefined;
  if (!user || user.status !== UserStatus.ACTIVE) throw new HttpError(403, 'Access denied.');

  const [roleSnap, featureSnap] = await Promise.all([
    db.collection('roles').doc(user.roleId).get(),
    db.collection('features').where('slug', '==', HTML_HOSTING_FEATURE_SLUG).limit(1).get(),
  ]);
  const role = roleSnap.data() as Role | undefined;
  const featureDoc = featureSnap.docs[0];
  if (!role || !featureDoc) throw new HttpError(403, 'Access denied.');

  const feature = { ...featureDoc.data(), featureId: featureDoc.id } as Feature;
  const profile = { ...user, assignedFeatureIds: user.assignedFeatureIds ?? [] };
  if (!hasFeatureAccess(profile, role, feature, null)) throw new HttpError(403, 'Access denied.');

  return {
    uid,
    email: user.email,
    name: user.displayName || user.email,
    roleSlug: role.slug,
    isAdmin: role.slug === RoleSlug.ADMIN || role.slug === RoleSlug.SUPER_ADMIN,
  };
}

// ---- Input validation ----

export async function readHtmlFile(file: File): Promise<Buffer> {
  const name = file.name.toLowerCase();
  if (!name.endsWith('.html') && !name.endsWith('.htm') && file.type !== 'text/html') {
    throw new HttpError(400, 'Only .html files can be hosted.');
  }
  if (file.size === 0) throw new HttpError(400, 'That file is empty.');
  if (file.size > MAX_HTML_BYTES) {
    throw new HttpError(413, `File is too large (max ${MAX_HTML_BYTES / 1024 / 1024} MB).`);
  }
  return Buffer.from(await file.arrayBuffer());
}

export function cleanTitle(raw: unknown, fallback: string): string {
  const title = typeof raw === 'string' ? raw.trim() : '';
  return (title || fallback).slice(0, 120);
}

export function validatePassword(raw: unknown): string {
  if (typeof raw !== 'string' || raw.length < MIN_PASSWORD_LENGTH) {
    throw new HttpError(400, `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
  if (raw.length > MAX_PASSWORD_LENGTH) throw new HttpError(400, 'Password is too long.');
  return raw;
}

// ---- Passwords & unlock cookies ----

interface PasswordFields {
  passwordSalt: string | null;
  passwordHash: string | null;
}

function hashPassword(password: string, salt: string): Buffer {
  return scryptSync(password, Buffer.from(salt, 'hex'), 32);
}

export function passwordFields(password: string | null): PasswordFields {
  if (!password) return { passwordSalt: null, passwordHash: null };
  const salt = randomBytes(16).toString('hex');
  return { passwordSalt: salt, passwordHash: hashPassword(password, salt).toString('hex') };
}

export function checkPassword(page: StoredPage, password: string): boolean {
  if (!page.passwordSalt || !page.passwordHash) return false;
  if (password.length > MAX_PASSWORD_LENGTH) return false;
  const expected = Buffer.from(page.passwordHash, 'hex');
  const actual = hashPassword(password, page.passwordSalt);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function unlockCookieName(id: string): string {
  return `mlhp_${id}`;
}

// The cookie is signed with the page's password hash, which never leaves the
// server, so changing or removing the password invalidates every old cookie.
function signUnlock(page: StoredPage, expires: number): string {
  return createHmac('sha256', page.passwordHash ?? '')
    .update(`${page.id}.${expires}`)
    .digest('base64url');
}

export function createUnlockCookie(page: StoredPage, secure: boolean): string {
  const expires = Math.floor(Date.now() / 1000) + UNLOCK_TTL_SECONDS;
  const value = `${expires}.${signUnlock(page, expires)}`;
  return [
    `${unlockCookieName(page.id)}=${value}`,
    `Path=/s/${page.id}`,
    `Max-Age=${UNLOCK_TTL_SECONDS}`,
    'HttpOnly',
    'SameSite=Lax',
    ...(secure ? ['Secure'] : []),
  ].join('; ');
}

export function isUnlocked(page: StoredPage, cookieValue: string | undefined): boolean {
  if (!page.passwordHash || !cookieValue) return false;
  const [expiresRaw, signature] = cookieValue.split('.');
  const expires = Number(expiresRaw);
  if (!signature || !Number.isInteger(expires) || expires < Date.now() / 1000) return false;
  const expected = Buffer.from(signUnlock(page, expires));
  const actual = Buffer.from(signature);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

// ---- Store ----

export interface StoredPage extends PasswordFields {
  id: string;
  title: string;
  fileName: string;
  sizeBytes: number;
  chunkCount: number;
  ownerUid: string;
  ownerEmail: string;
  ownerName: string;
  createdAt: Date;
  updatedAt: Date;
}

function toDate(value: unknown): Date {
  return value instanceof Timestamp ? value.toDate() : new Date();
}

function fromDoc(id: string, data: DocumentData): StoredPage {
  return {
    id,
    title: data.title,
    fileName: data.fileName,
    sizeBytes: data.sizeBytes,
    chunkCount: data.chunkCount,
    ownerUid: data.ownerUid,
    ownerEmail: data.ownerEmail,
    ownerName: data.ownerName,
    passwordSalt: data.passwordSalt ?? null,
    passwordHash: data.passwordHash ?? null,
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
  };
}

export function toHostedPage(page: StoredPage, caller: Caller): HostedPage {
  return {
    id: page.id,
    title: page.title,
    fileName: page.fileName,
    sizeBytes: page.sizeBytes,
    hasPassword: Boolean(page.passwordHash),
    ownerUid: page.ownerUid,
    ownerName: page.ownerName,
    createdAt: page.createdAt.toISOString(),
    updatedAt: page.updatedAt.toISOString(),
    canManage: caller.isAdmin || caller.uid === page.ownerUid,
  };
}

function pageRef(id: string) {
  return adminDb().collection(COLLECTION).doc(id);
}

function chunkId(index: number): string {
  return String(index).padStart(4, '0');
}

function splitChunks(html: Buffer): Buffer[] {
  const zipped = gzipSync(html);
  const chunks: Buffer[] = [];
  for (let offset = 0; offset < zipped.length; offset += CHUNK_BYTES) {
    chunks.push(zipped.subarray(offset, offset + CHUNK_BYTES));
  }
  return chunks;
}

export async function getPage(id: string): Promise<StoredPage | null> {
  if (!ID_PATTERN.test(id)) return null;
  const snap = await pageRef(id).get();
  const data = snap.data();
  return data ? fromDoc(id, data) : null;
}

/** Loads a page the caller is allowed to modify, or throws. */
export async function getManagedPage(id: string, caller: Caller): Promise<StoredPage> {
  const page = await getPage(id);
  if (!page) throw new HttpError(404, 'Page not found.');
  if (!caller.isAdmin && caller.uid !== page.ownerUid) {
    throw new HttpError(403, 'Only the owner or an admin can change this page.');
  }
  return page;
}

export async function listPages(): Promise<StoredPage[]> {
  const snap = await adminDb().collection(COLLECTION).orderBy('createdAt', 'desc').limit(200).get();
  return snap.docs.map((d) => fromDoc(d.id, d.data()));
}

export async function getPageHtml(page: StoredPage): Promise<Buffer> {
  const snap = await pageRef(page.id).collection('chunks').get();
  const parts = snap.docs
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((d) => d.get('data') as Buffer);
  return gunzipSync(Buffer.concat(parts));
}

export async function createPage(input: {
  html: Buffer;
  title: string;
  fileName: string;
  password: string | null;
  caller: Caller;
}): Promise<StoredPage> {
  const id = randomBytes(9).toString('base64url');
  const ref = pageRef(id);
  const chunks = splitChunks(input.html);

  const batch = adminDb().batch();
  batch.create(ref, {
    title: input.title,
    fileName: input.fileName,
    sizeBytes: input.html.length,
    chunkCount: chunks.length,
    ownerUid: input.caller.uid,
    ownerEmail: input.caller.email,
    ownerName: input.caller.name,
    ...passwordFields(input.password),
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  chunks.forEach((data, i) => batch.set(ref.collection('chunks').doc(chunkId(i)), { data }));
  await batch.commit();

  return (await getPage(id))!;
}

export async function updatePage(
  page: StoredPage,
  changes: {
    title?: string;
    /** string sets a new password, null removes it, undefined leaves it. */
    password?: string | null;
    file?: { html: Buffer; fileName: string };
  }
): Promise<StoredPage> {
  const ref = pageRef(page.id);
  const batch = adminDb().batch();
  const update: DocumentData = { updatedAt: FieldValue.serverTimestamp() };

  if (changes.title !== undefined) update.title = changes.title;
  if (changes.password !== undefined) Object.assign(update, passwordFields(changes.password));
  if (changes.file) {
    const chunks = splitChunks(changes.file.html);
    update.fileName = changes.file.fileName;
    update.sizeBytes = changes.file.html.length;
    update.chunkCount = chunks.length;
    chunks.forEach((data, i) => batch.set(ref.collection('chunks').doc(chunkId(i)), { data }));
    for (let i = chunks.length; i < page.chunkCount; i++) {
      batch.delete(ref.collection('chunks').doc(chunkId(i)));
    }
  }

  batch.update(ref, update);
  await batch.commit();
  return (await getPage(page.id))!;
}

export async function deletePage(page: StoredPage): Promise<void> {
  await adminDb().recursiveDelete(pageRef(page.id));
}

// ---- Activity log (same shape as writeActivityLog on the client) ----

export async function logHostingActivity(
  caller: Caller,
  action: string,
  page: StoredPage,
  metadata: Record<string, unknown> = {}
): Promise<void> {
  try {
    await adminDb().collection('activity_logs').add({
      userId: caller.uid,
      userEmail: caller.email,
      userRole: caller.roleSlug,
      action,
      targetType: 'hosted_page',
      targetId: page.id,
      targetName: page.title,
      metadata,
      severity: LogSeverity.INFO,
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch (err) {
    console.error('Failed to write hosting activity log:', err);
  }
}
