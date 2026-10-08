// ============================================================
// /api/admin/users/[uid]
//
// PATCH  — JSON, any of:
//            roleSlug            change the user's role
//            assignedFeatureIds  replace the user's individual tool access
// DELETE — permanently removes a user: their Firebase Auth login and
//          their profile document. Activity logs and anything they
//          created are kept.
//
// Requires a caller with canManageUsers. Only a super admin can change
// or delete a super admin, or make someone one. Nobody can change their
// own role or delete themselves.
// ============================================================

import { NextRequest } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { errorResponse, HttpError, requireActiveUser } from '@/lib/server/auth';
import { LogAction, LogSeverity, RoleSlug } from '@/lib/types';
import type { UserProfile } from '@/lib/types';
import type { ActiveUser } from '@/lib/server/auth';

type Context = { params: Promise<{ uid: string }> };

/** Loads the target user and checks the caller is allowed to manage them. */
async function loadManagedUser(uid: string, caller: ActiveUser) {
  if (!caller.role.managementPermissions?.canManageUsers) {
    throw new HttpError(403, 'You do not have permission to manage users.');
  }
  const ref = adminDb().collection('users').doc(uid);
  const target = (await ref.get()).data() as UserProfile | undefined;
  if (!target) throw new HttpError(404, 'User not found.');
  if (target.roleSlug === RoleSlug.SUPER_ADMIN && caller.role.slug !== RoleSlug.SUPER_ADMIN) {
    throw new HttpError(403, 'Only a super admin can change a super admin.');
  }
  return { ref, target };
}

export async function PATCH(req: NextRequest, { params }: Context) {
  try {
    const { uid } = await params;
    const caller = await requireActiveUser(req);
    const { ref, target } = await loadManagedUser(uid, caller);

    const body = (await req.json().catch(() => null)) as {
      roleSlug?: unknown;
      assignedFeatureIds?: unknown;
    } | null;
    if (!body) throw new HttpError(400, 'Invalid JSON body.');

    const db = adminDb();
    const update: Record<string, unknown> = {};
    const logs: { action: LogAction; metadata: Record<string, unknown> }[] = [];

    if (body.roleSlug !== undefined && body.roleSlug !== target.roleSlug) {
      if (uid === caller.uid) throw new HttpError(400, 'You cannot change your own role.');
      if (!Object.values(RoleSlug).includes(body.roleSlug as RoleSlug)) {
        throw new HttpError(400, 'Unknown role.');
      }
      const roleSlug = body.roleSlug as RoleSlug;
      if (roleSlug === RoleSlug.SUPER_ADMIN && caller.role.slug !== RoleSlug.SUPER_ADMIN) {
        throw new HttpError(403, 'Only a super admin can make someone a super admin.');
      }
      const roleSnap = await db.collection('roles').where('slug', '==', roleSlug).limit(1).get();
      if (roleSnap.empty) throw new HttpError(400, 'Unknown role.');
      update.roleSlug = roleSlug;
      update.roleId = roleSnap.docs[0].id;
      logs.push({ action: LogAction.USER_ROLE_CHANGED, metadata: { from: target.roleSlug, to: roleSlug } });
    }

    if (body.assignedFeatureIds !== undefined) {
      const ids = body.assignedFeatureIds;
      if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string')) {
        throw new HttpError(400, 'assignedFeatureIds must be a list of feature ids.');
      }
      const known = new Set((await db.collection('features').get()).docs.map((d) => d.id));
      const assigned = [...new Set(ids as string[])];
      if (assigned.some((id) => !known.has(id))) throw new HttpError(400, 'Unknown feature.');
      update.assignedFeatureIds = assigned;
      logs.push({
        action: LogAction.USER_UPDATED,
        metadata: { assignedFeatureIds: assigned, previous: target.assignedFeatureIds ?? [] },
      });
    }

    if (Object.keys(update).length === 0) throw new HttpError(400, 'Nothing to update.');

    const batch = db.batch();
    batch.update(ref, { ...update, updatedAt: FieldValue.serverTimestamp() });
    for (const log of logs) {
      batch.create(db.collection('activity_logs').doc(), {
        userId: caller.uid,
        userEmail: caller.user.email,
        userRole: caller.role.slug,
        action: log.action,
        targetType: 'user',
        targetId: uid,
        targetName: target.displayName || target.email,
        metadata: log.metadata,
        severity: LogSeverity.INFO,
        createdAt: FieldValue.serverTimestamp(),
      });
    }
    await batch.commit();

    return Response.json({ user: update });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(req: NextRequest, { params }: Context) {
  try {
    const { uid } = await params;
    const caller = await requireActiveUser(req);
    if (uid === caller.uid) throw new HttpError(400, 'You cannot delete your own account.');
    const { ref: userRef, target } = await loadManagedUser(uid, caller);
    const db = adminDb();

    // Login first: if this fails the profile is still there and the delete can be retried.
    try {
      await adminAuth().deleteUser(uid);
    } catch (err) {
      if ((err as { code?: string }).code !== 'auth/user-not-found') throw err;
    }
    await userRef.delete();

    await db.collection('activity_logs').add({
      userId: caller.uid,
      userEmail: caller.user.email,
      userRole: caller.role.slug,
      action: LogAction.USER_DELETED,
      targetType: 'user',
      targetId: uid,
      targetName: target.displayName || target.email,
      metadata: { email: target.email, roleSlug: target.roleSlug },
      severity: LogSeverity.WARNING,
      createdAt: FieldValue.serverTimestamp(),
    });

    return Response.json({ success: true });
  } catch (err) {
    return errorResponse(err);
  }
}
