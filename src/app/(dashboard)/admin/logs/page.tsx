'use client';

// ============================================================
// Activity Logs — Audit trail viewer for D5: activity_logs
// ============================================================

import React, { useEffect, useState } from 'react';
import { getActivityLogs } from '@/lib/firebase/firestore';
import { useAuth } from '@/lib/context/AuthContext';
import { canViewActivityLogs } from '@/lib/utils/permissions';
import { LogSeverity } from '@/lib/types';
import type { ActivityLog } from '@/lib/types';
import { 
  ListRestart, 
  Search, 
  Filter, 
  Clock, 
  User as UserIcon, 
  Zap, 
  ShieldAlert,
  Info,
  Calendar,
  AlertTriangle,
  AlertCircle
} from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function ActivityLogsPage() {
  const { userRole, loading: authLoading } = useAuth();
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterSeverity, setFilterSeverity] = useState<string>('all');
  
  const router = useRouter();

  useEffect(() => {
    if (!authLoading && !canViewActivityLogs(userRole)) {
      router.push('/');
      return;
    }

    async function loadData() {
      const data = await getActivityLogs(100); // Get last 100 logs
      setLogs(data);
      setLoading(false);
    }
    
    if (userRole) loadData();
  }, [userRole, authLoading, router]);

  const filteredLogs = logs.filter(log => {
    const matchesSearch = log.userEmail.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          log.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          log.targetName?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesSeverity = filterSeverity === 'all' || log.severity === filterSeverity;
    return matchesSearch && matchesSeverity;
  });

  if (authLoading || loading) return <div className="loading-container"><div className="spinner"></div></div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
        <div>
          <h1>Activity Logs</h1>
          <p className="text-muted">Audit trail of all system events, user actions, and security alerts.</p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button className="btn btn-outline" onClick={() => router.refresh()}>
            <Clock size={18} />
            Refresh
          </button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: '32px', padding: '16px 24px' }}>
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)' }} />
            <input 
              type="text" 
              placeholder="Search logs by user, action, or target..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ paddingLeft: '40px', height: '44px' }}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Filter size={18} className="text-dim" />
            <select 
              value={filterSeverity}
              onChange={(e) => setFilterSeverity(e.target.value)}
              style={{ height: '44px', width: '160px' }}
            >
              <option value="all">All Severities</option>
              <option value={LogSeverity.INFO}>Info</option>
              <option value={LogSeverity.WARNING}>Warning</option>
              <option value={LogSeverity.CRITICAL}>Critical</option>
            </select>
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Event</th>
                <th>User</th>
                <th>Target</th>
                <th>Severity</th>
                <th>Timestamp</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.map((log) => (
                <tr key={log.logId}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{ 
                        color: log.severity === LogSeverity.CRITICAL ? 'var(--error)' : 
                               log.severity === LogSeverity.WARNING ? 'var(--warning)' : 'var(--primary-light)' 
                      }}>
                        {log.severity === LogSeverity.CRITICAL ? <ShieldAlert size={16} /> : 
                         log.severity === LogSeverity.WARNING ? <AlertTriangle size={16} /> : <Info size={16} />}
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{log.action.replace(/\./g, ' ').toUpperCase()}</div>
                        <div className="text-dim" style={{ fontSize: '0.75rem' }}>{log.logId.substring(0, 8)}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <UserIcon size={14} className="text-dim" />
                      <div>
                        <div style={{ fontSize: '0.875rem' }}>{log.userEmail}</div>
                        <div className="text-dim" style={{ fontSize: '0.7rem' }}>{log.userRole}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    {log.targetName ? (
                      <div>
                        <div style={{ fontSize: '0.875rem' }}>{log.targetName}</div>
                        <div className="text-dim" style={{ fontSize: '0.7rem' }}>{log.targetType}</div>
                      </div>
                    ) : (
                      <span className="text-dim">—</span>
                    )}
                  </td>
                  <td>
                    <span className={`badge ${
                      log.severity === LogSeverity.CRITICAL ? 'badge-error' : 
                      log.severity === LogSeverity.WARNING ? 'badge-warning' : 
                      'badge-info'
                    }`}>
                      {log.severity.toUpperCase()}
                    </span>
                  </td>
                  <td>
                    <div className="text-dim" style={{ fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Calendar size={14} />
                      {log.createdAt.toLocaleString()}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filteredLogs.length === 0 && (
          <div style={{ textAlign: 'center', padding: '64px' }}>
            <ListRestart size={48} className="text-dim" style={{ marginBottom: '16px' }} />
            <p className="text-muted">No activity logs found.</p>
          </div>
        )}
      </div>
    </div>
  );
}
