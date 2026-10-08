'use client';

// ============================================================
// User Management — Admin interface for D1: users collection
// ============================================================

import React, { useEffect, useState } from 'react';
import { listUsers, updateUser, getRoles, getFeatures } from '@/lib/firebase/firestore';
import { useAuth } from '@/lib/context/AuthContext';
import { canManageUsers } from '@/lib/utils/permissions';
import { UserStatus, RoleSlug } from '@/lib/types';
import type { UserProfile, Role, Feature } from '@/lib/types';
import { 
  Users, 
  Search, 
  Filter, 
  UserPlus, 
  Shield, 
  UserX, 
  CheckCircle,
  Clock,
  Trash2,
  SlidersHorizontal
} from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function UserManagementPage() {
  const { firebaseUser, userRole, loading: authLoading } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [features, setFeatures] = useState<Feature[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [deletingUid, setDeletingUid] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [savingUid, setSavingUid] = useState<string | null>(null);
  const [accessEditUid, setAccessEditUid] = useState<string | null>(null);
  const [accessDraft, setAccessDraft] = useState<string[]>([]);
  const router = useRouter();

  useEffect(() => {
    if (!authLoading && !canManageUsers(userRole)) {
      router.push('/');
      return;
    }

    async function loadData() {
      const [uData, rData, fData] = await Promise.all([
        listUsers(),
        getRoles(),
        getFeatures()
      ]);
      setUsers(uData);
      setRoles(rData);
      setFeatures(fData);
      setLoading(false);
    }
    
    if (userRole) loadData();
  }, [userRole, authLoading, router]);

  const handleUpdateStatus = async (uid: string, status: UserStatus) => {
    try {
      await updateUser(uid, { status });
      setUsers(users.map(u => u.uid === uid ? { ...u, status } : u));
    } catch (error) {
      console.error('Failed to update user status:', error);
    }
  };

  // Role and tool access changes go through the server, which enforces who may change whom.
  const patchUser = async (uid: string, changes: { roleSlug?: RoleSlug; assignedFeatureIds?: string[] }) => {
    if (!firebaseUser) return false;
    setSavingUid(uid);
    setActionError(null);
    try {
      const res = await fetch(`/api/admin/users/${uid}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${await firebaseUser.getIdToken()}`,
        },
        body: JSON.stringify(changes),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
      setUsers((prev) => prev.map((u) => (u.uid === uid ? { ...u, ...data.user } : u)));
      return true;
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Failed to update user.');
      return false;
    } finally {
      setSavingUid(null);
    }
  };

  const handleRoleChange = async (user: UserProfile, roleSlug: RoleSlug) => {
    const roleName = roles.find((r) => r.slug === roleSlug)?.name || roleSlug;
    if (!confirm(`Change ${user.displayName || user.email} to ${roleName}?`)) return;
    await patchUser(user.uid, { roleSlug });
  };

  const openAccessEdit = (user: UserProfile) => {
    setAccessDraft(user.assignedFeatureIds ?? []);
    setAccessEditUid(accessEditUid === user.uid ? null : user.uid);
  };

  const handleSaveAccess = async (uid: string) => {
    if (await patchUser(uid, { assignedFeatureIds: accessDraft })) setAccessEditUid(null);
  };

  const isSuperAdminCaller = userRole?.slug === RoleSlug.SUPER_ADMIN;
  const toolFeatures = features.filter((f) => f.category === 'tool');

  const handleDelete = async (user: UserProfile) => {
    if (!firebaseUser) return;
    const confirmed = confirm(
      `Permanently delete ${user.displayName || user.email}?\n\n` +
      `This removes their login and profile and cannot be undone. ` +
      `To block access without deleting, suspend the user instead.`
    );
    if (!confirmed) return;

    setDeletingUid(user.uid);
    setActionError(null);
    try {
      const res = await fetch(`/api/admin/users/${user.uid}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${await firebaseUser.getIdToken()}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
      setUsers((prev) => prev.filter((u) => u.uid !== user.uid));
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Failed to delete user.');
    } finally {
      setDeletingUid(null);
    }
  };

  const filteredUsers = users.filter(u => {
    const matchesSearch = u.displayName.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          u.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = filterStatus === 'all' || u.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  if (authLoading || loading) return <div className="loading-container"><div className="spinner"></div></div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
        <div>
          <h1>User Management</h1>
          <p className="text-muted">Manage system users, roles, and access permissions.</p>
        </div>
        <button className="btn btn-primary" onClick={() => router.push('/admin/invitations')}>
          <UserPlus size={18} />
          Invite New User
        </button>
      </div>

      {actionError && (
        <div className="alert alert-error" style={{ marginBottom: '16px' }}>
          <span>{actionError}</span>
        </div>
      )}

      <div className="card" style={{ marginBottom: '32px', padding: '16px 24px' }}>
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)' }} />
            <input 
              type="text" 
              placeholder="Search by name or email..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ paddingLeft: '40px', height: '44px' }}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Filter size={18} className="text-dim" />
            <select 
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              style={{ height: '44px', width: '160px' }}
            >
              <option value="all">All Statuses</option>
              <option value={UserStatus.ACTIVE}>Active</option>
              <option value={UserStatus.INVITED}>Invited</option>
              <option value={UserStatus.SUSPENDED}>Suspended</option>
            </select>
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>User</th>
                <th>Role</th>
                <th>Status</th>
                <th>Joined</th>
                <th>Last Active</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user) => {
                const userRoleData = roles.find(r => r.slug === user.roleSlug);
                // Whether the signed-in admin may change this user's role or tool access.
                const canEdit = user.roleSlug !== RoleSlug.SUPER_ADMIN || isSuperAdminCaller;
                const hasAllTools = !!userRoleData?.hasAllFeatureAccess;
                return (
                  <React.Fragment key={user.uid}>
                  <tr>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.875rem', fontWeight: 700 }}>
                          {user.displayName.charAt(0)}
                        </div>
                        <div>
                          <div style={{ fontWeight: 500 }}>{user.displayName}</div>
                          <div className="text-dim" style={{ fontSize: '0.75rem' }}>{user.email}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Shield size={14} className="text-primary-light" />
                        {canEdit && user.uid !== firebaseUser?.uid ? (
                          <select
                            value={user.roleSlug}
                            title="Change role"
                            disabled={savingUid === user.uid}
                            onChange={(e) => handleRoleChange(user, e.target.value as RoleSlug)}
                            style={{ width: 'auto', minWidth: '130px', height: '32px', fontSize: '0.875rem' }}
                          >
                            {roles
                              .filter((r) => r.slug !== RoleSlug.SUPER_ADMIN || isSuperAdminCaller)
                              .map((r) => (
                                <option key={r.roleId} value={r.slug}>{r.name}</option>
                              ))}
                          </select>
                        ) : (
                          <span style={{ fontSize: '0.875rem' }}>{userRoleData?.name || user.roleSlug}</span>
                        )}
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${
                        user.status === UserStatus.ACTIVE ? 'badge-success' : 
                        user.status === UserStatus.INVITED ? 'badge-warning' : 
                        'badge-error'
                      }`}>
                        {user.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="text-dim" style={{ fontSize: '0.875rem' }}>
                      {user.createdAt.toLocaleDateString()}
                    </td>
                    <td className="text-dim" style={{ fontSize: '0.875rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Clock size={12} />
                        {user.lastLoginAt ? user.lastLoginAt.toLocaleDateString() : 'Never'}
                      </div>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                        {user.status === UserStatus.SUSPENDED ? (
                          <button 
                            className="btn-outline" 
                            style={{ padding: '6px', color: 'var(--success)' }}
                            title="Activate User"
                            onClick={() => handleUpdateStatus(user.uid, UserStatus.ACTIVE)}
                          >
                            <CheckCircle size={18} />
                          </button>
                        ) : (
                          <button 
                            className="btn-outline" 
                            style={{ padding: '6px', color: 'var(--error)' }}
                            title="Suspend User"
                            onClick={() => handleUpdateStatus(user.uid, UserStatus.SUSPENDED)}
                            disabled={user.roleSlug === RoleSlug.SUPER_ADMIN}
                          >
                            <UserX size={18} />
                          </button>
                        )}
                        <button
                          className="btn-outline"
                          style={{ padding: '6px' }}
                          title={hasAllTools ? 'This role already has access to every tool' : 'Edit tool access'}
                          onClick={() => openAccessEdit(user)}
                          disabled={!canEdit || hasAllTools || savingUid === user.uid}
                        >
                          <SlidersHorizontal size={18} />
                        </button>
                        <button
                          className="btn-outline"
                          style={{ padding: '6px', color: 'var(--error)' }}
                          title="Delete user permanently"
                          onClick={() => handleDelete(user)}
                          disabled={
                            deletingUid === user.uid ||
                            user.uid === firebaseUser?.uid ||
                            (user.roleSlug === RoleSlug.SUPER_ADMIN && userRole?.slug !== RoleSlug.SUPER_ADMIN)
                          }
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                  {accessEditUid === user.uid && !hasAllTools && (
                    <tr>
                      <td colSpan={6}>
                        <div className="label" style={{ marginBottom: '10px' }}>
                          Tool access for {user.displayName || user.email}
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px', marginBottom: '14px' }}>
                          {toolFeatures.map((f) => (
                            <label key={f.featureId} style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.875rem', cursor: 'pointer' }}>
                              <input
                                type="checkbox"
                                style={{ width: '18px', height: '18px' }}
                                checked={accessDraft.includes(f.featureId)}
                                onChange={(e) =>
                                  setAccessDraft(
                                    e.target.checked
                                      ? [...accessDraft, f.featureId]
                                      : accessDraft.filter((id) => id !== f.featureId)
                                  )
                                }
                              />
                              {f.name}
                            </label>
                          ))}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                          <button className="btn btn-ghost" onClick={() => setAccessEditUid(null)}>Cancel</button>
                          <button
                            className="btn btn-primary"
                            onClick={() => handleSaveAccess(user.uid)}
                            disabled={savingUid === user.uid}
                          >
                            {savingUid === user.uid ? 'Saving…' : 'Save access'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        {filteredUsers.length === 0 && (
          <div style={{ textAlign: 'center', padding: '64px' }}>
            <Users size={48} className="text-dim" style={{ marginBottom: '16px' }} />
            <p className="text-muted">No users found matching your filters.</p>
          </div>
        )}
      </div>
    </div>
  );
}
