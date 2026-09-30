import React, { useState, useEffect } from 'react';
import {
  X,
  RefreshCw,
  ExternalLink,
  Tv,
  Play,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Layers,
  Radio,
  Sliders,
  ShieldAlert,
  Send,
  Zap,
} from 'lucide-react';
import { Screen, Department, DeviceCommand, CommandType } from '../types';
import { api } from '../services/api';
import { getSocket } from '../services/socket';

interface ScreenDetailModalProps {
  screen: Screen | null;
  departments: Department[];
  isOpen: boolean;
  onClose: () => void;
  onRefreshList: () => void;
}

export const ScreenDetailModal: React.FC<ScreenDetailModalProps> = ({
  screen,
  departments,
  isOpen,
  onClose,
  onRefreshList,
}) => {
  if (!isOpen || !screen) return null;

  const [activeTab, setActiveTab] = useState<'control' | 'commands' | 'settings'>('control');
  const [queueUrl, setQueueUrl] = useState(screen.queueUrl);
  const [name, setName] = useState(screen.name);
  const [departmentId, setDepartmentId] = useState(screen.departmentId);
  const [location, setLocation] = useState(screen.location);
  const [staleThreshold, setStaleThreshold] = useState(screen.staleThresholdSeconds || 180);

  const [isUpdating, setIsUpdating] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Command Execution State
  const [activeCommand, setActiveCommand] = useState<DeviceCommand | null>(null);
  const [recentCommands, setRecentCommands] = useState<DeviceCommand[]>([]);
  const [isExecutingCommand, setIsExecutingCommand] = useState<string | null>(null);

  const dept = departments.find((d) => d.id === screen.departmentId);
  const isOnline = screen.connectionStatus === 'online';

  const fetchRecentCommands = async () => {
    try {
      const res = await api.get(`/screens/${screen.id}/commands`);
      if (res.data.success && res.data.commands) {
        setRecentCommands(res.data.commands);
      }
    } catch (_) {}
  };

  useEffect(() => {
    fetchRecentCommands();

    const socket = getSocket();
    const handleCommandUpdate = (data: any) => {
      if (data.screenId === screen.id) {
        setActiveCommand((prev) => {
          if (prev && prev.id === data.commandId) {
            return { ...prev, status: data.status, errorMessage: data.errorMessage };
          }
          return prev;
        });
        fetchRecentCommands();
        if (data.status === 'ACKNOWLEDGED') {
          onRefreshList();
        }
      }
    };

    socket.on('command:status_updated', handleCommandUpdate);
    return () => {
      socket.off('command:status_updated', handleCommandUpdate);
    };
  }, [screen.id]);

  const dispatchCommand = async (type: CommandType, payload: any = {}) => {
    setIsExecutingCommand(type);
    setFeedback(null);
    try {
      const res = await api.post(`/screens/${screen.id}/command`, {
        commandType: type,
        payload,
      });

      if (res.data.success && res.data.command) {
        setActiveCommand(res.data.command);
        fetchRecentCommands();
        setFeedback(`Command "${type}" dispatched with ID: ${res.data.command.id}`);
      }
    } catch (err: any) {
      setFeedback(`Dispatch error: ${err.message}`);
    } finally {
      setIsExecutingCommand(null);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsUpdating(true);
    setFeedback(null);
    try {
      await api.patch(`/screens/${screen.id}`, {
        name,
        queueUrl,
        departmentId,
        location,
        staleThresholdSeconds: Number(staleThreshold),
      });
      setFeedback('Screen settings successfully updated.');
      onRefreshList();
    } catch (err: any) {
      setFeedback(`Update failed: ${err.message}`);
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '780px', width: '95%' }}
      >
        {/* Header */}
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: 'var(--primary-subtle)',
                color: 'var(--primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Tv size={20} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h3 style={{ fontSize: '17px', fontWeight: 700, color: 'var(--dark)' }}>
                  {screen.name}
                </h3>
                <span className={`badge ${isOnline ? 'badge-online' : 'badge-offline'}`}>
                  <span className={`status-dot ${isOnline ? 'online' : 'offline'}`} />
                  {isOnline ? 'Online' : 'Offline'}
                </span>
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                {dept?.name || 'Department'} • {screen.location} • Code: {screen.code}
              </div>
            </div>
          </div>

          <button className="btn-ghost" onClick={onClose} style={{ padding: '4px' }}>
            <X size={20} />
          </button>
        </div>

        {/* Tab Navigation */}
        <div
          style={{
            display: 'flex',
            borderBottom: '1px solid var(--border)',
            padding: '0 24px',
            backgroundColor: '#FAF8FC',
            gap: '8px',
          }}
        >
          {[
            { id: 'control', label: 'Live Control & Preview' },
            { id: 'commands', label: '5-Stage Command Timeline' },
            { id: 'settings', label: 'Configuration' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              style={{
                padding: '12px 14px',
                border: 'none',
                background: 'none',
                fontSize: '13px',
                fontWeight: activeTab === tab.id ? 700 : 500,
                color: activeTab === tab.id ? 'var(--primary)' : 'var(--text-secondary)',
                borderBottom: activeTab === tab.id ? '2px solid var(--primary)' : '2px solid transparent',
                cursor: 'pointer',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Modal Body */}
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {/* Tab 1: Live Control & Preview */}
          {activeTab === 'control' && (
            <>
              {/* Live TV Preview Frame */}
              <div className="tv-preview-frame">
                <div className="tv-preview-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#FFFFFF', fontWeight: 600 }}>
                    <span className={`status-dot ${isOnline ? 'online' : 'offline'}`} />
                    <span>Now Playing: {screen.currentContent === 'queue' ? 'Doctor OPD Queue' : screen.currentContent || 'Queue'}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <a
                      href={`/display/${screen.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: '#EF5A7C', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}
                    >
                      <span>Launch Public TV Display</span>
                      <ExternalLink size={11} />
                    </a>
                    {screen.queueUrl && (
                      <a
                        href={screen.queueUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: '#C8BED1', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}
                      >
                        <span>Open HMS</span>
                        <ExternalLink size={11} />
                      </a>
                    )}
                  </div>
                </div>

                <div
                  style={{
                    flex: 1,
                    backgroundColor: '#111019',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    position: 'relative',
                  }}
                >
                  {screen.latestSnapshot ? (
                    <img
                      src={screen.latestSnapshot}
                      alt="Screen Live Feed"
                      style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                    />
                  ) : (
                    <div style={{ textAlign: 'center', padding: '20px' }}>
                      <Tv size={32} color="#454054" style={{ margin: '0 auto 8px' }} />
                      <div style={{ color: '#E4DFEC', fontSize: '14px', fontWeight: 600 }}>
                        {screen.queueUrl ? 'Doctor OPD Queue Display Active' : 'No Content Assigned'}
                      </div>
                      <div style={{ color: '#888296', fontSize: '12px', marginTop: '2px' }}>
                        {screen.queueUrl}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Mode Controls */}
              <div>
                <label className="form-label">Immediate Playback Override</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => dispatchCommand('RELOAD_QUEUE', { force: true })}
                    disabled={!!isExecutingCommand}
                  >
                    <RefreshCw size={13} className={isExecutingCommand === 'RELOAD_QUEUE' ? 'spin' : ''} />
                    <span>Play Queue</span>
                  </button>

                  <button
                    className="btn btn-outline btn-sm"
                    onClick={() => dispatchCommand('PLAY_CAMPAIGN', { content: 'ad' })}
                    disabled={!!isExecutingCommand}
                  >
                    <Play size={13} />
                    <span>Play Ad</span>
                  </button>

                  <button
                    className="btn btn-outline btn-sm"
                    onClick={() => dispatchCommand('SYNC_CONFIG')}
                    disabled={!!isExecutingCommand}
                  >
                    <Layers size={13} />
                    <span>Sync State</span>
                  </button>

                  <button
                    className="btn btn-danger btn-sm"
                    onClick={() =>
                      dispatchCommand('EMERGENCY_OVERRIDE', {
                        title: 'HOSPITAL OVERRIDE TEST',
                        message: 'Emergency priority broadcast test active.',
                        durationSeconds: 10,
                      })
                    }
                    disabled={!!isExecutingCommand}
                  >
                    <ShieldAlert size={13} />
                    <span>Emergency Alert</span>
                  </button>
                </div>
              </div>

              {/* Device System Controls */}
              <div>
                <label className="form-label">Device Maintenance Controls</label>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button
                    className="btn btn-outline btn-sm"
                    onClick={() => dispatchCommand('RESTART_PLAYER', { force: true })}
                    disabled={!!isExecutingCommand}
                  >
                    <RotateCcw size={13} />
                    <span>Restart TV Player</span>
                  </button>

                  <button
                    className="btn btn-outline btn-sm"
                    onClick={() => dispatchCommand('TAKE_SNAPSHOT')}
                    disabled={!!isExecutingCommand}
                  >
                    <Tv size={13} />
                    <span>Capture Snapshot</span>
                  </button>

                  <button
                    className="btn btn-outline btn-sm"
                    onClick={() => dispatchCommand('CLEAR_CACHE')}
                    disabled={!!isExecutingCommand}
                  >
                    <span>Clear Local Cache</span>
                  </button>
                </div>
              </div>
            </>
          )}

          {/* Tab 2: 5-Stage Command Execution Timeline */}
          {activeTab === 'commands' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                Audited transactional execution timeline across 5 handshake stages:
              </div>

              {/* Active Command Stage Indicator */}
              {activeCommand && (
                <div
                  style={{
                    padding: '14px',
                    borderRadius: 'var(--radius-sm)',
                    backgroundColor: 'var(--bg-subtle)',
                    border: '1px solid var(--border)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--dark)' }}>
                      Active: {activeCommand.commandType} ({activeCommand.id})
                    </span>
                    <span className="badge badge-purple">{activeCommand.status}</span>
                  </div>

                  {/* 5-Stage Visual Stepper */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '4px', textAlign: 'center' }}>
                    {['CREATED', 'SENT', 'RECEIVED', 'APPLIED', 'ACKNOWLEDGED'].map((stage, i) => {
                      const stages = ['CREATED', 'SENT', 'RECEIVED', 'APPLIED', 'ACKNOWLEDGED'];
                      const currentIdx = stages.indexOf(activeCommand.status);
                      const isPastOrCurrent = currentIdx >= i;

                      return (
                        <div
                          key={stage}
                          style={{
                            padding: '6px 2px',
                            borderRadius: '4px',
                            backgroundColor: isPastOrCurrent ? 'var(--primary)' : '#EDE8F2',
                            color: isPastOrCurrent ? '#FFFFFF' : 'var(--text-muted)',
                            fontSize: '10px',
                            fontWeight: 700,
                          }}
                        >
                          {stage}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Recent Commands Table */}
              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Command</th>
                      <th>Status</th>
                      <th>Duration</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentCommands.length === 0 ? (
                      <tr>
                        <td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px' }}>
                          No commands dispatched yet
                        </td>
                      </tr>
                    ) : (
                      recentCommands.map((cmd) => (
                        <tr key={cmd.id}>
                          <td>{new Date(cmd.createdAt).toLocaleTimeString()}</td>
                          <td>
                            <div style={{ fontWeight: 600, color: 'var(--dark)' }}>{cmd.commandType}</div>
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{cmd.id}</div>
                          </td>
                          <td>
                            <span
                              className={`badge ${
                                cmd.status === 'ACKNOWLEDGED'
                                  ? 'badge-online'
                                  : cmd.status === 'FAILED'
                                  ? 'badge-offline'
                                  : 'badge-purple'
                              }`}
                            >
                              {cmd.status}
                            </span>
                          </td>
                          <td>
                            {cmd.acknowledgedAt && cmd.sentAt
                              ? `${new Date(cmd.acknowledgedAt).getTime() - new Date(cmd.sentAt).getTime()}ms`
                              : '-'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Tab 3: Settings Form */}
          {activeTab === 'settings' && (
            <form onSubmit={handleSaveSettings} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">TV Name</label>
                <input
                  type="text"
                  className="form-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Location</label>
                <input
                  type="text"
                  className="form-input"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  required
                />
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Department</label>
                <select
                  className="form-select"
                  value={departmentId}
                  onChange={(e) => setDepartmentId(e.target.value)}
                  required
                >
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.code})
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Doctor OPD Queue URL</label>
                <input
                  type="url"
                  className="form-input"
                  value={queueUrl}
                  onChange={(e) => setQueueUrl(e.target.value)}
                  required
                />
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Queue Staleness Threshold (seconds)</label>
                <input
                  type="number"
                  className="form-input"
                  value={staleThreshold}
                  onChange={(e) => setStaleThreshold(Number(e.target.value))}
                  min={30}
                  max={1200}
                />
              </div>

              <button type="submit" className="btn btn-primary" disabled={isUpdating}>
                {isUpdating ? 'Saving...' : 'Save Configuration'}
              </button>
            </form>
          )}

          {feedback && (
            <div
              style={{
                padding: '10px 12px',
                borderRadius: 'var(--radius-sm)',
                fontSize: '12px',
                fontWeight: 500,
                backgroundColor: feedback.includes('error') ? 'var(--danger-subtle)' : 'var(--success-subtle)',
                color: feedback.includes('error') ? 'var(--danger)' : '#0E805E',
                border: `1px solid ${feedback.includes('error') ? '#F8C8CB' : '#C4F0E1'}`,
              }}
            >
              {feedback}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="modal-footer">
          <button className="btn btn-outline btn-sm" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
