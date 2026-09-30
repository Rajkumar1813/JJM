import React, { useState } from 'react';
import { X, Tv, CheckCircle2, AlertCircle } from 'lucide-react';
import { Department } from '../types';
import { api } from '../services/api';

interface PairScreenModalProps {
  isOpen: boolean;
  onClose: () => void;
  departments: Department[];
  onScreenPaired: () => void;
}

export const PairScreenModal: React.FC<PairScreenModalProps> = ({
  isOpen,
  onClose,
  departments,
  onScreenPaired,
}) => {
  if (!isOpen) return null;

  const [pairingCode, setPairingCode] = useState('');
  const [screenName, setScreenName] = useState('');
  const [departmentId, setDepartmentId] = useState(departments[0]?.id || '');
  const [location, setLocation] = useState('');
  const [queueUrl, setQueueUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (pairingCode.trim().length !== 6) {
        throw new Error('Pairing code must be exactly 6 digits');
      }

      const res = await api.post('/screens/pair-claim', {
        pairingCode: pairingCode.trim(),
        name: screenName.trim(),
        departmentId: departmentId || (departments[0]?.id || 'DEP-OPD'),
        location: location.trim() || 'Hospital OPD Clinic',
        queueUrl: queueUrl.trim(),
      });

      if (res.data.success) {
        setSuccessMessage(`TV screen "${res.data.screen.name}" successfully paired!`);
        setTimeout(() => {
          onScreenPaired();
          onClose();
          setSuccessMessage(null);
          setPairingCode('');
        }, 1500);
      }
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Failed to pair TV');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '500px' }}
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
              <Tv size={18} />
            </div>
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--dark)' }}>
                Pair Android TV Display
              </h3>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                Enter the 6-digit code shown on the physical TV screen
              </p>
            </div>
          </div>

          <button className="btn-ghost" onClick={onClose} style={{ padding: '4px' }}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {/* 6-Digit Pairing Code */}
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">6-Digit TV Pairing Code</label>
              <input
                type="text"
                className="form-input"
                style={{
                  fontSize: '22px',
                  letterSpacing: '0.25em',
                  fontWeight: 700,
                  textAlign: 'center',
                  fontFamily: 'monospace',
                  height: '48px',
                  color: 'var(--primary)',
                  backgroundColor: 'var(--primary-subtle)',
                  borderColor: '#D8CBE0',
                }}
                maxLength={6}
                value={pairingCode}
                onChange={(e) => setPairingCode(e.target.value.replace(/\D/g, ''))}
                placeholder="••••••"
                required
                autoFocus
              />
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginTop: '4px', textAlign: 'center' }}>
                Look at the TV screen while the JJM TV Player app is running.
              </span>
            </div>

            {/* Screen Name */}
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Display Name</label>
              <input
                type="text"
                className="form-input"
                value={screenName}
                onChange={(e) => setScreenName(e.target.value)}
                placeholder="e.g. OPD Room 5 — Doctor 038 TV"
                required
              />
            </div>

            {/* Department */}
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Hospital Department</label>
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

            {/* Location */}
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Location / Consultation Room</label>
              <input
                type="text"
                className="form-input"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g. 1st Floor, OPD Ward Room 5"
                required
              />
            </div>

            {/* Doctor Queue URL */}
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Doctor OPD Queue URL</label>
              <input
                type="url"
                className="form-input"
                value={queueUrl}
                onChange={(e) => setQueueUrl(e.target.value)}
                placeholder="https://hms.jjmhospitalkashipur.com/qd/DOC038"
                required
              />
            </div>

            {/* Feedback Notifications */}
            {successMessage && (
              <div
                style={{
                  padding: '12px',
                  backgroundColor: 'var(--success-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid #C4F0E1',
                  color: '#0E805E',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '12px',
                  fontWeight: 600,
                }}
              >
                <CheckCircle2 size={16} />
                <span>{successMessage}</span>
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
                  gap: '8px',
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
              disabled={loading || pairingCode.length !== 6}
            >
              <Tv size={14} />
              <span>{loading ? 'Pairing TV...' : 'Pair TV Screen'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
