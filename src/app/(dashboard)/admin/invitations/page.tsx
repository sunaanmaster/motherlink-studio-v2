'use client';

// ============================================================
// Invitations Management — Admin interface for D4: invitations
// ============================================================

import React, { useEffect, useState } from 'react';
import { getInvitations, createInvitation, getRoles, getFeatures, updateInvitation } from '@/lib/firebase/firestore';
import { useAuth } from '@/lib/context/AuthContext';
import { canManageInvitations } from '@/lib/utils/permissions';
import { InvitationStatus, RoleSlug } from '@/lib/types';
import type { Invitation, Role, Feature } from '@/lib/types';
import { 
  Mail, 
  Plus, 
  RefreshCw, 
  XCircle, 
  CheckCircle, 
  Clock,
  Link as LinkIcon,
  Send,
  AlertCircle
} from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function InvitationsPage() {
  const { userProfile, userRole, loading: authLoading } = useAuth();
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [features, setFeatures] = useState<Feature[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  
  // Form state
  const [email, setEmail] = useState('');
  const [roleSlug, setRoleSlug] = useState<RoleSlug>(RoleSlug.EMPLOYEE);
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const router = useRouter();

  useEffect(() => {
    if (!authLoading && !canManageInvitations(userRole)) {
      router.push('/');
      return;
    }

    async function loadData() {
      const [iData, rData, fData] = await Promise.all([
        getInvitations(),
        getRoles(),
        getFeatures()
      ]);
      setInvitations(iData);
      setRoles(rData);
      setFeatures(fData);
      setLoading(false);
    }
    
    if (userRole) loadData();
  }, [userRole, authLoading, router]);

  const handleCreateInvitation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userProfile) return;
    
    setSubmitting(true);
    setFormError(null);

    try {
      const selectedRole = roles.find(r => r.slug === roleSlug);
      if (!selectedRole) throw new Error('Role not found');

      const token = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7); // 7 days expiry

      const invId = await createInvitation({
        email,
        roleSlug,
        roleId: selectedRole.roleId,
        assignedFeatureIds: selectedFeatures,
        token,
        inviteType: 'single_use',
        status: InvitationStatus.PENDING,
        expiresAt,
        invitedBy: userProfile.uid,
        invitedByName: userProfile.displayName,
      });

      await fetch('/api/send-invitation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          token,
          role: roleSlug,
          invitedByName: userProfile.displayName,
        }),
      });

      const newInv: Invitation = {
        invitationId: invId,
        email,
        roleSlug,
        roleId: selectedRole.roleId,
        assignedFeatureIds: selectedFeatures,
        token,
        inviteType: 'single_use',
        status: InvitationStatus.PENDING,
        expiresAt,
        invitedBy: userProfile.uid,
        invitedByName: userProfile.displayName,
        acceptedBy: null,
        createdAt: new Date(),
        acceptedAt: null,
        revokedAt: null
      };

      setInvitations([newInv, ...invitations]);
      setShowForm(false);
      setEmail('');
      setSelectedFeatures([]);
    } catch (error: any) {
      setFormError(error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleRevoke = async (id: string) => {
    try {
      await updateInvitation(id, { status: InvitationStatus.REVOKED, revokedAt: new Date() });
      setInvitations(invitations.map(i => i.invitationId === id ? { ...i, status: InvitationStatus.REVOKED } : i));
    } catch (error) {
      console.error('Failed to revoke invitation:', error);
    }
  };

  const copyInviteLink = (token: string) => {
    const url = `${window.location.origin}/signup?token=${token}`;
    navigator.clipboard.writeText(url);
    alert('Link copied to clipboard!');
  };

  if (authLoading || loading) return <div className="loading-container"><div className="spinner"></div></div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
        <div>
          <h1>Invitations</h1>
          <p className="text-muted">Invite users to the platform and manage pending requests.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? <Plus style={{ transform: 'rotate(45deg)' }} /> : <Plus />}
          {showForm ? 'Cancel' : 'New Invitation'}
        </button>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: '40px' }}>
          <h3>Create Invitation</h3>
          {formError && (
            <div className="badge badge-error" style={{ width: '100%', padding: '12px', margin: '16px 0', borderRadius: 'var(--radius-md)' }}>
              <AlertCircle size={16} /> <span>{formError}</span>
            </div>
          )}
          <form onSubmit={handleCreateInvitation} style={{ marginTop: '24px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
              <div className="input-group">
                <label className="label">User Email</label>
                <input 
                  type="email" 
                  value={email} 
                  onChange={(e) => setEmail(e.target.value)} 
                  placeholder="user@motherlink.io" 
                  required 
                />
              </div>
              <div className="input-group">
                <label className="label">Assigned Role</label>
                <select 
                  value={roleSlug} 
                  onChange={(e) => setRoleSlug(e.target.value as RoleSlug)}
                >
                  <option value={RoleSlug.EMPLOYEE}>Employee</option>
                  <option value={RoleSlug.ADMIN}>Admin</option>
                  <option value={RoleSlug.SUPER_ADMIN}>Super Admin</option>
                </select>
              </div>
            </div>

            <div className="input-group">
              <label className="label">Grant Tool Access (Optional)</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px', padding: '16px', background: 'rgba(255, 255, 255, 0.02)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                {features.filter(f => f.category === 'tool').map(f => (
                  <label key={f.featureId} style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.875rem', cursor: 'pointer' }}>
                    <input 
                      type="checkbox" 
                      style={{ width: '18px', height: '18px' }}
                      checked={selectedFeatures.includes(f.featureId)}
                      onChange={(e) => {
                        if (e.target.checked) setSelectedFeatures([...selectedFeatures, f.featureId]);
                        else setSelectedFeatures(selectedFeatures.filter(id => id !== f.featureId));
                      }}
                    />
                    {f.name}
                  </label>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px' }}>
              <button type="submit" className="btn btn-primary" disabled={submitting}>
                <Send size={18} />
                {submitting ? 'Sending...' : 'Generate & Send Invite'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Recipient</th>
                <th>Role</th>
                <th>Status</th>
                <th>Expires</th>
                <th>Invited By</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {invitations.map((inv) => (
                <tr key={inv.invitationId}>
                  <td>
                    <div style={{ fontWeight: 500 }}>{inv.email}</div>
                    <div className="text-dim" style={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <LinkIcon size={12} /> {inv.token.substring(0, 8)}...
                    </div>
                  </td>
                  <td>
                    <span style={{ fontSize: '0.875rem' }}>{inv.roleSlug}</span>
                  </td>
                  <td>
                    <span className={`badge ${
                      inv.status === InvitationStatus.PENDING ? 'badge-warning' : 
                      inv.status === InvitationStatus.ACCEPTED ? 'badge-success' : 
                      'badge-error'
                    }`}>
                      {inv.status.toUpperCase()}
                    </span>
                  </td>
                  <td>
                    <div className="text-dim" style={{ fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Clock size={12} />
                      {inv.expiresAt.toLocaleDateString()}
                    </div>
                  </td>
                  <td>
                    <div className="text-dim" style={{ fontSize: '0.875rem' }}>{inv.invitedByName}</div>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                      {inv.status === InvitationStatus.PENDING && (
                        <>
                          <button 
                            className="btn-outline" 
                            style={{ padding: '6px' }}
                            title="Copy Invite Link"
                            onClick={() => copyInviteLink(inv.token)}
                          >
                            <LinkIcon size={18} />
                          </button>
                          <button 
                            className="btn-outline" 
                            style={{ padding: '6px', color: 'var(--error)' }}
                            title="Revoke Invitation"
                            onClick={() => handleRevoke(inv.invitationId)}
                          >
                            <XCircle size={18} />
                          </button>
                        </>
                      )}
                      {inv.status === InvitationStatus.ACCEPTED && (
                        <CheckCircle size={18} className="text-success" style={{ margin: '8px' }} />
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {invitations.length === 0 && (
          <div style={{ textAlign: 'center', padding: '64px' }}>
            <Mail size={48} className="text-dim" style={{ marginBottom: '16px' }} />
            <p className="text-muted">No invitations found.</p>
          </div>
        )}
      </div>
    </div>
  );
}
