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
import { loginWithEmail, logoutUser, resetPassword as firebaseResetPassword } from '@/lib/firebase/auth';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [userRole, setUserRole] = useState<Role | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      
      if (user) {
        try {
          // Fetch user profile from Firestore
          const profile = await getUser(user.uid);
          setUserProfile(profile);
          
          if (profile) {
            // Update last login timestamp
            await updateLastLogin(user.uid);
            
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
        login,
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
