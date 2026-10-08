// ============================================================
// POST /api/auth/google
//
// Called by the client right after a Google sign-in when the user
// has no profile yet. Creates the profile server-side:
//   - from a pending invitation for that email (role + tools from
//     the invitation), or
//   - as an Employee if the email is on the company domain.
// Anyone else is rejected and their just-created auth account removed.
//
// Requires `Authorization: Bearer <Firebase ID token>`.
// ============================================================

import { NextRequest } from 'next/server';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { errorResponse, HttpError, verifyRequest } from '@/lib/server/auth';
import { InvitationStatus, LogAction, LogSeverity, RoleSlug, UserStatus } from '@/lib/types';

// Google accounts on this domain may join without an invitation.
const SIGNUP_DOMAIN = (process.env.SIGNUP_ALLOWED_DOMAIN || 'motherlink.io').toLowerCase();

async function findPendingInvitation(email: string, rawEmail: string) {
  const snap = await adminDb()
    .collection('invitations')
    .where('email', 'in', [...new Set([email, rawEmail])])
    .get();
  return snap.docs.find((d) => {
    const expiresAt = d.get('expiresAt');
    const expired = expiresAt instanceof Timestamp && expiresAt.toMillis() < Date.now();
    return d.get('status') === InvitationStatus.PENDING && !expired;
  });
}

export async function POST(req: NextRequest) {
  try {
    const token = await verifyRequest(req);
    if (token.firebase.sign_in_provider !== 'google.com') {
      throw new HttpError(400, 'This endpoint is for Google sign-in only.');
    }
    if (!token.email || !token.email_verified) {
      throw new HttpError(403, 'Your Google account email is not verified.');
    }

    const db = adminDb();
    const userRef = db.collection('users').doc(token.uid);
    if ((await userRef.get()).exists) return Response.json({ status: 'existing' });

    const email = token.email.toLowerCase();
    const invitation = await findPendingInvitation(email, token.email);
    const onCompanyDomain = email.endsWith(`@${SIGNUP_DOMAIN}`);

    if (!invitation && !onCompanyDomain) {
      // Don't leave a stray login behind for someone who isn't allowed in.
      await adminAuth().deleteUser(token.uid).catch(() => {});
      throw new HttpError(
        403,
        `${token.email} doesn't have access. Sign in with your @${SIGNUP_DOMAIN} Google account, or ask an admin for an invitation.`
      );
    }

    let roleId: string;
    let roleSlug: RoleSlug;
    let assignedFeatureIds: string[];
    if (invitation) {
      roleId = invitation.get('roleId');
      roleSlug = invitation.get('roleSlug');
      assignedFeatureIds = invitation.get('assignedFeatureIds') ?? [];
    } else {
      const [roleSnap, settings] = await Promise.all([
        db.collection('roles').where('slug', '==', RoleSlug.EMPLOYEE).limit(1).get(),
        db.collection('system_settings').doc('global').get(),
      ]);
      if (roleSnap.empty) throw new HttpError(500, 'Employee role is not set up.');
      roleId = roleSnap.docs[0].id;
      roleSlug = RoleSlug.EMPLOYEE;
      assignedFeatureIds = settings.get('defaultEmployeeAccess') ?? [];
    }

    const displayName = (token.name as string | undefined) || email.split('@')[0];
    const batch = db.batch();
    batch.create(userRef, {
      uid: token.uid,
      email,
      displayName,
      avatarUrl: token.picture ?? null,
      roleId,
      roleSlug,
      assignedFeatureIds,
      status: UserStatus.ACTIVE,
      invitedBy: invitation?.get('invitedBy') ?? null,
      invitationId: invitation?.id ?? null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      lastLoginAt: null,
    });
    if (invitation) {
      batch.update(invitation.ref, {
        status: InvitationStatus.ACCEPTED,
        acceptedBy: token.uid,
        acceptedAt: FieldValue.serverTimestamp(),
      });
    }
    batch.create(db.collection('activity_logs').doc(), {
      userId: token.uid,
      userEmail: email,
      userRole: roleSlug,
      action: LogAction.USER_CREATED,
      targetType: 'user',
      targetId: token.uid,
      targetName: displayName,
      metadata: { method: 'google', via: invitation ? 'invitation' : 'company_domain' },
      severity: LogSeverity.INFO,
      createdAt: FieldValue.serverTimestamp(),
    });
    await batch.commit();

    return Response.json({ status: 'created' }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
