// ============================================================
// POST /api/auth/google
//
// Called by the client right after a Google sign-in when the user
// has no profile yet. Google sign-in is limited to the company email
// domain: those accounts get a profile created server-side (role and
// tools from a pending invitation if there is one, otherwise Employee).
// Any other account is rejected and its just-created auth record removed.
//
// Requires `Authorization: Bearer <Firebase ID token>`.
// ============================================================

import { NextRequest } from 'next/server';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { errorResponse, HttpError, verifyRequest } from '@/lib/server/auth';
import { HTML_HOSTING_FEATURE_SLUG } from '@/lib/html-hosting/types';
import { COMPANY_EMAIL_DOMAIN, isCompanyEmail } from '@/lib/utils/companyDomain';
import { InvitationStatus, LogAction, LogSeverity, RoleSlug, UserStatus } from '@/lib/types';

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

    const email = token.email.toLowerCase();
    const db = adminDb();
    const userRef = db.collection('users').doc(token.uid);
    const hasProfile = (await userRef.get()).exists;

    if (!isCompanyEmail(email)) {
      // Don't leave a stray login behind for someone who isn't allowed in.
      if (!hasProfile) await adminAuth().deleteUser(token.uid).catch(() => {});
      throw new HttpError(
        403,
        `Google sign-in is only available for @${COMPANY_EMAIL_DOMAIN} accounts. ${token.email} can't be used.`
      );
    }
    if (hasProfile) return Response.json({ status: 'existing' });

    const invitation = await findPendingInvitation(email, token.email);

    let roleId: string;
    let roleSlug: RoleSlug;
    let assignedFeatureIds: string[];
    if (invitation) {
      roleId = invitation.get('roleId');
      roleSlug = invitation.get('roleSlug');
      assignedFeatureIds = invitation.get('assignedFeatureIds') ?? [];
    } else {
      // No invitation: Employee, with access to the HTML Hosting tool only.
      const [roleSnap, featureSnap] = await Promise.all([
        db.collection('roles').where('slug', '==', RoleSlug.EMPLOYEE).limit(1).get(),
        db.collection('features').where('slug', '==', HTML_HOSTING_FEATURE_SLUG).limit(1).get(),
      ]);
      if (roleSnap.empty) throw new HttpError(500, 'Employee role is not set up.');
      roleId = roleSnap.docs[0].id;
      roleSlug = RoleSlug.EMPLOYEE;
      assignedFeatureIds = featureSnap.docs.map((d) => d.id);
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
