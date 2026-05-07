'use client';

// ============================================================
// Feature Registry — Super Admin interface for D3: features
// ============================================================

import React, { useEffect, useState } from 'react';
import { getFeatures, updateFeature, createFeature, deleteFeature } from '@/lib/firebase/firestore';
import { useAuth } from '@/lib/context/AuthContext';
import { isSuperAdmin } from '@/lib/utils/permissions';
import { FeatureStatus, FeatureCategory } from '@/lib/types';
import type { Feature } from '@/lib/types';
import { 
  Cpu, 
  Plus, 
  Edit3, 
  Trash2, 
  Eye, 
  EyeOff, 
  Settings,
  AlertTriangle,
  Zap
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as Icons from 'lucide-react';

export default function FeatureRegistryPage() {
  const { userProfile, userRole, loading: authLoading } = useAuth();
  const [features, setFeatures] = useState<Feature[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  
  // Form state
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState('Zap');
  const [category, setCategory] = useState<FeatureCategory>(FeatureCategory.TOOL);
  const [isPlaceholder, setIsPlaceholder] = useState(true);
  const [status, setStatus] = useState<FeatureStatus>(FeatureStatus.ACTIVE);
  
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

  const handleCreateFeature = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userProfile) return;

    try {
      const id = await createFeature({
        name,
        slug,
        description,
        route: `/tools/${slug}`,
        icon,
        category,
        status,
        isPlaceholder,
        supportedInputTypes: ['text_prompt'],
        toolConfig: null,
        sortOrder: features.length + 1,
        createdBy: userProfile.uid
      });

      const newFeature: Feature = {
        featureId: id,
        name,
        slug,
        description,
        route: `/tools/${slug}`,
        icon,
        category,
        status,
        isPlaceholder,
        supportedInputTypes: ['text_prompt'],
        toolConfig: null,
        sortOrder: features.length + 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: userProfile.uid
      };

      setFeatures([...features, newFeature]);
      setShowForm(false);
      // Reset form
      setName(''); setSlug(''); setDescription(''); setIcon('Zap');
    } catch (error) {
      console.error('Failed to create feature:', error);
    }
  };

  const toggleStatus = async (feature: Feature) => {
    const newStatus = feature.status === FeatureStatus.ACTIVE ? FeatureStatus.INACTIVE : FeatureStatus.ACTIVE;
    try {
      await updateFeature(feature.featureId, { status: newStatus });
      setFeatures(features.map(f => f.featureId === feature.featureId ? { ...f, status: newStatus } : f));
    } catch (error) {
      console.error('Failed to update status:', error);
    }
  };

  if (authLoading || loading) return <div className="loading-container"><div className="spinner"></div></div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
        <div>
          <h1>Feature Registry</h1>
          <p className="text-muted">Register and configure AI tools, documentation modules, and system features.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? <Plus style={{ transform: 'rotate(45deg)' }} /> : <Plus />}
          {showForm ? 'Cancel' : 'Register Feature'}
        </button>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: '40px' }}>
          <h3>Register New Feature</h3>
          <form onSubmit={handleCreateFeature} style={{ marginTop: '24px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
              <div className="input-group">
                <label className="label">Feature Name</label>
                <input 
                  type="text" 
                  value={name} 
                  onChange={(e) => setName(e.target.value)} 
                  placeholder="e.g., SEO Assistant" 
                  required 
                />
              </div>
              <div className="input-group">
                <label className="label">Slug (URL identifier)</label>
                <input 
                  type="text" 
                  value={slug} 
                  onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/\s+/g, '-'))} 
                  placeholder="e.g., seo-assistant" 
                  required 
                />
              </div>
            </div>

            <div className="input-group">
              <label className="label">Description</label>
              <textarea 
                value={description} 
                onChange={(e) => setDescription(e.target.value)} 
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
                  value={icon} 
                  onChange={(e) => setIcon(e.target.value)} 
                  placeholder="e.g., Search, Zap, Image" 
                />
              </div>
              <div className="input-group">
                <label className="label">Category</label>
                <select value={category} onChange={(e) => setCategory(e.target.value as FeatureCategory)}>
                  <option value={FeatureCategory.TOOL}>Tool</option>
                  <option value={FeatureCategory.DOCUMENTATION}>Documentation</option>
                  <option value={FeatureCategory.WORKFLOW}>Workflow</option>
                </select>
              </div>
              <div className="input-group">
                <label className="label">Status</label>
                <select value={status} onChange={(e) => setStatus(e.target.value as FeatureStatus)}>
                  <option value={FeatureStatus.ACTIVE}>Active</option>
                  <option value={FeatureStatus.INACTIVE}>Inactive</option>
                  <option value={FeatureStatus.COMING_SOON}>Coming Soon</option>
                </select>
              </div>
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                <input 
                  type="checkbox" 
                  checked={isPlaceholder} 
                  onChange={(e) => setIsPlaceholder(e.target.checked)}
                  style={{ width: '18px', height: '18px' }}
                />
                <span style={{ fontSize: '0.9375rem', fontWeight: 500 }}>Placeholder Mode (Phase 1)</span>
              </label>
              <p className="text-dim" style={{ fontSize: '0.75rem', marginLeft: '28px', marginTop: '4px' }}>
                When enabled, the tool will render a placeholder chat UI instead of its custom interface.
              </p>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="submit" className="btn btn-primary">
                Register Tool
              </button>
            </div>
          </form>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '24px' }}>
        {features.map((feature) => {
          // @ts-ignore
          const IconComponent = Icons[feature.icon] || Icons.HelpCircle;
          return (
            <div key={feature.featureId} className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
                <div style={{ 
                  background: 'rgba(124, 58, 237, 0.1)', 
                  padding: '10px', 
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--primary)'
                }}>
                  <IconComponent size={24} />
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <span className={`badge ${feature.status === FeatureStatus.ACTIVE ? 'badge-success' : 'badge-error'}`}>
                    {feature.status.toUpperCase()}
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
                  <button className="btn-outline" style={{ padding: '6px' }} title="Edit Config">
                    <Settings size={18} />
                  </button>
                </div>
                <button 
                  className="btn-outline" 
                  style={{ padding: '6px', color: 'var(--error)', borderColor: 'rgba(239, 68, 68, 0.1)' }}
                  onClick={() => { if(confirm('Delete feature?')) deleteFeature(feature.featureId); }}
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
