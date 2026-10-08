// ============================================================
// DELETE /api/admin/users/[uid]
//
// Permanently removes a user: their Firebase Auth login and their
// profile document. Activity logs and anything they created are kept.
//
// Requires a caller with canManageUsers. Only a super admin can
// delete another super admin, and nobody can delete themselves.
// ============================================================

import { NextRequest } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { errorResponse, HttpError, requireActiveUser } from '@/lib/server/auth';
import { LogAction, LogSeverity, RoleSlug } from '@/lib/types';
import type { UserProfile } from '@/lib/types';

type Context = { params: Promise<{ uid: string }> };

export async function DELETE(req: NextRequest, { params }: Context) {
  try {
    const { uid } = await params;
    const caller = await requireActiveUser(req);
    if (!caller.role.managementPermissions?.canManageUsers) {
      throw new HttpError(403, 'You do not have permission to delete users.');
    }
    if (uid === caller.uid) throw new HttpError(400, 'You cannot delete your own account.');

    const db = adminDb();
    const userRef = db.collection('users').doc(uid);
    const target = (await userRef.get()).data() as UserProfile | undefined;
    if (!target) throw new HttpError(404, 'User not found.');
    if (target.roleSlug === RoleSlug.SUPER_ADMIN && caller.role.slug !== RoleSlug.SUPER_ADMIN) {
      throw new HttpError(403, 'Only a super admin can delete a super admin.');
    }

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
