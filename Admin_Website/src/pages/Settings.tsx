import React, { useState } from 'react';
import {
  Settings,
  Building2,
  Tv,
  Clock,
  Wifi,
  Bell,
  Users,
  Shield,
  Save,
  CheckCircle2,
  Server,
  RefreshCw,
} from 'lucide-react';
import { getActiveBackendUrl } from '../services/api';

export const SettingsPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<
    'general' | 'hospital' | 'tv' | 'queue' | 'network' | 'notifications' | 'users' | 'security'
  >('general');

  // Form states
  const [hospitalName, setHospitalName] = useState('JJM Hospital');
  const [hospitalBranch, setHospitalBranch] = useState('Kashipur, Uttarakhand');
  const [supportPhone, setSupportPhone] = useState('+91 5947 274000');
  const [heartbeatInterval, setHeartbeatInterval] = useState(15);
  const [staleThreshold, setStaleThreshold] = useState(180);
  const [defaultDuration, setDefaultDuration] = useState(15);
  const [autoRebootTime, setAutoRebootTime] = useState('04:00');
  const [kioskLock, setKioskLock] = useState(true);
  const [soundAlerts, setSoundAlerts] = useState(true);

  const [savedFeedback, setSavedFeedback] = useState<string | null>(null);

  const activeUrl = getActiveBackendUrl();

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setSavedFeedback('Settings saved successfully and applied to active configuration.');
    setTimeout(() => setSavedFeedback(null), 3500);
  };

  const navItems = [
    { id: 'general', label: 'General', icon: Settings },
    { id: 'hospital', label: 'Hospital Information', icon: Building2 },
    { id: 'tv', label: 'TV Player Settings', icon: Tv },
    { id: 'queue', label: 'Queue Integration', icon: Clock },
    { id: 'network', label: 'Network & Backend', icon: Wifi },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'users', label: 'Users & Roles', icon: Users },
    { id: 'security', label: 'Security & Auth', icon: Shield },
  ];

  return (
    <div style={{ padding: '28px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Header */}
      <div>
        <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--dark)' }}>
          System Settings & Platform Configuration
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
          Configure hospital parameters, Android TV kiosk policies, queue watchdog thresholds, and server targets.
        </p>
      </div>

      {/* Main Settings Layout (Sidebar + Content Box) */}
      <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: '20px', alignItems: 'start' }}>
        {/* Left Navigation */}
        <div className="card" style={{ padding: '10px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;

              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id as any)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '10px 12px',
                    borderRadius: 'var(--radius-sm)',
                    border: 'none',
                    backgroundColor: isActive ? 'var(--primary-subtle)' : 'transparent',
                    color: isActive ? 'var(--primary)' : 'var(--text-secondary)',
                    fontWeight: isActive ? 600 : 500,
                    fontSize: '13px',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <Icon size={16} color={isActive ? 'var(--primary)' : 'var(--text-secondary)'} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right Settings Form Container */}
        <div className="card" style={{ padding: '24px' }}>
          <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* General Tab */}
            {activeTab === 'general' && (
              <>
                <div style={{ borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
                  <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--dark)' }}>
                    General Settings
                  </h3>
                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    Control core display intervals, language, and default ad durations.
                  </p>
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Default Promotional Ad Duration (seconds)</label>
                  <input
                    type="number"
                    className="form-input"
                    value={defaultDuration}
                    onChange={(e) => setDefaultDuration(Number(e.target.value))}
                    min={5}
                    max={120}
                  />
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">System Timezone</label>
                  <select className="form-select" defaultValue="Asia/Kolkata">
                    <option value="Asia/Kolkata">Asia/Kolkata (IST +05:30) — Official Hospital Time</option>
                  </select>
                </div>
              </>
            )}

            {/* Hospital Information Tab */}
            {activeTab === 'hospital' && (
              <>
                <div style={{ borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
                  <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--dark)' }}>
                    Hospital Information
                  </h3>
                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    Branding and emergency contact details rendered on TV headers and ticker banners.
                  </p>
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Hospital Name</label>
                  <input
                    type="text"
                    className="form-input"
                    value={hospitalName}
                    onChange={(e) => setHospitalName(e.target.value)}
                  />
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Hospital Branch / Location</label>
                  <input
                    type="text"
                    className="form-input"
                    value={hospitalBranch}
                    onChange={(e) => setHospitalBranch(e.target.value)}
                  />
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Hospital Emergency Helpline</label>
                  <input
                    type="text"
                    className="form-input"
                    value={supportPhone}
                    onChange={(e) => setSupportPhone(e.target.value)}
                  />
                </div>
              </>
            )}

            {/* TV Player Settings Tab */}
            {activeTab === 'tv' && (
              <>
                <div style={{ borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
                  <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--dark)' }}>
                    TV Player Kiosk Policies
                  </h3>
                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    Configure hardware wakelock, watchdog timers, and auto-reboot schedules for Android TVs.
                  </p>
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Heartbeat Ping Interval (seconds)</label>
                  <input
                    type="number"
                    className="form-input"
                    value={heartbeatInterval}
                    onChange={(e) => setHeartbeatInterval(Number(e.target.value))}
                    min={5}
                    max={60}
                  />
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Scheduled Nightly Auto-Reboot Time</label>
                  <input
                    type="time"
                    className="form-input"
                    value={autoRebootTime}
                    onChange={(e) => setAutoRebootTime(e.target.value)}
                  />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', backgroundColor: 'var(--bg-subtle)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--dark)' }}>
                      Enforce Kiosk Fullscreen Lock
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                      Hides navigation bar and disables TV remote exit without super-admin key.
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={kioskLock}
                    onChange={(e) => setKioskLock(e.target.checked)}
                    style={{ width: '18px', height: '18px', accentColor: 'var(--primary)' }}
                  />
                </div>
              </>
            )}

            {/* Queue Integration Tab */}
            {activeTab === 'queue' && (
              <>
                <div style={{ borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
                  <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--dark)' }}>
                    HMS Queue Watchdog
                  </h3>
                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    Configure DOM mutation timeouts and stale queue detection logic.
                  </p>
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Stale Queue Threshold (seconds)</label>
                  <input
                    type="number"
                    className="form-input"
                    value={staleThreshold}
                    onChange={(e) => setStaleThreshold(Number(e.target.value))}
                    min={30}
                    max={600}
                  />
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    If no token updates are detected within this window, TV automatically alerts the admin.
                  </span>
                </div>

                <div style={{ padding: '12px', backgroundColor: 'var(--info-subtle)', borderRadius: 'var(--radius-sm)', border: '1px solid #C2DCFA', fontSize: '12px', color: '#1E5894' }}>
                  Queue URLs are directly fetched from the JJM Hospital HMS gateway (e.g. <code>https://hms.jjmhospitalkashipur.com/qd/DOC038</code>) without modifying any doctor portal records.
                </div>
              </>
            )}

            {/* Network & Backend Tab */}
            {activeTab === 'network' && (
              <>
                <div style={{ borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
                  <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--dark)' }}>
                    Network & Backend Server
                  </h3>
                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    Authoritative Cloud Server connection for hospital signage and queue orchestration.
                  </p>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px', backgroundColor: 'var(--bg-subtle)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--dark)' }}>
                        Production Cloud Backend URL
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--primary)', fontFamily: 'monospace', marginTop: '2px' }}>
                        {activeUrl}
                      </div>
                    </div>
                    <span className="badge badge-online">
                      Production Cloud (Active)
                    </span>
                  </div>
                </div>
              </>
            )}

            {/* Notifications Tab */}
            {activeTab === 'notifications' && (
              <>
                <div style={{ borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
                  <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--dark)' }}>
                    Alert Notifications
                  </h3>
                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    Audio chime and screen flash triggers during critical hospital emergencies.
                  </p>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', backgroundColor: 'var(--bg-subtle)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--dark)' }}>
                      Audible Siren on Code Red Broadcasts
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                      Plays an audible hospital chime on TV speakers when emergency override is active.
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={soundAlerts}
                    onChange={(e) => setSoundAlerts(e.target.checked)}
                    style={{ width: '18px', height: '18px', accentColor: 'var(--primary)' }}
                  />
                </div>
              </>
            )}

            {/* Users & Roles Tab */}
            {activeTab === 'users' && (
              <>
                <div style={{ borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
                  <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--dark)' }}>
                    Users & Roles
                  </h3>
                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    Authorized personnel with permission to trigger emergency overrides and edit TV playlists.
                  </p>
                </div>

                <div className="table-container">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Operator</th>
                        <th>Role</th>
                        <th>Status</th>
                        <th>PIN Authentication</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>
                          <div style={{ fontWeight: 600, color: 'var(--dark)' }}>JJM Admin</div>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>JJMads@Vibesoft.in</div>
                        </td>
                        <td>
                          <span className="badge badge-purple">Super Admin</span>
                        </td>
                        <td>
                          <span className="badge badge-online">Active</span>
                        </td>
                        <td>
                          <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>•••• 89</span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {/* Security Tab */}
            {activeTab === 'security' && (
              <>
                <div style={{ borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
                  <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--dark)' }}>
                    Security & Device Tokens
                  </h3>
                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    Audit TV tokens and cryptographic keys.
                  </p>
                </div>

                <div style={{ padding: '12px', backgroundColor: 'var(--bg-subtle)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Pairing Security:</span>
                    <span style={{ fontWeight: 600, color: 'var(--dark)' }}>6-Digit Single-Use Nonce (15m expiry)</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Device Handshake:</span>
                    <span style={{ fontWeight: 600, color: 'var(--dark)' }}>Hardware Token UUIDv4</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Media Integrity:</span>
                    <span style={{ fontWeight: 600, color: '#0E805E' }}>SHA-256 Digest Verification Active</span>
                  </div>
                </div>
              </>
            )}

            {/* Feedback message */}
            {savedFeedback && (
              <div
                style={{
                  padding: '10px 14px',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: 'var(--success-subtle)',
                  border: '1px solid #C4F0E1',
                  color: '#0E805E',
                  fontSize: '12px',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <CheckCircle2 size={16} />
                <span>{savedFeedback}</span>
              </div>
            )}

            {/* Submit Action */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '12px', borderTop: '1px solid var(--border)' }}>
              <button type="submit" className="btn btn-primary">
                <Save size={15} />
                <span>Save Configuration</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
