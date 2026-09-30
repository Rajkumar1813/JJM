import React, { useState } from 'react';
import {
  Tv,
  Megaphone,
  Image as ImageIcon,
  CheckCircle2,
  AlertTriangle,
  Play,
  Pause,
  Power,
  Sliders,
  Send,
  Radio,
  Clock,
  ExternalLink,
  ShieldAlert,
} from 'lucide-react';
import { Screen, Department, MediaItem, Campaign } from '../types';
import { api } from '../services/api';

interface DashboardProps {
  screens: Screen[];
  departments: Department[];
  media: MediaItem[];
  campaigns: Campaign[];
  onSelectScreen: (screen: Screen) => void;
  onOpenPairModal: () => void;
  onOpenGlobalModal: () => void;
  onNavigateToLiveFeeds?: () => void;
  onRefresh?: () => void;
}

export const Dashboard: React.FC<DashboardProps> = ({
  screens,
  departments,
  media,
  campaigns,
  onSelectScreen,
  onOpenPairModal,
  onOpenGlobalModal,
  onNavigateToLiveFeeds,
  onRefresh,
}) => {
  const onlineCount = screens.filter((s) => s.connectionStatus === 'online').length;
  const offlineCount = screens.length - onlineCount;
  const activeCampaignsCount = campaigns.filter((c) => c.status === 'active').length;

  // Broadcast state
  const [broadcastTarget, setBroadcastTarget] = useState<'all' | 'department' | 'screen'>('all');
  const [selectedTargetId, setSelectedTargetId] = useState<string>('');
  const [broadcastTitle, setBroadcastTitle] = useState('Hospital General Awareness Broadcast');
  const [broadcastMediaId, setBroadcastMediaId] = useState(media[0]?.id || '');
  const [broadcastDuration, setBroadcastDuration] = useState(30);
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [broadcastFeedback, setBroadcastFeedback] = useState<string | null>(null);

  const handleCreateBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsBroadcasting(true);
    setBroadcastFeedback(null);
    try {
      const selectedMedia = media.find((m) => m.id === broadcastMediaId) || media[0];
      if (!selectedMedia) {
        throw new Error('Please upload or select a media asset first');
      }

      if (broadcastTarget === 'all') {
        await api.post('/campaigns/broadcast-global', {
          name: broadcastTitle,
          mediaId: selectedMedia.id,
          mediaUrl: selectedMedia.url,
          priority: 80,
          duration: Number(broadcastDuration),
        });
      } else {
        const isVideo = selectedMedia.type === 'video';
        const targetId = selectedTargetId || (broadcastTarget === 'department' ? departments[0]?.id : screens[0]?.id);
        await api.post('/campaigns', {
          name: broadcastTitle,
          type: broadcastTarget,
          contentType: isVideo ? 'single_video_only' : 'single_image_only',
          mediaId: selectedMedia.id,
          mediaUrl: selectedMedia.url,
          priority: 85,
          intervalMinutes: 1,
          displayDurationSeconds: Number(broadcastDuration),
          daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
          status: 'active',
          targetIds: [targetId],
        });
      }

      setBroadcastFeedback('Broadcast successfully initiated across selected hospital displays.');
      onRefresh?.();
      setTimeout(() => setBroadcastFeedback(null), 5000);
    } catch (err: any) {
      setBroadcastFeedback(`Error creating broadcast: ${err.message}`);
    } finally {
      setIsBroadcasting(false);
    }
  };

  const handleTogglePause = async (screenId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await api.post(`/screens/${screenId}/toggle-pause`);
      onRefresh?.();
    } catch (err: any) {
      alert(`Failed to pause/resume screen: ${err.message}`);
    }
  };

  const handleTogglePower = async (screen: Screen, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const nextState = screen.powerState === 'off' ? 'on' : 'off';
      await api.post(`/screens/${screen.id}/power`, { state: nextState });
      onRefresh?.();
    } catch (err: any) {
      alert(`Failed to change power state: ${err.message}`);
    }
  };

  return (
    <div style={{ padding: '28px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Top Banner / Heading */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--dark)' }}>
            Hospital Overview
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Monitor, control and broadcast content across all connected hospital displays.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="btn btn-secondary btn-sm" onClick={onOpenGlobalModal}>
            <Megaphone size={14} />
            <span>1-Click Broadcast</span>
          </button>
          <button className="btn btn-primary btn-sm" onClick={onOpenPairModal}>
            <Tv size={14} />
            <span>Pair New TV</span>
          </button>
        </div>
      </div>

      {/* KPI Cards (5 Cards) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '16px',
        }}
      >
        {/* Total TVs */}
        <div className="card" style={{ padding: '18px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Total TVs
            </span>
            <div style={{ color: 'var(--primary)', backgroundColor: 'var(--primary-subtle)', padding: '6px', borderRadius: 'var(--radius-sm)' }}>
              <Tv size={16} />
            </div>
          </div>
          <div style={{ fontSize: '26px', fontWeight: 700, color: 'var(--dark)', lineHeight: 1.1 }}>
            {screens.length}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px' }}>
            Across OPDs & departments
          </div>
        </div>

        {/* Online TVs */}
        <div className="card" style={{ padding: '18px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Online TVs
            </span>
            <span className="badge badge-online">
              <span className="status-dot online" />
              Live
            </span>
          </div>
          <div style={{ fontSize: '26px', fontWeight: 700, color: '#0E805E', lineHeight: 1.1 }}>
            {onlineCount} <span style={{ fontSize: '16px', fontWeight: 500, color: 'var(--text-muted)' }}>/ {screens.length}</span>
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px' }}>
            {offlineCount === 0 ? 'All screens operational' : `${offlineCount} screen${offlineCount === 1 ? '' : 's'} offline`}
          </div>
        </div>

        {/* Offline TVs */}
        <div className="card" style={{ padding: '18px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Offline TVs
            </span>
            <div style={{ color: offlineCount > 0 ? 'var(--danger)' : 'var(--text-muted)', backgroundColor: offlineCount > 0 ? 'var(--danger-subtle)' : '#F1EDF5', padding: '6px', borderRadius: 'var(--radius-sm)' }}>
              <AlertTriangle size={16} />
            </div>
          </div>
          <div style={{ fontSize: '26px', fontWeight: 700, color: offlineCount > 0 ? 'var(--danger)' : 'var(--text-main)', lineHeight: 1.1 }}>
            {offlineCount}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px' }}>
            {offlineCount === 0 ? 'Zero device alerts' : 'Check Wi-Fi or TV power'}
          </div>
        </div>

        {/* Active Campaigns */}
        <div className="card" style={{ padding: '18px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Active Campaigns
            </span>
            <div style={{ color: 'var(--primary)', backgroundColor: 'var(--primary-subtle)', padding: '6px', borderRadius: 'var(--radius-sm)' }}>
              <Megaphone size={16} />
            </div>
          </div>
          <div style={{ fontSize: '26px', fontWeight: 700, color: 'var(--dark)', lineHeight: 1.1 }}>
            {activeCampaignsCount < 10 ? `0${activeCampaignsCount}` : activeCampaignsCount}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px' }}>
            Currently broadcasting
          </div>
        </div>

        {/* Media Assets */}
        <div className="card" style={{ padding: '18px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Media Assets
            </span>
            <div style={{ color: 'var(--info)', backgroundColor: 'var(--info-subtle)', padding: '6px', borderRadius: 'var(--radius-sm)' }}>
              <ImageIcon size={16} />
            </div>
          </div>
          <div style={{ fontSize: '26px', fontWeight: 700, color: 'var(--dark)', lineHeight: 1.1 }}>
            {media.length}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px' }}>
            Images + Videos in library
          </div>
        </div>
      </div>

      {/* Main Control Area (Broadcast Control + Live System Status) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '20px' }}>
        {/* Left: Hospital Broadcast Control */}
        <div className="card">
          <div className="card-header">
            <div>
              <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--dark)' }}>
                Hospital Broadcast Control
              </h3>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                Deploy instant informational or emergency content across targeted screens.
              </p>
            </div>
            <Radio size={18} color="var(--primary)" />
          </div>

          <form onSubmit={handleCreateBroadcast} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {/* Target Selection */}
            <div>
              <label className="form-label">Broadcast Target</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => setBroadcastTarget('all')}
                  className={broadcastTarget === 'all' ? 'btn btn-primary btn-sm' : 'btn btn-outline btn-sm'}
                  style={{ width: '100%' }}
                >
                  All TVs ({screens.length})
                </button>
                <button
                  type="button"
                  onClick={() => setBroadcastTarget('department')}
                  className={broadcastTarget === 'department' ? 'btn btn-primary btn-sm' : 'btn btn-outline btn-sm'}
                  style={{ width: '100%' }}
                >
                  Department
                </button>
                <button
                  type="button"
                  onClick={() => setBroadcastTarget('screen')}
                  className={broadcastTarget === 'screen' ? 'btn btn-primary btn-sm' : 'btn btn-outline btn-sm'}
                  style={{ width: '100%' }}
                >
                  Single Screen
                </button>
              </div>
            </div>

            {/* Target Dropdown if department or screen selected */}
            {broadcastTarget === 'department' && (
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Select Department</label>
                <select
                  className="form-select"
                  value={selectedTargetId}
                  onChange={(e) => setSelectedTargetId(e.target.value)}
                  required
                >
                  <option value="">-- Choose Department --</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.code})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {broadcastTarget === 'screen' && (
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Select Screen</label>
                <select
                  className="form-select"
                  value={selectedTargetId}
                  onChange={(e) => setSelectedTargetId(e.target.value)}
                  required
                >
                  <option value="">-- Choose Screen --</option>
                  {screens.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.location})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Broadcast Title */}
            <div>
              <label className="form-label">Broadcast Name / Heading</label>
              <input
                type="text"
                className="form-input"
                value={broadcastTitle}
                onChange={(e) => setBroadcastTitle(e.target.value)}
                placeholder="e.g. Free Eye Health Checkup OPD Announcement"
                required
              />
            </div>

            {/* Media Selector & Duration */}
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px' }}>
              <div>
                <label className="form-label">Select Media Asset</label>
                <select
                  className="form-select"
                  value={broadcastMediaId}
                  onChange={(e) => setBroadcastMediaId(e.target.value)}
                  required
                >
                  {media.length === 0 ? (
                    <option value="">No media in library</option>
                  ) : (
                    media.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.title} ({m.type.toUpperCase()})
                      </option>
                    ))
                  )}
                </select>
              </div>

              <div>
                <label className="form-label">Duration (sec)</label>
                <select
                  className="form-select"
                  value={broadcastDuration}
                  onChange={(e) => setBroadcastDuration(Number(e.target.value))}
                >
                  <option value={15}>15 sec</option>
                  <option value={30}>30 sec</option>
                  <option value={60}>1 min</option>
                  <option value={120}>2 min</option>
                </select>
              </div>
            </div>

            {/* Feedback notification */}
            {broadcastFeedback && (
              <div
                style={{
                  padding: '10px 12px',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '12px',
                  fontWeight: 500,
                  backgroundColor: broadcastFeedback.includes('Error') ? 'var(--danger-subtle)' : 'var(--success-subtle)',
                  color: broadcastFeedback.includes('Error') ? 'var(--danger)' : '#0E805E',
                  border: `1px solid ${broadcastFeedback.includes('Error') ? '#F8C8CB' : '#C4F0E1'}`,
                }}
              >
                {broadcastFeedback}
              </div>
            )}

            <button
              type="submit"
              className="btn btn-primary"
              disabled={isBroadcasting || media.length === 0}
              style={{ marginTop: '4px' }}
            >
              <Send size={15} />
              <span>{isBroadcasting ? 'Dispatching Command...' : 'Create Broadcast'}</span>
            </button>
          </form>
        </div>

        {/* Right: Live System Status */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="card-header">
            <div>
              <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--dark)' }}>
                Live System Status
              </h3>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                Real-time operational telemetry of the signage and queue pipeline.
              </p>
            </div>
            <span className="badge badge-online">
              <span className="status-dot online" />
              Connected
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', flex: 1 }}>
            {/* Status Item 1: Fleet Sync */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', backgroundColor: 'var(--bg-subtle)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Tv size={16} color="var(--primary)" />
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-main)' }}>
                    Display Fleet Synchronization
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                    {onlineCount} of {screens.length} TVs transmitting continuous heartbeat
                  </div>
                </div>
              </div>
              <span className="badge badge-purple">
                {screens.length > 0 ? Math.round((onlineCount / screens.length) * 100) : 0}% Synced
              </span>
            </div>

            {/* Status Item 2: Doctor Queue Integration */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', backgroundColor: 'var(--bg-subtle)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Clock size={16} color="var(--success)" />
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-main)' }}>
                    Doctor OPD Queue Integration
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                    HMS queue links responding with 0 DOM mutations delayed
                  </div>
                </div>
              </div>
              <span className="badge badge-online">
                Active
              </span>
            </div>

            {/* Status Item 3: Storage Engine */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', backgroundColor: 'var(--bg-subtle)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <CheckCircle2 size={16} color="var(--primary)" />
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-main)' }}>
                    SQLite Storage & 5-Stage ACK
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                    WAL journal active, commands transaction-audited
                  </div>
                </div>
              </div>
              <span className="badge badge-neutral">
                ACID WAL
              </span>
            </div>

            {/* Quick Emergency Note */}
            <div style={{ marginTop: 'auto', padding: '12px', borderRadius: 'var(--radius-sm)', backgroundColor: 'var(--danger-subtle)', border: '1px solid #F8C8CB', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ShieldAlert size={18} color="var(--danger)" />
                <div style={{ fontSize: '12px', fontWeight: 600, color: '#B53237' }}>
                  Emergency Announcement Control
                </div>
              </div>
              <button
                className="btn btn-danger btn-sm"
                onClick={onOpenGlobalModal}
                style={{ padding: '4px 10px', fontSize: '11px' }}
              >
                Instant Alert
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Live Screen Overview Grid */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--dark)' }}>
              Live Screen Overview
            </h2>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
              Click any TV card to open its dedicated command center and diagnostics.
            </p>
          </div>

          {onNavigateToLiveFeeds && (
            <button className="btn btn-outline btn-sm" onClick={onNavigateToLiveFeeds}>
              <ExternalLink size={13} />
              <span>CCTV Matrix View</span>
            </button>
          )}
        </div>

        {screens.length === 0 ? (
          <div className="card" style={{ padding: '36px', textAlign: 'center' }}>
            <Tv size={36} color="var(--text-muted)" style={{ margin: '0 auto 12px' }} />
            <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--dark)' }}>
              No TV Displays Paired Yet
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px', maxWidth: '400px', margin: '4px auto 16px' }}>
              Power on the Android TV player app and use the 6-digit pairing code to connect your first screen.
            </p>
            <button className="btn btn-primary btn-sm" onClick={onOpenPairModal}>
              <Tv size={14} />
              <span>Pair Your First TV</span>
            </button>
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
              gap: '16px',
            }}
          >
            {screens.map((screen) => {
              const dept = departments.find((d) => d.id === screen.departmentId);
              const isOnline = screen.connectionStatus === 'online';
              const isPaused = screen.isPaused;
              const isPowerOff = screen.powerState === 'off';

              return (
                <div
                  key={screen.id}
                  className="card"
                  onClick={() => onSelectScreen(screen)}
                  style={{
                    padding: '16px',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    borderLeft: `4px solid ${isOnline ? 'var(--success)' : 'var(--danger)'}`,
                  }}
                >
                  {/* Card Header: Name + Department + Status */}
                  <div>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
                      <div>
                        <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--dark)' }}>
                          {screen.name}
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '1px' }}>
                          {dept?.name || 'OPD Department'} • {screen.location || 'Consultation Room'}
                        </div>
                      </div>

                      <span className={`badge ${isOnline ? 'badge-online' : 'badge-offline'}`}>
                        <span className={`status-dot ${isOnline ? 'online' : 'offline'}`} />
                        {isOnline ? 'Online' : 'Offline'}
                      </span>
                    </div>

                    {/* Metadata summary */}
                    <div
                      style={{
                        margin: '12px 0',
                        padding: '10px',
                        backgroundColor: 'var(--bg-main)',
                        borderRadius: 'var(--radius-sm)',
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: '8px',
                        fontSize: '11px',
                      }}
                    >
                      <div>
                        <span style={{ color: 'var(--text-muted)' }}>Now Showing:</span>
                        <div style={{ fontWeight: 600, color: 'var(--text-main)', marginTop: '1px', textTransform: 'capitalize' }}>
                          {screen.currentContent === 'queue' ? 'Queue Display' : screen.currentContent || 'Queue'}
                        </div>
                      </div>

                      <div>
                        <span style={{ color: 'var(--text-muted)' }}>Queue Link:</span>
                        <div style={{ fontWeight: 600, color: '#0E805E', marginTop: '1px' }}>
                          {screen.queueUrl ? 'Connected' : 'Unassigned'}
                        </div>
                      </div>

                      <div>
                        <span style={{ color: 'var(--text-muted)' }}>Config Version:</span>
                        <div style={{ fontWeight: 600, color: 'var(--primary)', marginTop: '1px' }}>
                          v{screen.appliedConfigVersion || 1} / v{screen.targetConfigVersion || 1}
                        </div>
                      </div>

                      <div>
                        <span style={{ color: 'var(--text-muted)' }}>Last Sync:</span>
                        <div style={{ fontWeight: 500, color: 'var(--text-secondary)', marginTop: '1px' }}>
                          {screen.lastHeartbeat
                            ? new Date(screen.lastHeartbeat).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                            : 'Pending'}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Actions footer */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      paddingTop: '10px',
                      borderTop: '1px solid var(--border)',
                    }}
                  >
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        className="btn btn-outline btn-sm"
                        onClick={(e) => handleTogglePause(screen.id, e)}
                        title={isPaused ? 'Resume Playback' : 'Pause Playback'}
                        style={{ padding: '4px 8px' }}
                      >
                        {isPaused ? <Play size={13} color="var(--success)" /> : <Pause size={13} color="var(--warning)" />}
                      </button>

                      <button
                        className="btn btn-outline btn-sm"
                        onClick={(e) => handleTogglePower(screen, e)}
                        title={isPowerOff ? 'Power ON Display' : 'Power OFF Display'}
                        style={{ padding: '4px 8px' }}
                      >
                        <Power size={13} color={isPowerOff ? 'var(--danger)' : 'var(--text-secondary)'} />
                      </button>
                    </div>

                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => onSelectScreen(screen)}
                      style={{ padding: '4px 12px', fontSize: '11px' }}
                    >
                      <Sliders size={12} />
                      <span>Control</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
