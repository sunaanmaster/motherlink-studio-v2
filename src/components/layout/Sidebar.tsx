'use client';

// ============================================================
// Sidebar Component — Navigation driven by Feature Registry
// ============================================================

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/context/AuthContext';
import { getActiveFeatures } from '@/lib/firebase/firestore';
import { hasFeatureAccess, isAdmin, isSuperAdmin } from '@/lib/utils/permissions';
import type { Feature } from '@/lib/types';
import * as Icons from 'lucide-react';
import { 
  LayoutDashboard, 
  Settings, 
  Users, 
  Mail, 
  ListRestart, 
  ShieldCheck,
  Cpu
} from 'lucide-react';

export default function Sidebar() {
  const pathname = usePathname();
  const { userProfile, userRole, loading } = useAuth();
  const [features, setFeatures] = useState<Feature[]>([]);

  useEffect(() => {
    async function loadFeatures() {
      const allFeatures = await getActiveFeatures();
      setFeatures(allFeatures);
    }
    loadFeatures();
  }, []);

  if (loading || !userProfile || !userRole) return null;

  const accessibleFeatures = features.filter(f => 
    hasFeatureAccess(userProfile, userRole, f, null)
  );

  const tools = accessibleFeatures.filter(f => f.category === 'tool');
  const docs = accessibleFeatures.filter(f => f.category === 'documentation');

  const navItems = [
    { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  ];

  const adminItems = [];
  if (isAdmin(userRole)) {
    adminItems.push(
      { name: 'Users', href: '/admin/users', icon: Users },
      { name: 'Invitations', href: '/admin/invitations', icon: Mail },
      { name: 'Activity Logs', href: '/admin/logs', icon: ListRestart },
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
        <ShieldCheck size={28} />
        <span>Motherlink</span>
      </div>

      <nav style={{ flex: 1, overflowY: 'auto' }}>
        <div className="nav-section">
          <div className="nav-title">Menu</div>
          {navItems.map((item) => (
            <Link 
              key={item.href} 
              href={item.href}
              className={`nav-item ${pathname === item.href ? 'active' : ''}`}
            >
              <item.icon size={20} />
              <span>{item.name}</span>
            </Link>
          ))}
        </div>

        {tools.length > 0 && (
          <div className="nav-section">
            <div className="nav-title">AI Tools</div>
            {tools.map((tool) => {
              // @ts-ignore - dynamic icon lookup
              const IconComponent = Icons[tool.icon] || Icons.HelpCircle;
              return (
                <Link 
                  key={tool.featureId} 
                  href={tool.route}
                  className={`nav-item ${pathname === tool.route ? 'active' : ''}`}
                >
                  <IconComponent size={20} />
                  <span>{tool.name}</span>
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
                  <IconComponent size={20} />
                  <span>{doc.name}</span>
                </Link>
              );
            })}
          </div>
        )}

        {adminItems.length > 0 && (
          <div className="nav-section">
            <div className="nav-title">Management</div>
            {adminItems.map((item) => (
              <Link 
                key={item.href} 
                href={item.href}
                className={`nav-item ${pathname === item.href ? 'active' : ''}`}
              >
                <item.icon size={20} />
                <span>{item.name}</span>
              </Link>
            ))}
          </div>
        )}
      </nav>

      <div style={{ marginTop: 'auto', paddingTop: '20px', borderTop: '1px solid var(--border)' }}>
        <Link href="/profile" className={`nav-item ${pathname === '/profile' ? 'active' : ''}`}>
          <Icons.User size={20} />
          <span>Profile Settings</span>
        </Link>
      </div>
    </aside>
  );
}
