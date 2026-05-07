'use client';

// ============================================================
// Platform Settings — Super Admin interface for D6: system_settings
// ============================================================

import React, { useEffect, useState } from 'react';
import { getSystemSettings, updateSystemSettings } from '@/lib/firebase/firestore';
import { useAuth } from '@/lib/context/AuthContext';
import { isSuperAdmin } from '@/lib/utils/permissions';
import type { SystemSettings } from '@/lib/types';
import { 
  Settings, 
  Save, 
  Shield, 
  Mail, 
  Zap, 
  Globe, 
  AlertCircle,
  Database
} from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function PlatformSettingsPage() {
  const { userProfile, userRole, loading: authLoading } = useAuth();
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  
  const router = useRouter();

  useEffect(() => {
    if (!authLoading && !isSuperAdmin(userRole)) {
      router.push('/');
      return;
    }

    async function loadData() {
      const data = await getSystemSettings();
      setSettings(data);
      setLoading(false);
    }
    
    if (userRole) loadData();
  }, [userRole, authLoading, router]);

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings || !userProfile) return;
    
    setSaving(true);
    setMessage(null);

    try {
      await updateSystemSettings(settings, userProfile.uid);
      setMessage({ type: 'success', text: 'Platform settings updated successfully!' });
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || 'Failed to update settings.' });
    } finally {
      setSaving(false);
    }
  };

  if (authLoading || loading) return <div className="loading-container"><div className="spinner"></div></div>;

  return (
    <div style={{ maxWidth: '1000px' }}>
      <div style={{ marginBottom: '32px' }}>
        <h1>Platform Settings</h1>
        <p className="text-muted">Global configuration for the Motherlink.io AI platform.</p>
      </div>

      <form onSubmit={handleUpdate}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(450px, 1fr))', gap: '32px' }}>
          
          {/* General Settings */}
          <div className="card">
            <h3 style={{ marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Globe size={20} className="text-primary-light" /> General Configuration
            </h3>
            
            <div className="input-group">
              <label className="label">Platform Name</label>
              <input 
                type="text" 
                value={settings?.platformName} 
                onChange={(e) => setSettings({...settings!, platformName: e.target.value})}
              />
            </div>

            <div className="input-group">
              <label className="label">Platform Logo URL</label>
              <input 
                type="text" 
                value={settings?.platformLogoUrl || ''} 
                onChange={(e) => setSettings({...settings!, platformLogoUrl: e.target.value})}
                placeholder="https://example.com/logo.png"
              />
            </div>

            <div style={{ marginTop: '24px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}>
                <input 
                  type="checkbox" 
                  checked={settings?.maintenanceMode} 
                  onChange={(e) => setSettings({...settings!, maintenanceMode: e.target.checked})}
                  style={{ width: '20px', height: '20px' }}
                />
                <div>
                  <div style={{ fontWeight: 600 }}>Maintenance Mode</div>
                  <div className="text-dim" style={{ fontSize: '0.875rem' }}>Block access to all non-admin users.</div>
                </div>
              </label>
            </div>
          </div>

          {/* Access & Invitations */}
          <div className="card">
            <h3 style={{ marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Shield size={20} className="text-success" /> Access Control
            </h3>

            <div className="input-group">
              <label className="label">Default Invitation Expiry (Days)</label>
              <input 
                type="number" 
                value={settings?.invitationExpiryDays} 
                onChange={(e) => setSettings({...settings!, invitationExpiryDays: parseInt(e.target.value)})}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}>
                <input 
                  type="checkbox" 
                  checked={settings?.defaultAdminToolAccess} 
                  onChange={(e) => setSettings({...settings!, defaultAdminToolAccess: e.target.checked})}
                  style={{ width: '20px', height: '20px' }}
                />
                <div>
                  <div style={{ fontWeight: 600 }}>Default Admin Tool Access</div>
                  <div className="text-dim" style={{ fontSize: '0.875rem' }}>Admins automatically get access to all tools.</div>
                </div>
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}>
                <input 
                  type="checkbox" 
                  checked={settings?.allowMultiUseInvites} 
                  onChange={(e) => setSettings({...settings!, allowMultiUseInvites: e.target.checked})}
                  style={{ width: '20px', height: '20px' }}
                />
                <div>
                  <div style={{ fontWeight: 600 }}>Allow Multi-use Invitations</div>
                  <div className="text-dim" style={{ fontSize: '0.875rem' }}>Enable tokens that can be used by multiple users.</div>
                </div>
              </label>
            </div>
          </div>

          {/* Data & Logging */}
          <div className="card">
            <h3 style={{ marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Database size={20} className="text-warning" /> Logging & Audit
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}>
                <input 
                  type="checkbox" 
                  checked={settings?.enableActivityLogging} 
                  onChange={(e) => setSettings({...settings!, enableActivityLogging: e.target.checked})}
                  style={{ width: '20px', height: '20px' }}
                />
                <div>
                  <div style={{ fontWeight: 600 }}>Enable Activity Logging</div>
                  <div className="text-dim" style={{ fontSize: '0.875rem' }}>Record all user actions in the audit trail.</div>
                </div>
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}>
                <input 
                  type="checkbox" 
                  checked={settings?.enableEmployeeActivityView} 
                  onChange={(e) => setSettings({...settings!, enableEmployeeActivityView: e.target.checked})}
                  style={{ width: '20px', height: '20px' }}
                />
                <div>
                  <div style={{ fontWeight: 600 }}>Allow Employees to View Own Logs</div>
                  <div className="text-dim" style={{ fontSize: '0.875rem' }}>Employees can see their own action history on profile.</div>
                </div>
              </label>
            </div>
          </div>

          {/* Security Alert */}
          <div className="card" style={{ border: '1px solid rgba(239, 68, 68, 0.2)', background: 'rgba(239, 68, 68, 0.02)' }}>
            <h3 style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--error)' }}>
              <AlertCircle size={20} /> Safety & Compliance
            </h3>
            <p className="text-muted" style={{ fontSize: '0.875rem', marginBottom: '20px' }}>
              Changes to platform settings are recorded in the activity logs and take effect immediately for all users. 
              Be cautious when enabling/disabling maintenance mode.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                <Save size={18} />
                {saving ? 'Saving...' : 'Save All Settings'}
              </button>
            </div>
          </div>

        </div>

        {message && (
          <div className={`badge ${message.type === 'success' ? 'badge-success' : 'badge-error'}`} style={{ width: '100%', padding: '16px', marginTop: '32px', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
            {message.text}
          </div>
        )}
      </form>
    </div>
  );
}
