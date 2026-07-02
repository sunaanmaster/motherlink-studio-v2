'use client';

// ============================================================
// Feature Registry — Super Admin interface for D3: features
// ============================================================

import React, { useEffect, useState } from 'react';
import { getFeatures, updateFeature, createFeature, deleteFeature, updateFeaturesOrder } from '@/lib/firebase/firestore';
import { useAuth } from '@/lib/context/AuthContext';
import { isSuperAdmin } from '@/lib/utils/permissions';
import { FeatureStatus, FeatureCategory } from '@/lib/types';
import type { Feature } from '@/lib/types';
import {
  Cpu,
  Plus,
  Trash2,
  Eye,
  EyeOff,
  Settings,
  GripVertical,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as Icons from 'lucide-react';

const EMPTY_FORM = {
  name: '',
  slug: '',
  description: '',
  icon: 'Zap',
  category: FeatureCategory.TOOL,
  isPlaceholder: true,
  status: FeatureStatus.ACTIVE,
  routeOverride: '',
  openInNewTab: false,
};

export default function FeatureRegistryPage() {
  const { userProfile, userRole, loading: authLoading } = useAuth();
  const [features, setFeatures] = useState<Feature[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form state
  const [form, setForm] = useState(EMPTY_FORM);

  // Drag state
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const router = useRouter();

  useEffect(() => {
    if (!authLoading && !isSuperAdmin(userRole)) {
      router.push('/');
      return;
    }

    async function loadData() {
      const data = await getFeatures();
      setFeatures(data);
      setLoading(false);
    }

    if (userRole) loadData();
  }, [userRole, authLoading, router]);

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
  };

  const notifyFeaturesChanged = () => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('features:changed'));
    }
  };

  const openCreateForm = () => {
    if (showForm && !editingId) {
      setShowForm(false);
      return;
    }
    resetForm();
    setShowForm(true);
  };

  const openEditForm = (feature: Feature) => {
    setEditingId(feature.featureId);
    const defaultRoute = `/tools/${feature.slug}`;
    setForm({
      name: feature.name,
      slug: feature.slug,
      description: feature.description,
      icon: feature.icon,
      category: feature.category,
      isPlaceholder: feature.isPlaceholder,
      status: feature.status,
      routeOverride: feature.route === defaultRoute ? '' : feature.route,
      openInNewTab: !!feature.openInNewTab,
    });
    setShowForm(true);
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userProfile) return;

    const resolvedRoute = form.routeOverride.trim() || `/tools/${form.slug}`;

    try {
      if (editingId) {
        const updates: Partial<Feature> = {
          name: form.name,
          slug: form.slug,
          description: form.description,
          route: resolvedRoute,
          icon: form.icon,
          category: form.category,
          status: form.status,
          isPlaceholder: form.isPlaceholder,
          openInNewTab: form.openInNewTab,
        };
        await updateFeature(editingId, updates);
        setFeatures(features.map(f =>
          f.featureId === editingId ? { ...f, ...updates, updatedAt: new Date() } : f
        ));
      } else {
        const sortOrder = features.length + 1;
        const id = await createFeature({
          name: form.name,
          slug: form.slug,
          description: form.description,
          route: resolvedRoute,
          icon: form.icon,
          category: form.category,
          status: form.status,
          isPlaceholder: form.isPlaceholder,
          openInNewTab: form.openInNewTab,
          supportedInputTypes: ['text_prompt'],
          toolConfig: null,
          sortOrder,
          createdBy: userProfile.uid,
        });

        const newFeature: Feature = {
          featureId: id,
          name: form.name,
          slug: form.slug,
          description: form.description,
          route: resolvedRoute,
          icon: form.icon,
          category: form.category,
          status: form.status,
          isPlaceholder: form.isPlaceholder,
          openInNewTab: form.openInNewTab,
          supportedInputTypes: ['text_prompt'],
          toolConfig: null,
          sortOrder,
          createdAt: new Date(),
          updatedAt: new Date(),
          createdBy: userProfile.uid,
        };
        setFeatures([...features, newFeature]);
      }

      setShowForm(false);
      resetForm();
      notifyFeaturesChanged();
    } catch (error) {
      console.error('Failed to save feature:', error);
    }
  };

  const toggleStatus = async (feature: Feature) => {
    const newStatus = feature.status === FeatureStatus.ACTIVE ? FeatureStatus.INACTIVE : FeatureStatus.ACTIVE;
    try {
      await updateFeature(feature.featureId, { status: newStatus });
      setFeatures(features.map(f => f.featureId === feature.featureId ? { ...f, status: newStatus } : f));
      notifyFeaturesChanged();
    } catch (error) {
      console.error('Failed to update status:', error);
    }
  };

  const handleDelete = async (featureId: string) => {
    if (!confirm('Delete feature?')) return;
    try {
      await deleteFeature(featureId);
      setFeatures(features.filter(f => f.featureId !== featureId));
      if (editingId === featureId) {
        setShowForm(false);
        resetForm();
      }
      notifyFeaturesChanged();
    } catch (error) {
      console.error('Failed to delete feature:', error);
    }
  };

  // ---- Drag and drop reordering ----
  const handleDragStart = (e: React.DragEvent, featureId: string) => {
    setDragId(featureId);
    e.dataTransfer.effectAllowed = 'move';
    // Required for Firefox to initiate drag
    e.dataTransfer.setData('text/plain', featureId);
  };

  const handleDragOver = (e: React.DragEvent, featureId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragId && dragId !== featureId) {
      setDragOverId(featureId);
    }
  };

  const handleDragLeave = (featureId: string) => {
    if (dragOverId === featureId) setDragOverId(null);
  };

  const handleDragEnd = () => {
    setDragId(null);
    setDragOverId(null);
  };

  const handleDrop = async (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    const sourceId = dragId;
    setDragId(null);
    setDragOverId(null);
    if (!sourceId || sourceId === targetId) return;

    const sourceIdx = features.findIndex(f => f.featureId === sourceId);
    const targetIdx = features.findIndex(f => f.featureId === targetId);
    if (sourceIdx === -1 || targetIdx === -1) return;

    const reordered = [...features];
    const [moved] = reordered.splice(sourceIdx, 1);
    reordered.splice(targetIdx, 0, moved);

    const withOrder = reordered.map((f, i) => ({ ...f, sortOrder: i + 1 }));
    const prev = features;
    setFeatures(withOrder);

    try {
      await updateFeaturesOrder(
        withOrder.map(f => ({ featureId: f.featureId, sortOrder: f.sortOrder }))
      );
      notifyFeaturesChanged();
    } catch (error) {
      console.error('Failed to persist order:', error);
      setFeatures(prev);
    }
  };

  if (authLoading || loading) return <div className="loading-container"><div className="spinner"></div></div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
        <div>
          <h1>Feature Registry</h1>
          <p className="text-muted">Register and configure AI tools, documentation modules, and system features. Drag cards to reorder.</p>
        </div>
        <button className="btn btn-primary" onClick={openCreateForm}>
          {showForm ? <Plus style={{ transform: 'rotate(45deg)' }} /> : <Plus />}
          {showForm ? 'Cancel' : 'Register Feature'}
        </button>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: '40px' }}>
          <h3>{editingId ? 'Edit Feature' : 'Register New Feature'}</h3>
          <form onSubmit={handleSubmit} style={{ marginTop: '24px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
              <div className="input-group">
                <label className="label">Feature Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g., SEO Assistant"
                  required
                />
              </div>
              <div className="input-group">
                <label className="label">Slug (URL identifier)</label>
                <input
                  type="text"
                  value={form.slug}
                  onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/\s+/g, '-') })}
                  placeholder="e.g., seo-assistant"
                  required
                />
              </div>
            </div>

            <div className="input-group">
              <label className="label">Description</label>
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Briefly describe what this tool does..."
                rows={3}
                required
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '24px' }}>
              <div className="input-group">
                <label className="label">Icon (Lucide name)</label>
                <input
                  type="text"
                  value={form.icon}
                  onChange={(e) => setForm({ ...form, icon: e.target.value })}
                  placeholder="e.g., Search, Zap, Image"
                />
              </div>
              <div className="input-group">
                <label className="label">Category</label>
                <select
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value as FeatureCategory })}
                >
                  <option value={FeatureCategory.TOOL}>Tool</option>
                  <option value={FeatureCategory.DOCUMENTATION}>Documentation</option>
                  <option value={FeatureCategory.WORKFLOW}>Workflow</option>
                </select>
              </div>
              <div className="input-group">
                <label className="label">Status</label>
                <select
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value as FeatureStatus })}
                >
                  <option value={FeatureStatus.ACTIVE}>Active</option>
                  <option value={FeatureStatus.INACTIVE}>Inactive</option>
                  <option value={FeatureStatus.COMING_SOON}>Coming Soon</option>
                </select>
              </div>
            </div>

            <div className="input-group">
              <label className="label">Route override (optional)</label>
              <input
                type="text"
                value={form.routeOverride}
                onChange={(e) => setForm({ ...form, routeOverride: e.target.value })}
                placeholder={`Defaults to /tools/${form.slug || '<slug>'}`}
              />
              <p className="text-dim" style={{ fontSize: '0.75rem', marginTop: '4px' }}>
                Use this for full-screen apps outside the dashboard, e.g. <code>/apps/reddit-visibility</code>.
              </p>
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={form.isPlaceholder}
                  onChange={(e) => setForm({ ...form, isPlaceholder: e.target.checked })}
                  style={{ width: '18px', height: '18px' }}
                />
                <span style={{ fontSize: '0.9375rem', fontWeight: 500 }}>Placeholder Mode (Phase 1)</span>
              </label>
              <p className="text-dim" style={{ fontSize: '0.75rem', marginLeft: '28px', marginTop: '4px' }}>
                When enabled, the tool will render a placeholder chat UI instead of its custom interface.
              </p>
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={form.openInNewTab}
                  onChange={(e) => setForm({ ...form, openInNewTab: e.target.checked })}
                  style={{ width: '18px', height: '18px' }}
                />
                <span style={{ fontSize: '0.9375rem', fontWeight: 500 }}>Open in new tab</span>
              </label>
              <p className="text-dim" style={{ fontSize: '0.75rem', marginLeft: '28px', marginTop: '4px' }}>
                Enable for full-screen apps so the dashboard stays in the original tab.
              </p>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              {editingId && (
                <button
                  type="button"
                  className="btn-outline"
                  onClick={() => { setShowForm(false); resetForm(); }}
                >
                  Cancel
                </button>
              )}
              <button type="submit" className="btn btn-primary">
                {editingId ? 'Save Changes' : 'Register Tool'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '24px' }}>
        {features.map((feature) => {
          // @ts-ignore
          const IconComponent = Icons[feature.icon] || Icons.HelpCircle;
          const isDragging = dragId === feature.featureId;
          const isDragOver = dragOverId === feature.featureId;
          const statusBadgeClass =
            feature.status === FeatureStatus.ACTIVE
              ? 'badge-success'
              : feature.status === FeatureStatus.COMING_SOON
              ? 'badge-info'
              : 'badge-error';
          const statusLabel =
            feature.status === FeatureStatus.COMING_SOON
              ? 'COMING SOON'
              : feature.status.toUpperCase();
          return (
            <div
              key={feature.featureId}
              className="card"
              draggable
              onDragStart={(e) => handleDragStart(e, feature.featureId)}
              onDragOver={(e) => handleDragOver(e, feature.featureId)}
              onDragLeave={() => handleDragLeave(feature.featureId)}
              onDragEnd={handleDragEnd}
              onDrop={(e) => handleDrop(e, feature.featureId)}
              style={{
                opacity: isDragging ? 0.4 : 1,
                outline: isDragOver ? '2px dashed var(--primary)' : undefined,
                outlineOffset: isDragOver ? '4px' : undefined,
                transition: 'opacity 0.15s ease, outline 0.15s ease',
                cursor: 'default',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span
                    title="Drag to reorder"
                    style={{
                      color: 'var(--text-dim)',
                      cursor: 'grab',
                      display: 'flex',
                      alignItems: 'center',
                      padding: '4px',
                      marginLeft: '-4px',
                    }}
                  >
                    <GripVertical size={18} />
                  </span>
                  <div style={{
                    background: 'rgba(124, 58, 237, 0.1)',
                    padding: '10px',
                    borderRadius: 'var(--radius-md)',
                    color: 'var(--primary)'
                  }}>
                    <IconComponent size={24} />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <span className={`badge ${statusBadgeClass}`}>
                    {statusLabel}
                  </span>
                  {feature.isPlaceholder && (
                    <span className="badge badge-info">PHASE 1</span>
                  )}
                </div>
              </div>

              <h3 style={{ marginBottom: '4px' }}>{feature.name}</h3>
              <div className="text-dim" style={{ fontSize: '0.75rem', marginBottom: '12px' }}>
                URL: {feature.route}
              </div>
              <p className="text-muted" style={{ fontSize: '0.875rem', marginBottom: '24px', minHeight: '40px' }}>
                {feature.description}
              </p>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '16px', borderTop: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <button
                    className="btn-outline"
                    style={{ padding: '6px' }}
                    onClick={() => toggleStatus(feature)}
                    title={feature.status === FeatureStatus.ACTIVE ? 'Deactivate' : 'Activate'}
                  >
                    {feature.status === FeatureStatus.ACTIVE ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                  <button
                    className="btn-outline"
                    style={{ padding: '6px' }}
                    onClick={() => openEditForm(feature)}
                    title="Edit feature"
                  >
                    <Settings size={18} />
                  </button>
                </div>
                <button
                  className="btn-outline"
                  style={{ padding: '6px', color: 'var(--error)', borderColor: 'rgba(239, 68, 68, 0.1)' }}
                  onClick={() => handleDelete(feature.featureId)}
                  title="Delete feature"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {features.length === 0 && !loading && (
        <div className="card" style={{ textAlign: 'center', padding: '64px' }}>
          <Cpu size={48} className="text-dim" style={{ marginBottom: '16px' }} />
          <p className="text-muted">No features registered in the registry.</p>
        </div>
      )}
    </div>
  );
}
