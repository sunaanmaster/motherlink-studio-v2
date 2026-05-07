'use client';

// ============================================================
// Seed Page — Initialize Firebase Database
// ============================================================

import React, { useState } from 'react';
import { runSeed, checkIfSeeded } from '@/lib/firebase/seed';
import { signupWithEmail } from '@/lib/firebase/auth';
import { AlertCircle, CheckCircle2, Database, ShieldAlert } from 'lucide-react';

export default function SeedPage() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSeed = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setResult(null);

    try {
      // 1. Check if already seeded
      const isSeeded = await checkIfSeeded();
      if (isSeeded) {
        setResult({ success: false, message: 'Database already seeded. Initialization skipped.' });
        setLoading(false);
        return;
      }

      // 2. Create the Super Admin Auth account
      const user = await signupWithEmail(email, password, 'Super Admin');
      
      // 3. Run the seed script with the new UID
      await runSeed(user.uid, email);

      setResult({ 
        success: true, 
        message: 'Platform initialized successfully! You can now log in with these credentials.' 
      });
    } catch (error: any) {
      console.error('Seed error:', error);
      setResult({ success: false, message: error.message || 'An error occurred during initialization.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="card auth-card">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: 'var(--warning)', marginBottom: '24px' }}>
          <ShieldAlert size={32} />
          <h2 style={{ marginBottom: 0 }}>System Initializer</h2>
        </div>

        <p className="text-muted" style={{ marginBottom: '24px' }}>
          Use this tool to set up the default roles, features, and your initial Super Admin account. 
          <strong> This should only be run once.</strong>
        </p>

        {result && (
          <div className={`badge ${result.success ? 'badge-success' : 'badge-error'}`} style={{ width: '100%', padding: '16px', marginBottom: '24px', borderRadius: 'var(--radius-md)', display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
            {result.success ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
            <span style={{ fontSize: '0.875rem' }}>{result.message}</span>
          </div>
        )}

        {!result?.success && (
          <form onSubmit={handleSeed}>
            <div className="input-group">
              <label className="label">Super Admin Email</label>
              <input 
                type="email" 
                value={email} 
                onChange={(e) => setEmail(e.target.value)} 
                placeholder="admin@motherlink.io" 
                required 
              />
            </div>
            <div className="input-group">
              <label className="label">Super Admin Password</label>
              <input 
                type="password" 
                value={password} 
                onChange={(e) => setPassword(e.target.value)} 
                placeholder="Minimum 6 characters" 
                required 
                minLength={6}
              />
            </div>

            <button 
              type="submit" 
              className="btn btn-primary" 
              style={{ width: '100%', height: '48px', background: 'var(--warning)', color: 'black' }}
              disabled={loading}
            >
              <Database size={18} />
              {loading ? 'Initializing...' : 'Initialize Platform'}
            </button>
          </form>
        )}

        {result?.success && (
          <a href="/login" className="btn btn-primary" style={{ width: '100%', textDecoration: 'none' }}>
            Go to Login
          </a>
        )}
      </div>
    </div>
  );
}
