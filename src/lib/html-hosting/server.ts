// ============================================================
// HTML Hosting — server-side store, auth and password helpers.
//
// Everything lives in Firestore behind the Admin SDK:
//   hosted_pages/{id}                 metadata + password hash
//   hosted_pages/{id}/chunks/{...}    gzipped HTML, split to fit the
//                                     1 MiB document limit
//   hosted_uploads/{uploadId}         an upload in progress
// Security rules deny all client access to these collections, so a
// password-protected page can only be read through /s/{id}.
//
// Uploads arrive gzipped and in parts (see UPLOAD_PART_BYTES). Each
// upload writes its chunks under its own content id, and the page only
// switches to them once the whole file has arrived and been verified.
// ============================================================
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'crypto';
import { Readable } from 'stream';
import { createGunzip, gunzipSync } from 'zlib';
import { FieldPath, FieldValue, Timestamp, type DocumentData } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import { errorResponse, HttpError, requireActiveUser } from '@/lib/server/auth';
import { hasFeatureAccess } from '@/lib/utils/permissions';
import { RoleSlug, LogSeverity } from '@/lib/types';
import type { Feature } from '@/lib/types';
import {
  HTML_HOSTING_FEATURE_SLUG,
  MAX_HTML_BYTES,
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  UPLOAD_PART_BYTES,
  type HostedPage,
} from './types';

const COLLECTION = 'hosted_pages';
const UPLOADS = 'hosted_uploads';
const CHUNK_BYTES = 750 * 1024;
const STALE_UPLOAD_MS = 60 * 60 * 1000;
const UNLOCK_TTL_SECONDS = 7 * 24 * 60 * 60;
const ID_PATTERN = /^[A-Za-z0-9_-]{8,32}$/;

export { HttpError, errorResponse };

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
  const { uid, user, role } = await requireActiveUser(req);

  const featureSnap = await adminDb()
    .collection('features')
    .where('slug', '==', HTML_HOSTING_FEATURE_SLUG)
    .limit(1)
    .get();
  const featureDoc = featureSnap.docs[0];
  if (!featureDoc) throw new HttpError(403, 'Access denied.');

  const feature = { ...featureDoc.data(), featureId: featureDoc.id } as Feature;
  if (!hasFeatureAccess(user, role, feature, null)) throw new HttpError(403, 'Access denied.');

  return {
    uid,
    email: user.email,
    name: user.displayName || user.email,
    roleSlug: role.slug,
    isAdmin: role.slug === RoleSlug.ADMIN || role.slug === RoleSlug.SUPER_ADMIN,
  };
}

// ---- Input validation ----

export function validateHtmlFileName(raw: unknown): string {
  const name = typeof raw === 'string' ? raw.trim() : '';
  if (!/\.html?$/i.test(name)) throw new HttpError(400, 'Only .html files can be hosted.');
  return name.slice(0, 200);
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
  /** Which upload's chunks hold the content. Null for pages stored before chunked uploads. */
  contentId: string | null;
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
    contentId: data.contentId ?? null,
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

function chunksOf(pageId: string) {
  return pageRef(pageId).collection('chunks');
}

/** Chunk documents of one upload, in order. Ids are `{contentId}-{part}-{piece}`. */
async function loadChunks(pageId: string, contentId: string | null) {
  if (!contentId) {
    // Legacy layout: plain numeric ids.
    const snap = await chunksOf(pageId).get();
    return snap.docs.filter((d) => /^\d{4}$/.test(d.id)).sort((a, b) => a.id.localeCompare(b.id));
  }
  const snap = await chunksOf(pageId)
    .where(FieldPath.documentId(), '>=', `${contentId}-`)
    .where(FieldPath.documentId(), '<', `${contentId}.`)
    .get();
  return snap.docs.sort((a, b) => a.id.localeCompare(b.id));
}

async function deleteChunks(pageId: string, contentId: string | null): Promise<void> {
  const docs = await loadChunks(pageId, contentId);
  const writer = adminDb().bulkWriter();
  docs.forEach((d) => void writer.delete(d.ref));
  await writer.close();
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

/** The page's HTML as a stream, so large pages are never held decompressed in memory. */
export async function getPageHtmlStream(page: StoredPage): Promise<ReadableStream<Uint8Array>> {
  const docs = await loadChunks(page.id, page.contentId);
  const compressed = docs.map((d) => d.get('data') as Buffer);
  const html = Readable.from(compressed).pipe(createGunzip());
  return Readable.toWeb(html) as unknown as ReadableStream<Uint8Array>;
}

export async function updatePage(
  page: StoredPage,
  changes: {
    title?: string;
    /** string sets a new password, null removes it, undefined leaves it. */
    password?: string | null;
  }
): Promise<StoredPage> {
  const update: DocumentData = { updatedAt: FieldValue.serverTimestamp() };
  if (changes.title !== undefined) update.title = changes.title;
  if (changes.password !== undefined) Object.assign(update, passwordFields(changes.password));
  await pageRef(page.id).update(update);
  return (await getPage(page.id))!;
}

export async function deletePage(page: StoredPage): Promise<void> {
  await adminDb().recursiveDelete(pageRef(page.id));
}

// ---- Uploads ----

interface UploadSession {
  id: string;
  pageId: string;
  /** True when replacing the file of an existing page. */
  replace: boolean;
  ownerUid: string;
  fileName: string;
  partCount: number;
}

function uploadRef(uploadId: string) {
  return adminDb().collection(UPLOADS).doc(uploadId);
}

/** Removes the caller's abandoned uploads so their chunks don't pile up. */
async function cleanStaleUploads(caller: Caller): Promise<void> {
  const snap = await adminDb().collection(UPLOADS).where('ownerUid', '==', caller.uid).get();
  for (const doc of snap.docs) {
    const createdAt = doc.get('createdAt');
    if (!(createdAt instanceof Timestamp) || Date.now() - createdAt.toMillis() < STALE_UPLOAD_MS) continue;
    await deleteChunks(doc.get('pageId'), doc.id);
    await doc.ref.delete();
  }
}

export async function startUpload(input: {
  caller: Caller;
  fileName: string;
  sizeBytes: unknown;
  compressedBytes: unknown;
  /** Set to replace an existing page's file; the caller must be allowed to manage it. */
  replacePage: StoredPage | null;
}): Promise<{ uploadId: string; partCount: number }> {
  const { sizeBytes, compressedBytes } = input;
  if (!Number.isInteger(sizeBytes) || !Number.isInteger(compressedBytes)) {
    throw new HttpError(400, 'Missing file size.');
  }
  if ((sizeBytes as number) <= 0 || (compressedBytes as number) <= 0) {
    throw new HttpError(400, 'That file is empty.');
  }
  if ((sizeBytes as number) > MAX_HTML_BYTES || (compressedBytes as number) > MAX_HTML_BYTES) {
    throw new HttpError(413, `File is too large (max ${MAX_HTML_BYTES / 1024 / 1024} MB).`);
  }

  await cleanStaleUploads(input.caller).catch((err) => console.error('Stale upload cleanup failed:', err));

  const uploadId = randomBytes(8).toString('hex');
  const partCount = Math.ceil((compressedBytes as number) / UPLOAD_PART_BYTES);
  await uploadRef(uploadId).create({
    pageId: input.replacePage?.id ?? randomBytes(9).toString('base64url'),
    replace: Boolean(input.replacePage),
    ownerUid: input.caller.uid,
    fileName: input.fileName,
    partCount,
    createdAt: FieldValue.serverTimestamp(),
  });
  return { uploadId, partCount };
}

async function getUpload(uploadId: string, caller: Caller): Promise<UploadSession> {
  if (!/^[0-9a-f]{16}$/.test(uploadId)) throw new HttpError(404, 'Upload not found.');
  const data = (await uploadRef(uploadId).get()).data();
  if (!data || data.ownerUid !== caller.uid) throw new HttpError(404, 'Upload not found.');
  return { id: uploadId, ...data } as UploadSession;
}

export async function saveUploadPart(
  uploadId: string,
  part: number,
  bytes: Buffer,
  caller: Caller
): Promise<void> {
  const upload = await getUpload(uploadId, caller);
  if (!Number.isInteger(part) || part < 0 || part >= upload.partCount) {
    throw new HttpError(400, 'Invalid part number.');
  }
  if (bytes.length === 0 || bytes.length > UPLOAD_PART_BYTES) {
    throw new HttpError(413, 'Invalid part size.');
  }

  const batch = adminDb().batch();
  for (let offset = 0, piece = 0; offset < bytes.length; offset += CHUNK_BYTES, piece++) {
    const id = `${uploadId}-${String(part).padStart(4, '0')}-${String(piece).padStart(2, '0')}`;
    batch.set(chunksOf(upload.pageId).doc(id), { data: bytes.subarray(offset, offset + CHUNK_BYTES) });
  }
  await batch.commit();
}

/** Verifies the uploaded file and makes it the page's content. */
export async function completeUpload(
  uploadId: string,
  caller: Caller,
  options: { title: unknown; password: string | null }
): Promise<{ page: StoredPage; created: boolean }> {
  const upload = await getUpload(uploadId, caller);
  const docs = await loadChunks(upload.pageId, uploadId);

  const partsSeen = new Set(docs.map((d) => d.id.split('-')[1]));
  if (partsSeen.size !== upload.partCount) {
    throw new HttpError(400, 'The upload is incomplete. Please try again.');
  }

  // The browser did the compression, so check it really is a gzip of a file within the limit.
  let sizeBytes: number;
  try {
    sizeBytes = gunzipSync(Buffer.concat(docs.map((d) => d.get('data') as Buffer)), {
      maxOutputLength: MAX_HTML_BYTES,
    }).length;
  } catch {
    await deleteChunks(upload.pageId, uploadId);
    await uploadRef(uploadId).delete();
    throw new HttpError(400, `The upload was corrupted or is over ${MAX_HTML_BYTES / 1024 / 1024} MB. Please try again.`);
  }

  const ref = pageRef(upload.pageId);
  const content = {
    fileName: upload.fileName,
    sizeBytes,
    chunkCount: docs.length,
    contentId: uploadId,
    updatedAt: FieldValue.serverTimestamp(),
  };

  if (upload.replace) {
    const previous = await getManagedPage(upload.pageId, caller);
    await ref.update(content);
    await deleteChunks(upload.pageId, previous.contentId);
  } else {
    await ref.create({
      ...content,
      title: cleanTitle(options.title, upload.fileName.replace(/\.html?$/i, '')),
      ownerUid: caller.uid,
      ownerEmail: caller.email,
      ownerName: caller.name,
      ...passwordFields(options.password),
      createdAt: FieldValue.serverTimestamp(),
    });
  }
  await uploadRef(uploadId).delete();

  return { page: (await getPage(upload.pageId))!, created: !upload.replace };
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
