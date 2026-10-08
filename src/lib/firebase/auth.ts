// ============================================================
// Firebase Auth Helpers — DFD Process 1.0: Authenticate User
// ============================================================
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
  EmailAuthProvider,
  linkWithCredential,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  updatePassword,
  signOut,
  sendPasswordResetEmail,
  updateProfile,
  type User,
} from 'firebase/auth';
import { auth } from './config';

export async function loginWithEmail(email: string, password: string): Promise<User> {
  const result = await signInWithEmailAndPassword(auth, email, password);
  return result.user;
}

export async function signupWithEmail(email: string, password: string, displayName: string): Promise<User> {
  const result = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(result.user, { displayName });
  return result.user;
}

export async function loginWithGoogle(): Promise<User> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const result = await signInWithPopup(auth, provider);
  return result.user;
}

export function hasPasswordLogin(user: User): boolean {
  return user.providerData.some((p) => p.providerId === 'password');
}

/**
 * Sets a password on the signed-in account, or changes the existing one.
 * Accounts that already have a password must supply the current one.
 * Google-only accounts are asked to confirm with Google if their session
 * is too old for Firebase to accept the change.
 */
export async function setAccountPassword(newPassword: string, currentPassword?: string): Promise<void> {
  const user = auth.currentUser;
  if (!user || !user.email) throw new Error('Not signed in.');

  if (hasPasswordLogin(user)) {
    await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, currentPassword ?? ''));
    await updatePassword(user, newPassword);
  } else {
    const credential = EmailAuthProvider.credential(user.email, newPassword);
    try {
      await linkWithCredential(user, credential);
    } catch (err) {
      if ((err as { code?: string }).code !== 'auth/requires-recent-login') throw err;
      await reauthenticateWithPopup(user, new GoogleAuthProvider());
      await linkWithCredential(user, credential);
    }
  }
  await user.reload();
}

export async function logoutUser(): Promise<void> {
  await signOut(auth);
}

export async function resetPassword(email: string): Promise<void> {
  await sendPasswordResetEmail(auth, email);
}

export { auth };
