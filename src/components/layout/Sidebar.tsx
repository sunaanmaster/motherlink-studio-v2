'use client';

// ============================================================
// Sidebar — Navigation driven by Feature Registry
// ============================================================

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/context/AuthContext';
import { getFeatures } from '@/lib/firebase/firestore';
import { canViewFeature, isAdmin, isSuperAdmin } from '@/lib/utils/permissions';
import { FeatureStatus, type Feature } from '@/lib/types';
import * as Icons from 'lucide-react';
import {
  LayoutDashboard,
  Settings,
  Users,
  Mail,
  ListRestart,
  Cpu,
  User,
} from 'lucide-react';

function BrandWordmark({ width = 96 }: { width?: number }) {
  return (
    <span className="brand-wordmark" style={{ width }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="logo-dark" src="/logo/dark.svg" alt="ML Studio" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="logo-light" src="/logo/light.svg" alt="ML Studio" />
    </span>
  );
}

export default function Sidebar() {
  const pathname = usePathname();
  const { userProfile, userRole, loading } = useAuth();
  const [features, setFeatures] = useState<Feature[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function loadFeatures() {
      const allFeatures = await getFeatures();
      if (cancelled) return;
      setFeatures(allFeatures.filter(f => f.status !== FeatureStatus.INACTIVE));
    }
    loadFeatures();
    const handler = () => loadFeatures();
    window.addEventListener('features:changed', handler);
    return () => {
      cancelled = true;
      window.removeEventListener('features:changed', handler);
    };
  }, []);

  if (loading || !userProfile || !userRole) return null;

  const accessibleFeatures = features.filter(f =>
    canViewFeature(userProfile, userRole, f, null)
  );

  const tools = accessibleFeatures.filter(f => f.category === 'tool');
  const docs = accessibleFeatures.filter(f => f.category === 'documentation');

  const navItems = [
    { name: 'Overview', href: '/', icon: LayoutDashboard },
  ];

  const adminItems: { name: string; href: string; icon: typeof Users }[] = [];
  if (isAdmin(userRole)) {
    adminItems.push(
      { name: 'Users', href: '/admin/users', icon: Users },
      { name: 'Invitations', href: '/admin/invitations', icon: Mail },
      { name: 'Activity', href: '/admin/logs', icon: ListRestart },
    );
  }

  if (isSuperAdmin(userRole)) {
    adminItems.push(
      { name: 'Features', href: '/admin/features', icon: Cpu },
      { name: 'Settings', href: '/admin/settings', icon: Settings },
    );
  }

  return (
    <aside className="sidebar">
      <div className="logo-section">
        <BrandWordmark width={96} />
      </div>

      <nav style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
        <div className="nav-section">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-item ${pathname === item.href ? 'active' : ''}`}
            >
              <item.icon size={16} strokeWidth={1.75} />
              <span>{item.name}</span>
            </Link>
          ))}
        </div>

        {tools.length > 0 && (
          <div className="nav-section">
            <div className="nav-title">Tools</div>
            {tools.map((tool) => {
              // @ts-ignore - dynamic icon lookup
              const IconComponent = Icons[tool.icon] || Icons.HelpCircle;
              const isComingSoon = tool.status === FeatureStatus.COMING_SOON;
              if (isComingSoon) {
                return (
                  <div
                    key={tool.featureId}
                    className="nav-item"
                    style={{ opacity: 0.5, cursor: 'not-allowed', justifyContent: 'space-between' }}
                    title="Coming soon"
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                      <IconComponent size={16} strokeWidth={1.75} />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {tool.name}
                      </span>
                    </span>
                    <span
                      className="mono"
                      style={{
                        fontSize: '9.5px',
                        fontWeight: 500,
                        letterSpacing: '0.08em',
                        textTransform: 'uppercase',
                        color: 'var(--text-dim)',
                      }}
                    >
                      Soon
                    </span>
                  </div>
                );
              }
              return (
                <Link
                  key={tool.featureId}
                  href={tool.route}
                  className={`nav-item ${pathname === tool.route ? 'active' : ''}`}
                  {...(tool.openInNewTab ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                >
                  <IconComponent size={16} strokeWidth={1.75} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {tool.name}
                  </span>
                </Link>
              );
            })}
          </div>
        )}

        {docs.length > 0 && (
          <div className="nav-section">
            <div className="nav-title">Knowledge</div>
            {docs.map((doc) => {
              // @ts-ignore
              const IconComponent = Icons[doc.icon] || Icons.Book;
              return (
                <Link
                  key={doc.featureId}
                  href={doc.route}
                  className={`nav-item ${pathname === doc.route ? 'active' : ''}`}
                >
                  <IconComponent size={16} strokeWidth={1.75} />
                  <span>{doc.name}</span>
                </Link>
              );
            })}
          </div>
        )}

        {adminItems.length > 0 && (
          <div className="nav-section">
            <div className="nav-title">Admin</div>
            {adminItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`nav-item ${pathname === item.href ? 'active' : ''}`}
              >
                <item.icon size={16} strokeWidth={1.75} />
                <span>{item.name}</span>
              </Link>
            ))}
          </div>
        )}
      </nav>

      <div style={{ marginTop: 'auto', paddingTop: 8, borderTop: '1px solid var(--border)' }}>
        <Link href="/profile" className={`nav-item ${pathname === '/profile' ? 'active' : ''}`}>
          <User size={16} strokeWidth={1.75} />
          <span>Profile</span>
        </Link>
      </div>
    </aside>
  );
}
