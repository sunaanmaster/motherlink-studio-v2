'use client';

// ============================================================
// Topbar Component — User profile and search
// ============================================================

import React from 'react';
import { useAuth } from '@/lib/context/AuthContext';
import { LogOut, Bell, Search, User as UserIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function Topbar() {
  const { userProfile, userRole, logout } = useAuth();
  const router = useRouter();

  const handleLogout = async () => {
    try {
      await logout();
      router.push('/login');
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  return (
    <header style={{ 
      height: 'var(--topbar-height)', 
      borderBottom: '1px solid var(--border)', 
      display: 'flex', 
      alignItems: 'center', 
      padding: '0 32px',
      justifyContent: 'space-between',
      position: 'sticky',
      top: 0,
      background: 'rgba(10, 10, 12, 0.8)',
      backdropFilter: 'blur(10px)',
      zIndex: 10
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
        <div style={{ position: 'relative', maxWidth: '400px', width: '100%' }}>
          <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)' }} />
          <input 
            type="text" 
            placeholder="Search tools, docs, or users..." 
            style={{ 
              paddingLeft: '40px', 
              height: '40px', 
              fontSize: '0.875rem',
              background: 'rgba(255, 255, 255, 0.03)'
            }} 
          />
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
        <button className="btn-outline" style={{ padding: '8px', borderRadius: '50%' }}>
          <Bell size={20} />
        </button>

        <div style={{ height: '32px', width: '1px', background: 'var(--border)' }}></div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.875rem', fontWeight: 600 }}>{userProfile?.displayName}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--primary-light)', textTransform: 'uppercase', fontWeight: 700 }}>
              {userRole?.name}
            </div>
          </div>
          
          <div style={{ 
            width: '40px', 
            height: '40px', 
            borderRadius: '50%', 
            background: 'var(--primary)', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            overflow: 'hidden',
            border: '2px solid var(--border)'
          }}>
            {userProfile?.avatarUrl ? (
              <img src={userProfile.avatarUrl} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <UserIcon size={20} color="white" />
            )}
          </div>

          <button 
            onClick={handleLogout}
            className="btn-outline" 
            style={{ padding: '8px', color: 'var(--error)', borderColor: 'rgba(239, 68, 68, 0.2)' }}
            title="Sign Out"
          >
            <LogOut size={20} />
          </button>
        </div>
      </div>
    </header>
  );
}
