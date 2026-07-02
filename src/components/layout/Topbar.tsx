'use client';

// ============================================================
// Topbar — Slim header: search, theme, notifications, profile
// ============================================================

import { useAuth } from '@/lib/context/AuthContext';
import { useTheme } from '@/lib/context/ThemeContext';
import { LogOut, Bell, Search, User as UserIcon, Sun, Moon } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function Topbar() {
  const { userProfile, userRole, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const router = useRouter();

  const handleLogout = async () => {
    try {
      await logout();
      router.push('/login');
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  const initials = userProfile?.displayName
    ?.split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <header
      style={{
        height: 'var(--topbar-height)',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 24px',
        justifyContent: 'space-between',
        position: 'sticky',
        top: 0,
        background: 'var(--topbar-bg)',
        backdropFilter: 'saturate(180%) blur(10px)',
        WebkitBackdropFilter: 'saturate(180%) blur(10px)',
        zIndex: 10,
        gap: 16,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', flex: 1, maxWidth: 480 }}>
        <div style={{ position: 'relative', width: '100%' }}>
          <Search
            size={14}
            strokeWidth={1.75}
            style={{
              position: 'absolute',
              left: 10,
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--text-dim)',
              pointerEvents: 'none',
            }}
          />
          <input
            type="text"
            placeholder="Search..."
            style={{
              paddingLeft: 32,
              paddingRight: 44,
              height: 32,
              fontSize: 13,
              background: 'var(--surface-1)',
              borderRadius: 'var(--radius-sm)',
            }}
          />
          <span
            className="kbd"
            style={{
              position: 'absolute',
              right: 8,
              top: '50%',
              transform: 'translateY(-50%)',
            }}
          >
            ⌘K
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <button
          onClick={toggleTheme}
          className="btn btn-ghost btn-icon"
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          aria-label="Toggle theme"
        >
          {theme === 'dark' ? <Sun size={15} strokeWidth={1.75} /> : <Moon size={15} strokeWidth={1.75} />}
        </button>

        <button className="btn btn-ghost btn-icon" aria-label="Notifications">
          <Bell size={15} strokeWidth={1.75} />
        </button>

        <div className="divider-vertical" style={{ height: 20, margin: '0 6px' }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ textAlign: 'right', lineHeight: 1.2 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-main)' }}>
              {userProfile?.displayName}
            </div>
            <div
              className="mono"
              style={{
                fontSize: 10.5,
                color: 'var(--text-dim)',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                marginTop: 2,
              }}
            >
              {userRole?.name}
            </div>
          </div>

          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #3D3AAD 0%, #7A77F0 100%)',
              border: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              flexShrink: 0,
              color: '#fff',
              fontWeight: 600,
              fontSize: 11,
              letterSpacing: '-0.01em',
            }}
          >
            {userProfile?.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={userProfile.avatarUrl}
                alt="Avatar"
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : initials ? (
              <span>{initials}</span>
            ) : (
              <UserIcon size={14} strokeWidth={1.75} color="#fff" />
            )}
          </div>

          <button
            onClick={handleLogout}
            className="btn btn-ghost btn-icon"
            title="Sign out"
            aria-label="Sign out"
          >
            <LogOut size={15} strokeWidth={1.75} />
          </button>
        </div>
      </div>
    </header>
  );
}
