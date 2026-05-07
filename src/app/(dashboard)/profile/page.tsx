'use client';

// ============================================================
// Profile Page — User settings and history
// ============================================================

import React, { useState } from 'react';
import { useAuth } from '@/lib/context/AuthContext';
import { updateUser } from '@/lib/firebase/firestore';
import { User, Mail, Shield, Zap, Camera, Save } from 'lucide-react';

export default function ProfilePage() {
  const { userProfile, userRole, loading } = useAuth();
  const [displayName, setDisplayName] = useState(userProfile?.displayName || '');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  if (loading || !userProfile || !userRole) return null;

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    try {
      await updateUser(userProfile.uid, { displayName });
      setMessage({ type: 'success', text: 'Profile updated successfully!' });
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || 'Failed to update profile.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto' }}>
      <h1 style={{ marginBottom: '32px' }}>Profile Settings</h1>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '32px' }}>
        {/* Left Column: Avatar & Summary */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div className="card" style={{ textAlign: 'center', padding: '32px' }}>
            <div style={{ 
              width: '120px', 
              height: '120px', 
              borderRadius: '50%', 
              background: 'var(--primary)', 
              margin: '0 auto 20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
              border: '4px solid var(--border)'
            }}>
              {userProfile.avatarUrl ? (
                <img src={userProfile.avatarUrl} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <User size={60} color="white" />
              )}
              <button style={{ 
                position: 'absolute', 
                bottom: 0, 
                right: 0, 
                background: 'var(--bg-sidebar)', 
                border: '1px solid var(--border)',
                borderRadius: '50%',
                padding: '8px',
                cursor: 'pointer'
              }}>
                <Camera size={16} />
              </button>
            </div>
            <h3>{userProfile.displayName}</h3>
            <p className="text-dim" style={{ fontSize: '0.875rem' }}>{userProfile.email}</p>
            <div className="badge badge-info" style={{ marginTop: '12px' }}>{userRole.name}</div>
          </div>

          <div className="card">
            <h3 style={{ fontSize: '1rem', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Shield size={18} className="text-primary-light" /> System Status
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
                <span className="text-muted">Account Status</span>
                <span className="badge badge-success" style={{ padding: '0 8px' }}>Active</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
                <span className="text-muted">Role</span>
                <span className="text-main">{userRole.slug}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
                <span className="text-muted">Member Since</span>
                <span className="text-main">{userProfile.createdAt.toLocaleDateString()}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Edit Form */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <form onSubmit={handleUpdate} className="card">
            <h3 style={{ marginBottom: '24px' }}>Personal Information</h3>
            
            {message && (
              <div className={`badge ${message.type === 'success' ? 'badge-success' : 'badge-error'}`} style={{ width: '100%', padding: '12px', marginBottom: '20px', borderRadius: 'var(--radius-md)' }}>
                {message.text}
              </div>
            )}

            <div className="input-group">
              <label className="label">Display Name</label>
              <div style={{ position: 'relative' }}>
                <User size={18} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)' }} />
                <input 
                  type="text" 
                  value={displayName} 
                  onChange={(e) => setDisplayName(e.target.value)} 
                  placeholder="Full Name"
                  style={{ paddingLeft: '44px' }}
                />
              </div>
            </div>

            <div className="input-group">
              <label className="label">Email Address</label>
              <div style={{ position: 'relative' }}>
                <Mail size={18} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)' }} />
                <input 
                  type="email" 
                  value={userProfile.email} 
                  disabled 
                  style={{ paddingLeft: '44px', opacity: 0.6, cursor: 'not-allowed' }}
                />
              </div>
              <p className="text-dim" style={{ fontSize: '0.75rem', marginTop: '4px' }}>Email cannot be changed after registration.</p>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px' }}>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                <Save size={18} />
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>

          <div className="card">
            <h3 style={{ marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Zap size={18} className="text-warning" /> Assigned Features
            </h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {userProfile.assignedFeatureIds.length > 0 ? (
                userProfile.assignedFeatureIds.map(fid => (
                  <div key={fid} className="badge badge-outline" style={{ border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                    {fid}
                  </div>
                ))
              ) : (
                <p className="text-dim" style={{ fontSize: '0.875rem' }}>
                  {userRole.hasAllFeatureAccess ? 'All features accessible via role.' : 'No specific features assigned.'}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
