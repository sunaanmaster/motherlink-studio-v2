'use client';

// ============================================================
// Route Guard — Protects dashboard routes
// ============================================================

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/lib/context/AuthContext';
import { UserStatus } from '@/lib/types';

export default function RouteGuard({ children }: { children: React.ReactNode }) {
  const { firebaseUser, userProfile, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (loading) return;

    const isAuthPage = pathname.startsWith('/login') || pathname.startsWith('/signup') || pathname.startsWith('/invite');
    
    if (!firebaseUser && !isAuthPage) {
      // Not logged in, redirect to login
      router.push('/login');
    } else if (firebaseUser && isAuthPage) {
      // Logged in, don't show login/signup
      router.push('/');
    } else if (firebaseUser && userProfile?.status === UserStatus.SUSPENDED) {
      // User is suspended, block access
      // We could redirect to a suspended page or just sign out
      router.push('/login?error=account_suspended');
    }
  }, [firebaseUser, userProfile, loading, pathname, router]);

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
        <p>Verifying access...</p>
      </div>
    );
  }

  return <>{children}</>;
}
