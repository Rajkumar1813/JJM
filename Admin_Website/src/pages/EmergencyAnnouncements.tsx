import React, { useState, useEffect } from 'react';
import {
  AlertTriangle,
  Send,
  XCircle,
  Clock,
  ShieldAlert,
  Radio,
  Tv,
  CheckCircle2,
  Volume2,
  Languages,
} from 'lucide-react';
import { EmergencyAnnouncement, Screen } from '../types';
import { api } from '../services/api';

interface EmergencyAnnouncementsProps {
  screens: Screen[];
  onRefresh: () => void;
}

export const EmergencyAnnouncements: React.FC<EmergencyAnnouncementsProps> = ({
  screens,
  onRefresh,
}) => {
  const [activeAnnouncement, setActiveAnnouncement] = useState<EmergencyAnnouncement | null>(null);
  const [alertType, setAlertType] = useState<'critical' | 'warning' | 'info'>('critical');
  const [duration, setDuration] = useState<number>(30); // in seconds, 0 = manual
  const [language, setLanguage] = useState<'en' | 'hi' | 'both'>('both');
  const [targetType, setTargetType] = useState<'ALL' | 'DEPARTMENT' | 'SCREEN'>('ALL');
  const [selectedTargetId, setSelectedTargetId] = useState<string>('all');
  const [priority, setPriority] = useState<'critical' | 'high' | 'normal'>('critical');

  const [heading, setHeading] = useState('CODE RED: MEDICAL EMERGENCY / आपातकालीन सूचना');
  const [message, setMessage] = useState(
    'Trauma resuscitation team report immediately to Casualty Ward 1. Non-critical OPD consultations are temporarily paused.'
  );

  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [broadcasting, setBroadcasting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const fetchActive = async () => {
    try {
      const res = await api.get('/emergency');
      if (res.data.success && res.data.announcement?.isActive) {
        setActiveAnnouncement(res.data.announcement);
      } else {
        setActiveAnnouncement(null);
      }
    } catch (_) {}
  };

  useEffect(() => {
    fetchActive();
  }, []);

  // Countdown timer for active announcement
  useEffect(() => {
    if (!activeAnnouncement) {
      setRemainingSeconds(null);
      return;
    }

    if (activeAnnouncement.expiresAt) {
      const interval = setInterval(() => {
        const diffMs = (activeAnnouncement.expiresAt || 0) - Date.now();
        const diffSec = Math.max(0, Math.ceil(diffMs / 1000));
        setRemainingSeconds(diffSec);

        if (diffSec <= 0) {
          setActiveAnnouncement(null);
          clearInterval(interval);
          onRefresh();
        }
      }, 1000);

      return () => clearInterval(interval);
    }
  }, [activeAnnouncement, onRefresh]);

  const handleBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    setBroadcasting(true);
    setFeedback(null);
    try {
      const res = await api.post('/emergency/broadcast', {
        title: heading,
        message,
        severity: alertType,
        displayMode: 'takeover',
        highlightScreen: true,
        durationSeconds: duration > 0 ? duration : null,
        targetType,
        targetIds: [selectedTargetId],
      });

      if (res.data.success) {
        setActiveAnnouncement(res.data.announcement);
        setFeedback('Emergency alert broadcasted instantly across targeted displays.');
        onRefresh();
      }
    } catch (err: any) {
      setFeedback(`Broadcast error: ${err.message}`);
    } finally {
      setBroadcasting(false);
    }
  };

  const handleDismiss = async () => {
    if (!confirm('Are you sure you want to dismiss the active emergency broadcast? All screens will restore normal OPD queue playback.')) {
      return;
    }
    setCancelling(true);
    try {
      await api.post('/emergency/dismiss');
      setActiveAnnouncement(null);
      setFeedback('Active emergency alert cancelled. Normal playback restored.');
      onRefresh();
    } catch (err: any) {
      alert(`Error dismissing: ${err.message}`);
    } finally {
      setCancelling(false);
    }
  };

  // Color mapping based on selected alert type
  const alertTheme = {
    critical: {
      color: '#E85B61',
      bg: '#FDEDEE',
      border: '#F8C8CB',
      label: 'Critical Code Alert',
    },
    warning: {
      color: '#F2A93B',
      bg: '#FEF7EC',
      border: '#FCDFA7',
      label: 'Warning Advisory',
    },
    info: {
      color: '#4D8DCE',
      bg: '#F0F6FD',
      border: '#C2DCFA',
      label: 'Information Notice',
    },
  }[alertType];

  return (
    <div style={{ padding: '28px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Top Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--dark)' }}>
            Emergency Broadcast Center
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Instant audio-visual alert takeover across all hospital screens and OPD consultation displays.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: screens.length > 0 ? 'var(--success-subtle)' : 'var(--warning-subtle)',
              border: `1px solid ${screens.length > 0 ? '#C4F0E1' : '#FCDFA7'}`,
              fontSize: '12px',
              fontWeight: 600,
              color: screens.length > 0 ? '#0E805E' : '#A36B15',
            }}
          >
            <span
              style={{
                width: '7px',
                height: '7px',
                borderRadius: '50%',
                backgroundColor: screens.length > 0 ? 'var(--success)' : 'var(--warning)',
              }}
            />
            <span>{screens.length} Connected Screens Ready</span>
          </div>

          {activeAnnouncement && (
            <button
              onClick={handleDismiss}
              className="btn btn-danger btn-sm"
              disabled={cancelling}
            >
              <XCircle size={15} />
              <span>Dismiss Active Alert ({remainingSeconds ? `${remainingSeconds}s` : 'Active'})</span>
            </button>
          )}
        </div>
      </div>

      {/* Main 2-Column Interface: Left Config, Right Live TV Preview */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(340px, 1.1fr) minmax(320px, 1fr)', gap: '24px' }}>
        {/* Left: Emergency Configuration Form */}
        <div className="card">
          <div className="card-header">
            <div>
              <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--dark)' }}>
                Emergency Configuration
              </h3>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                Define urgency, language, duration, and target hospital fleet.
              </p>
            </div>
            <ShieldAlert size={18} color={alertTheme.color} />
          </div>

          <form onSubmit={handleBroadcast} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* 1. Alert Type */}
            <div>
              <label className="form-label">Alert Severity Level</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                {(['critical', 'warning', 'info'] as const).map((type) => {
                  const isSel = alertType === type;
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => {
                        setAlertType(type);
                        if (type === 'critical') {
                          setHeading('CODE RED: MEDICAL EMERGENCY / आपातकालीन सूचना');
                          setPriority('critical');
                        } else if (type === 'warning') {
                          setHeading('HOSPITAL ADVISORY / महत्वपूर्ण सूचना');
                          setPriority('high');
                        } else {
                          setHeading('DOCTOR SCHEDULE NOTICE / सूचना');
                          setPriority('normal');
                        }
                      }}
                      className={isSel ? 'btn btn-sm' : 'btn btn-outline btn-sm'}
                      style={{
                        backgroundColor: isSel
                          ? type === 'critical'
                            ? 'var(--danger)'
                            : type === 'warning'
                            ? 'var(--warning)'
                            : 'var(--info)'
                          : '#FFFFFF',
                        color: isSel ? '#FFFFFF' : 'var(--text-main)',
                        borderColor: isSel ? 'transparent' : 'var(--border)',
                        textTransform: 'capitalize',
                      }}
                    >
                      {type}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 2. Target Displays */}
            <div>
              <label className="form-label">Target Scope</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                {(['ALL', 'DEPARTMENT', 'SCREEN'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => {
                      setTargetType(t);
                      setSelectedTargetId(t === 'ALL' ? 'all' : screens[0]?.id || 'all');
                    }}
                    className={targetType === t ? 'btn btn-primary btn-sm' : 'btn btn-outline btn-sm'}
                  >
                    {t === 'ALL' ? 'All TVs' : t === 'DEPARTMENT' ? 'Departments' : 'Selected TV'}
                  </button>
                ))}
              </div>
            </div>

            {targetType === 'SCREEN' && (
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Select Screen</label>
                <select
                  className="form-select"
                  value={selectedTargetId}
                  onChange={(e) => setSelectedTargetId(e.target.value)}
                  required
                >
                  {screens.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.location})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* 3. Duration */}
            <div>
              <label className="form-label">Display Duration</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '6px' }}>
                {[
                  { label: '10 sec', sec: 10 },
                  { label: '30 sec', sec: 30 },
                  { label: '1 min', sec: 60 },
                  { label: '5 min', sec: 300 },
                  { label: 'Manual', sec: 0 },
                ].map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => setDuration(item.sec)}
                    className={duration === item.sec ? 'btn btn-secondary btn-sm' : 'btn btn-outline btn-sm'}
                    style={{ fontSize: '11px', padding: '6px 4px' }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 4. Language Selection */}
            <div>
              <label className="form-label">Language Mode</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                {[
                  { id: 'both', label: 'English + Hindi' },
                  { id: 'en', label: 'English Only' },
                  { id: 'hi', label: 'Hindi Only' },
                ].map((lang) => (
                  <button
                    key={lang.id}
                    type="button"
                    onClick={() => setLanguage(lang.id as any)}
                    className={language === lang.id ? 'btn btn-primary btn-sm' : 'btn btn-outline btn-sm'}
                    style={{ fontSize: '12px' }}
                  >
                    {lang.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 5. Heading */}
            <div>
              <label className="form-label">Alert Heading</label>
              <input
                type="text"
                className="form-input"
                value={heading}
                onChange={(e) => setHeading(e.target.value)}
                required
              />
            </div>

            {/* 6. Message Body */}
            <div>
              <label className="form-label">Alert Message Details</label>
              <textarea
                className="form-textarea"
                rows={3}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Enter clear instructions for hospital patients, doctors, and staff..."
                required
              />
            </div>

            {/* Feedback Message */}
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

            {/* Primary Action Button */}
            <button
              type="submit"
              className="btn btn-danger btn-lg"
              disabled={broadcasting}
              style={{
                width: '100%',
                marginTop: '4px',
                backgroundColor: alertType === 'critical' ? 'var(--danger)' : alertTheme.color,
                borderColor: alertType === 'critical' ? 'var(--danger)' : alertTheme.color,
              }}
            >
              <Send size={16} />
              <span>{broadcasting ? 'Transmitting Alert...' : 'BROADCAST EMERGENCY'}</span>
            </button>
          </form>
        </div>

        {/* Right: Live TV Preview */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="card-header">
            <div>
              <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--dark)' }}>
                Live TV Preview
              </h3>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                Simulated real-time visual appearance on 55" Hospital OPD displays.
              </p>
            </div>
            <Tv size={18} color="var(--text-secondary)" />
          </div>

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* The Realistic TV Bezel Frame */}
            <div className="tv-preview-frame">
              {/* TV Top Bar */}
              <div
                style={{
                  backgroundColor: alertTheme.color,
                  color: '#FFFFFF',
                  padding: '8px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontWeight: 700,
                  fontSize: '12px',
                  letterSpacing: '0.04em',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <AlertTriangle size={15} />
                  <span>JJM HOSPITAL • PRIORITY OVERRIDE</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '10px' }}>
                  <Volume2 size={13} />
                  <span>ALARM ACTIVE</span>
                </div>
              </div>

              {/* TV Screen Content Area */}
              <div
                style={{
                  flex: 1,
                  backgroundColor: '#15131E',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '24px',
                  textAlign: 'center',
                  gap: '12px',
                }}
              >
                <div
                  style={{
                    width: '44px',
                    height: '44px',
                    borderRadius: '50%',
                    backgroundColor: alertTheme.bg,
                    border: `2px solid ${alertTheme.color}`,
                    color: alertTheme.color,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <AlertTriangle size={24} />
                </div>

                <div
                  style={{
                    color: '#FFFFFF',
                    fontSize: '16px',
                    fontWeight: 800,
                    letterSpacing: '-0.01em',
                    lineHeight: 1.3,
                    maxWidth: '85%',
                  }}
                >
                  {heading || 'EMERGENCY NOTIFICATION'}
                </div>

                <div
                  style={{
                    color: '#E0DBE8',
                    fontSize: '12px',
                    lineHeight: 1.5,
                    maxWidth: '88%',
                  }}
                >
                  {message || 'Emergency broadcast message details will be displayed here in full clarity for patients and doctors.'}
                </div>
              </div>

              {/* TV Bottom Ticker Bar */}
              <div
                style={{
                  backgroundColor: '#201D2C',
                  borderTop: '1px solid rgba(255, 255, 255, 0.1)',
                  padding: '6px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontSize: '10px',
                  color: '#A8A2B5',
                }}
              >
                <span>Target: {targetType === 'ALL' ? 'All Hospital Displays' : selectedTargetId}</span>
                <span>Auto-Revert: {duration === 0 ? 'Manual Clear' : `${duration}s`}</span>
              </div>
            </div>

            {/* Diagnostic Information */}
            <div
              style={{
                backgroundColor: 'var(--bg-subtle)',
                padding: '14px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border)',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                fontSize: '12px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Delivery Protocol:</span>
                <span style={{ fontWeight: 600, color: 'var(--dark)' }}>Socket.IO Fast-Path Direct Emits</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Queue Protection:</span>
                <span style={{ fontWeight: 600, color: '#0E805E' }}>State Preserved (Zero Lost Tokens)</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Auto-Recovery:</span>
                <span style={{ fontWeight: 600, color: 'var(--dark)' }}>Instant Return to OPD Doctor Queue</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
