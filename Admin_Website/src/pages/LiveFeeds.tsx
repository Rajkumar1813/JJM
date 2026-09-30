import React, { useState, useEffect } from 'react';
import {
  Video,
  Tv,
  Maximize2,
  RefreshCw,
  Eye,
  Sliders,
  X,
  ExternalLink,
} from 'lucide-react';
import { Screen, Department, Campaign, Playlist, MediaItem } from '../types';
import { api, getBackendBaseUrl } from '../services/api';

interface LiveFeedsProps {
  screens: Screen[];
  departments: Department[];
  campaigns: Campaign[];
  playlists: Playlist[];
  media: MediaItem[];
  onRefresh: () => void;
  onOpenGlobalModal: () => void;
  onSelectScreen: (screen: Screen) => void;
}

export const LiveFeeds: React.FC<LiveFeedsProps> = ({
  screens,
  departments,
  campaigns,
  playlists,
  media,
  onRefresh,
  onSelectScreen,
}) => {
  const [selectedDept, setSelectedDept] = useState<string>('all');
  const [gridCols, setGridCols] = useState<number>(3); // 2, 3, or 4 columns
  const [fullscreenFeed, setFullscreenFeed] = useState<Screen | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const filteredScreens = screens.filter(
    (s) => selectedDept === 'all' || s.departmentId === selectedDept
  );

  const handleCaptureSnapshot = async (screenId: string) => {
    setIsRefreshing(true);
    try {
      await api.post(`/screens/${screenId}/command`, {
        commandType: 'CAPTURE_SNAPSHOT',
      });
      setTimeout(() => {
        onRefresh();
        setIsRefreshing(false);
      }, 1500);
    } catch (_) {
      setIsRefreshing(false);
    }
  };

  return (
    <div style={{ padding: '28px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Top Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--dark)' }}>
            Live Feeds (Screen Monitoring)
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Multi-screen visual matrix monitoring active OPD queue displays and promotional broadcasts in real time.
          </p>
        </div>

        {/* Toolbar: Department filter, Column layout switcher, Refresh */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <select
            className="form-select"
            style={{ width: 'auto', minWidth: '160px', height: '36px', fontSize: '12px' }}
            value={selectedDept}
            onChange={(e) => setSelectedDept(e.target.value)}
          >
            <option value="all">All Departments</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>

          {/* 2 / 3 / 4 Column Layout Toggle */}
          <div style={{ display: 'inline-flex', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
            {[2, 3, 4].map((col) => (
              <button
                key={col}
                onClick={() => setGridCols(col)}
                style={{
                  padding: '6px 12px',
                  border: 'none',
                  borderLeft: col > 2 ? '1px solid var(--border)' : 'none',
                  backgroundColor: gridCols === col ? 'var(--primary-subtle)' : '#FFFFFF',
                  color: gridCols === col ? 'var(--primary)' : 'var(--text-secondary)',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: 600,
                }}
              >
                {col} Col
              </button>
            ))}
          </div>

          <button
            className="btn btn-outline btn-sm"
            onClick={onRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw size={13} className={isRefreshing ? 'spin' : ''} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Screen Feed Matrix */}
      {filteredScreens.length === 0 ? (
        <div className="card" style={{ padding: '40px', textAlign: 'center' }}>
          <Video size={38} color="var(--text-muted)" style={{ margin: '0 auto 12px' }} />
          <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--dark)' }}>
            No Connected Feeds Available
          </h3>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Ensure your TV players are powered on and registered with the central backend engine.
          </p>
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))`,
            gap: '18px',
          }}
        >
          {filteredScreens.map((screen) => {
            const dept = departments.find((d) => d.id === screen.departmentId);
            const isOnline = screen.connectionStatus === 'online';

            return (
              <div
                key={screen.id}
                className="card"
                style={{
                  padding: '12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                }}
              >
                {/* Header: Name + Location + Status */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--dark)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {screen.name}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                      {dept?.name || 'Department'} • {screen.location}
                    </div>
                  </div>

                  <span className={`badge ${isOnline ? 'badge-online' : 'badge-offline'}`}>
                    <span className={`status-dot ${isOnline ? 'online' : 'offline'}`} />
                    {isOnline ? 'Online' : 'Offline'}
                  </span>
                </div>

                {/* Display Feed Screen Frame */}
                <div
                  style={{
                    position: 'relative',
                    width: '100%',
                    aspectRatio: '16 / 9',
                    backgroundColor: '#111019',
                    borderRadius: 'var(--radius-sm)',
                    overflow: 'hidden',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {screen.latestSnapshot ? (
                    <img
                      src={screen.latestSnapshot}
                      alt={screen.name}
                      style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                    />
                  ) : screen.queueUrl ? (
                    <iframe
                      src={screen.queueUrl}
                      title={screen.name}
                      style={{
                        width: '200%',
                        height: '200%',
                        transform: 'scale(0.5)',
                        transformOrigin: 'top left',
                        border: 'none',
                        pointerEvents: 'none',
                      }}
                    />
                  ) : (
                    <div style={{ textAlign: 'center', padding: '16px' }}>
                      <Tv size={28} color="#454054" style={{ margin: '0 auto 6px' }} />
                      <div style={{ color: '#E4DFEC', fontSize: '12px', fontWeight: 600 }}>
                        Standby Mode
                      </div>
                    </div>
                  )}

                  {/* Top Live Feed Badge */}
                  <div
                    style={{
                      position: 'absolute',
                      top: '8px',
                      left: '8px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      backgroundColor: 'rgba(0, 0, 0, 0.75)',
                      color: isOnline ? '#18B88A' : '#E85B61',
                      fontSize: '9px',
                      fontWeight: 700,
                    }}
                  >
                    <span
                      style={{
                        width: '5px',
                        height: '5px',
                        borderRadius: '50%',
                        backgroundColor: isOnline ? '#18B88A' : '#E85B61',
                      }}
                    />
                    <span>{isOnline ? 'LIVE FEED' : 'OFFLINE'}</span>
                  </div>

                  {/* Enlarge Button */}
                  <button
                    onClick={() => setFullscreenFeed(screen)}
                    style={{
                      position: 'absolute',
                      bottom: '8px',
                      right: '8px',
                      padding: '4px',
                      borderRadius: '4px',
                      backgroundColor: 'rgba(0, 0, 0, 0.7)',
                      color: '#FFFFFF',
                      border: 'none',
                      cursor: 'pointer',
                    }}
                    title="Fullscreen Preview"
                  >
                    <Maximize2 size={13} />
                  </button>
                </div>

                {/* Footer Controls */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingTop: '6px',
                    fontSize: '11px',
                    color: 'var(--text-secondary)',
                  }}
                >
                  <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    Content: <span style={{ fontWeight: 600, color: 'var(--text-main)', textTransform: 'capitalize' }}>{screen.currentContent === 'queue' ? 'Queue Display' : screen.currentContent || 'Queue'}</span>
                  </div>

                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button
                      className="btn btn-outline btn-sm"
                      onClick={() => handleCaptureSnapshot(screen.id)}
                      title="Request Snapshot"
                      style={{ padding: '3px 8px', fontSize: '11px' }}
                    >
                      Capture
                    </button>

                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => onSelectScreen(screen)}
                      style={{ padding: '3px 8px', fontSize: '11px' }}
                    >
                      <Sliders size={11} />
                      <span>Control</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Fullscreen Modal Preview */}
      {fullscreenFeed && (
        <div className="modal-overlay" onClick={() => setFullscreenFeed(null)}>
          <div
            className="modal-content"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '900px', width: '95%' }}
          >
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Tv size={18} color="var(--primary)" />
                <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--dark)' }}>
                  {fullscreenFeed.name} — Fullscreen Live Feed
                </h3>
              </div>
              <button
                className="btn-ghost"
                onClick={() => setFullscreenFeed(null)}
                style={{ padding: '4px' }}
              >
                <X size={18} />
              </button>
            </div>

            <div className="modal-body" style={{ padding: '16px', backgroundColor: '#0B0A11' }}>
              <div style={{ width: '100%', aspectRatio: '16 / 9', position: 'relative' }}>
                {fullscreenFeed.latestSnapshot ? (
                  <img
                    src={fullscreenFeed.latestSnapshot}
                    alt={fullscreenFeed.name}
                    style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                  />
                ) : fullscreenFeed.queueUrl ? (
                  <iframe
                    src={fullscreenFeed.queueUrl}
                    title={fullscreenFeed.name}
                    style={{ width: '100%', height: '100%', border: 'none' }}
                  />
                ) : (
                  <div style={{ color: '#FFFFFF', textAlign: 'center', paddingTop: '80px' }}>
                    No display signal active
                  </div>
                )}
              </div>
            </div>

            <div className="modal-footer">
              <div style={{ marginRight: 'auto', fontSize: '12px', color: 'var(--text-secondary)' }}>
                Queue URL: {fullscreenFeed.queueUrl || 'Not configured'}
              </div>
              <button
                className="btn btn-outline btn-sm"
                onClick={() => setFullscreenFeed(null)}
              >
                Close Fullscreen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
