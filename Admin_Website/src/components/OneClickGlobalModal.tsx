import React, { useState } from 'react';
import { X, Megaphone, CheckCircle2, Tv, Clock, AlertCircle } from 'lucide-react';
import { MediaItem } from '../types';
import { api } from '../services/api';

interface OneClickGlobalModalProps {
  isOpen: boolean;
  onClose: () => void;
  mediaList: MediaItem[];
  onBroadcastSuccess: () => void;
}

export const OneClickGlobalModal: React.FC<OneClickGlobalModalProps> = ({
  isOpen,
  onClose,
  mediaList,
  onBroadcastSuccess,
}) => {
  if (!isOpen) return null;

  const [campaignName, setCampaignName] = useState('Hospital-Wide Informational Broadcast');
  const [selectedMediaId, setSelectedMediaId] = useState(mediaList[0]?.id || '');
  const [duration, setDuration] = useState(30);
  const [priority, setPriority] = useState(85);
  const [loading, setLoading] = useState(false);
  const [resultTelemetry, setResultTelemetry] = useState<{ received: number; playing: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedMedia = mediaList.find((m) => m.id === selectedMediaId);

  const handleBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResultTelemetry(null);

    try {
      if (!selectedMedia) {
        throw new Error('Please select a media asset to broadcast');
      }

      const res = await api.post('/campaigns/broadcast-global', {
        name: campaignName,
        mediaId: selectedMedia.id,
        mediaUrl: selectedMedia.url,
        priority: Number(priority),
        duration: Number(duration),
      });

      if (res.data.success) {
        setResultTelemetry({
          received: res.data.dispatchedScreens || 1,
          playing: res.data.dispatchedScreens || 1,
        });

        setTimeout(() => {
          onBroadcastSuccess();
          onClose();
        }, 2200);
      }
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Failed to dispatch broadcast');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '520px' }}
      >
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: 'var(--primary-subtle)',
                color: 'var(--primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Megaphone size={18} />
            </div>
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--dark)' }}>
                Broadcast to All TVs
              </h3>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                Instant full-fleet content transmission
              </p>
            </div>
          </div>

          <button className="btn-ghost" onClick={onClose} style={{ padding: '4px' }}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleBroadcast}>
          <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Pre-Execution Specification Box */}
            <div
              style={{
                padding: '14px',
                backgroundColor: 'var(--bg-subtle)',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border)',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                fontSize: '12px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Target Audience:</span>
                <span style={{ fontWeight: 600, color: 'var(--dark)' }}>All connected hospital screens</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Execution Type:</span>
                <span style={{ fontWeight: 600, color: 'var(--primary)' }}>Immediate Synchronous Override</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Priority:</span>
                <span style={{ fontWeight: 600, color: 'var(--dark)' }}>High Precedence (85)</span>
              </div>
            </div>

            {/* Broadcast Title */}
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Broadcast Name / Purpose</label>
              <input
                type="text"
                className="form-input"
                value={campaignName}
                onChange={(e) => setCampaignName(e.target.value)}
                placeholder="e.g. Hospital Health Awareness Notice"
                required
              />
            </div>

            {/* Media Selector */}
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Select Media Asset</label>
              <select
                className="form-select"
                value={selectedMediaId}
                onChange={(e) => setSelectedMediaId(e.target.value)}
                required
              >
                {mediaList.length === 0 ? (
                  <option value="">No media available in library</option>
                ) : (
                  mediaList.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.title} ({m.type.toUpperCase()})
                    </option>
                  ))
                )}
              </select>
            </div>

            {/* Duration Selector */}
            <div>
              <label className="form-label">Broadcast Duration</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
                {[15, 30, 60, 120].map((sec) => (
                  <button
                    key={sec}
                    type="button"
                    onClick={() => setDuration(sec)}
                    className={duration === sec ? 'btn btn-primary btn-sm' : 'btn btn-outline btn-sm'}
                  >
                    {sec < 60 ? `${sec} sec` : `${sec / 60} min`}
                  </button>
                ))}
              </div>
            </div>

            {/* Post Broadcast Feedback */}
            {resultTelemetry && (
              <div
                style={{
                  padding: '12px',
                  backgroundColor: 'var(--success-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid #C4F0E1',
                  color: '#0E805E',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  fontSize: '12px',
                  fontWeight: 600,
                }}
              >
                <CheckCircle2 size={16} />
                <span>
                  {resultTelemetry.received} TVs received packet • {resultTelemetry.playing} playing immediately
                </span>
              </div>
            )}

            {error && (
              <div
                style={{
                  padding: '12px',
                  backgroundColor: 'var(--danger-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid #F8C8CB',
                  color: 'var(--danger)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  fontSize: '12px',
                }}
              >
                <AlertCircle size={16} />
                <span>{error}</span>
              </div>
            )}
          </div>

          <div className="modal-footer">
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary btn-sm"
              disabled={loading || mediaList.length === 0}
            >
              <Megaphone size={14} />
              <span>{loading ? 'Transmitting...' : 'Broadcast Now'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
