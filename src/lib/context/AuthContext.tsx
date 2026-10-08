'use client';

// ============================================================
// Auth Context — Global Auth State Management
// ============================================================

import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth } from '@/lib/firebase/config';
import { getUser, updateLastLogin } from '@/lib/firebase/firestore';
import { getRoleById } from '@/lib/firebase/firestore';
import type { UserProfile, Role, AuthContextType } from '@/lib/types';
import { COMPANY_EMAIL_DOMAIN, isCompanyEmail } from '@/lib/utils/companyDomain';
import {
  loginWithEmail,
  loginWithGoogle as firebaseLoginWithGoogle,
  logoutUser,
  resetPassword as firebaseResetPassword,
} from '@/lib/firebase/auth';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [userRole, setUserRole] = useState<Role | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      
      if (user) {
        try {
          // Fetch user profile from Firestore
          let profile = await getUser(user.uid);

          const viaGoogle = (await user.getIdTokenResult()).signInProvider === 'google.com';
          if (viaGoogle && profile && !isCompanyEmail(user.email)) {
            // Google sign-in is for the company domain only, even for accounts
            // that already exist. They can still use their email and password.
            setAuthError(
              `Google sign-in is only available for @${COMPANY_EMAIL_DOMAIN} accounts. Sign in with your email and password instead.`
            );
            await logoutUser();
            return;
          }

          // First Google sign-in: the server creates the profile for a company
          // account, or rejects (and removes) any other account.
          if (!profile && viaGoogle) {
            const res = await fetch('/api/auth/google', {
              method: 'POST',
              headers: { Authorization: `Bearer ${await user.getIdToken()}` },
            });
            if (!res.ok) {
              const data = await res.json().catch(() => ({}));
              setAuthError(data.error || 'Google sign-in failed. Please try again.');
              await logoutUser();
              return;
            }
            profile = await getUser(user.uid);
          }
          setUserProfile(profile);
          
          if (profile) {
            // Update last login timestamp. Never let this block sign-in: if the
            // write is refused, the role below must still load.
            updateLastLogin(user.uid).catch((err) => console.warn('Could not record last login:', err));
            
            // Fetch role details
            const role = await getRoleById(profile.roleId);
            setUserRole(role);
          }
        } catch (error) {
          console.error("Error fetching user data:", error);
        }
      } else {
        setUserProfile(null);
        setUserRole(null);
      }
      
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const login = async (email: string, password: string) => {
    await loginWithEmail(email, password);
  };

  const loginWithGoogle = async () => {
    setAuthError(null);
    await firebaseLoginWithGoogle();
  };

  const logout = async () => {
    await logoutUser();
  };

  const resetPassword = async (email: string) => {
    await firebaseResetPassword(email);
  };

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        userProfile,
        userRole,
        loading,
        authError,
        clearAuthError: () => setAuthError(null),
        login,
        loginWithGoogle,
        logout,
        resetPassword,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
