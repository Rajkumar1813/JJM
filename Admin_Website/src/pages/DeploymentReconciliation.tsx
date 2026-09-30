import React, { useState, useEffect } from 'react';
import {
  Layers,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Tv,
  ArrowUpRight,
  Zap,
} from 'lucide-react';
import { Screen, Department } from '../types';
import { api } from '../services/api';
import { getSocket } from '../services/socket';

export const DeploymentReconciliation: React.FC = () => {
  const [screens, setScreens] = useState<Screen[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncingScreenId, setSyncingScreenId] = useState<string | null>(null);

  useEffect(() => {
    fetchData();

    const socket = getSocket();
    socket.on('screens:changed', fetchData);
    socket.on('screen:heartbeat_received', fetchData);
    socket.on('screen:status_change', fetchData);

    return () => {
      socket.off('screens:changed', fetchData);
      socket.off('screen:heartbeat_received', fetchData);
      socket.off('screen:status_change', fetchData);
    };
  }, []);

  const fetchData = async () => {
    try {
      const [screensRes, deptsRes] = await Promise.all([
        api.get('/screens'),
        api.get('/departments'),
      ]);
      if (screensRes.data.success) {
        setScreens(screensRes.data.screens);
      }
      if (deptsRes.data.success) {
        setDepartments(deptsRes.data.departments);
      }
    } catch (err) {
      console.error('Failed to fetch reconciliation metrics:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSyncScreen = async (screenId: string) => {
    setSyncingScreenId(screenId);
    try {
      await api.post(`/screens/${screenId}/command`, {
        commandType: 'SYNC_CONFIG',
      });
      fetchData();
    } catch (err: any) {
      alert(`Sync failed: ${err.message}`);
    } finally {
      setSyncingScreenId(null);
    }
  };

  const handleSyncAllOutdated = async () => {
    const outdated = screens.filter((s) => s.appliedConfigVersion < s.targetConfigVersion);
    if (outdated.length === 0) {
      alert('All TVs are already on the latest authoritative config version!');
      return;
    }

    for (const s of outdated) {
      try {
        await api.post(`/screens/${s.id}/command`, { commandType: 'SYNC_CONFIG' });
      } catch (_) {}
    }
    fetchData();
  };

  const formatLastSeen = (isoStr?: string | null) => {
    if (!isoStr) return 'Never';
    const diff = Math.round((Date.now() - new Date(isoStr).getTime()) / 1000);
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
    return `${Math.round(diff / 3600)}h ago`;
  };

  const syncedCount = screens.filter((s) => s.appliedConfigVersion >= s.targetConfigVersion).length;
  const driftCount = screens.length - syncedCount;
  const parityPercentage = screens.length > 0 ? Math.round((syncedCount / screens.length) * 100) : 100;

  return (
    <div style={{ padding: '28px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--dark)' }}>
            Deployment & Version Reconciliation
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Real-time telemetry tracking target vs applied configuration versions and media manifest parity.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="btn btn-outline btn-sm" onClick={fetchData}>
            <RefreshCw size={13} className={loading ? 'spin' : ''} />
            <span>Check Telemetry</span>
          </button>

          <button
            className="btn btn-primary btn-sm"
            onClick={handleSyncAllOutdated}
            disabled={driftCount === 0}
          >
            <Zap size={14} />
            <span>Batch Sync Outdated TVs ({driftCount})</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
        <div className="card" style={{ padding: '16px 20px' }}>
          <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Total Screens
          </div>
          <div style={{ fontSize: '26px', fontWeight: 700, color: 'var(--dark)', marginTop: '6px' }}>
            {screens.length}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
            Managed displays
          </div>
        </div>

        <div className="card" style={{ padding: '16px 20px' }}>
          <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Fully Synchronized
          </div>
          <div style={{ fontSize: '26px', fontWeight: 700, color: '#0E805E', marginTop: '6px' }}>
            {syncedCount}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
            Zero configuration drift
          </div>
        </div>

        <div className="card" style={{ padding: '16px 20px' }}>
          <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Config Drift Detected
          </div>
          <div style={{ fontSize: '26px', fontWeight: 700, color: driftCount > 0 ? 'var(--warning)' : 'var(--text-main)', marginTop: '6px' }}>
            {driftCount}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
            Pending version acknowledgment
          </div>
        </div>

        <div className="card" style={{ padding: '16px 20px' }}>
          <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Fleet Parity Rate
          </div>
          <div style={{ fontSize: '26px', fontWeight: 700, color: 'var(--primary)', marginTop: '6px' }}>
            {parityPercentage}%
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
            Target configuration adherence
          </div>
        </div>
      </div>

      {/* Fleet Version Divergence Table */}
      <div className="table-container">
        <table className="table">
          <thead>
            <tr>
              <th>Status</th>
              <th>TV Screen & Code</th>
              <th>Department</th>
              <th>Target Config</th>
              <th>Applied Config</th>
              <th>Manifest Version</th>
              <th>Last Heartbeat</th>
              <th style={{ textAlign: 'right' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {screens.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)' }}>
                  No TV displays registered
                </td>
              </tr>
            ) : (
              screens.map((screen) => {
                const dept = departments.find((d) => d.id === screen.departmentId);
                const isOutdated = screen.appliedConfigVersion < screen.targetConfigVersion;
                const isOnline = screen.connectionStatus === 'online';

                return (
                  <tr key={screen.id}>
                    <td>
                      <span className={`badge ${isOnline ? 'badge-online' : 'badge-offline'}`}>
                        <span className={`status-dot ${isOnline ? 'online' : 'offline'}`} />
                        {isOnline ? 'Online' : 'Offline'}
                      </span>
                    </td>

                    <td>
                      <div style={{ fontWeight: 600, color: 'var(--dark)' }}>{screen.name}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{screen.code}</div>
                    </td>

                    <td>{dept?.name || 'Department'}</td>

                    <td>
                      <span className="badge badge-purple">
                        v{screen.targetConfigVersion || 1}
                      </span>
                    </td>

                    <td>
                      <span className={`badge ${isOutdated ? 'badge-warning' : 'badge-online'}`}>
                        v{screen.appliedConfigVersion || 1} {isOutdated ? '(Drift)' : '(Synced)'}
                      </span>
                    </td>

                    <td>
                      <span className="badge badge-neutral">
                        Manifest v{screen.mediaManifestVersion || 1}
                      </span>
                    </td>

                    <td>
                      <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                        {formatLastSeen(screen.lastHeartbeat)}
                      </span>
                    </td>

                    <td style={{ textAlign: 'right' }}>
                      <button
                        className={isOutdated ? 'btn btn-primary btn-sm' : 'btn btn-outline btn-sm'}
                        onClick={() => handleSyncScreen(screen.id)}
                        disabled={syncingScreenId === screen.id}
                        style={{ padding: '4px 10px', fontSize: '11px' }}
                      >
                        <RefreshCw size={11} className={syncingScreenId === screen.id ? 'spin' : ''} />
                        <span>{isOutdated ? 'Force Sync' : 'Re-verify'}</span>
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
