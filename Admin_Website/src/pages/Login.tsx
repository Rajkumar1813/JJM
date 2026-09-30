import React, { useState, useRef } from 'react';
import { ShieldCheck, Lock, Mail, KeyRound, ArrowRight, Activity, AlertCircle } from 'lucide-react';
import { api, setAdminToken } from '../services/api';

interface LoginProps {
  onLoginSuccess: () => void;
}

export const Login: React.FC<LoginProps> = ({ onLoginSuccess }) => {
  const [step, setStep] = useState<'credentials' | 'pin'>('credentials');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pin, setPin] = useState(['', '', '', '', '', '']);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const pinRefs = [
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
  ];

  const handleCredentialsSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    // Move to PIN step — final auth done server-side in verifyPin
    const trimmedEmail = email.trim();
    const trimmedPassword = password.trim();
    if (!trimmedEmail || !trimmedPassword) {
      setError('Please enter your email and password.');
      return;
    }
    setStep('pin');
    setTimeout(() => { pinRefs[0].current?.focus(); }, 100);
  };

  const handlePinChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    const newPin = [...pin];
    newPin[index] = value.slice(-1);
    setPin(newPin);
    if (value && index < 5) {
      pinRefs[index + 1].current?.focus();
    }
    const fullPin = newPin.join('');
    if (fullPin.length === 6) {
      verifyPin(fullPin);
    }
  };

  const handlePinKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !pin[index] && index > 0) {
      pinRefs[index - 1].current?.focus();
    }
  };

  const verifyPin = async (fullPin: string) => {
    setError(null);
    setLoading(true);
    try {
      // Server-side authentication — credentials are NOT stored in client bundle
      const res = await api.post('/auth/login', {
        email: email.trim(),
        password: password.trim(),
        pin: fullPin,
      });
      if (res.data.success && res.data.token) {
        setAdminToken(res.data.token);
        localStorage.setItem('jjm_auth_user', res.data.email || email.trim());
        onLoginSuccess();
      } else {
        setError('Authentication failed. Please try again.');
        setPin(['', '', '', '', '', '']);
        pinRefs[0].current?.focus();
      }
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Invalid credentials or PIN. Access denied.';
      setError(msg);
      setPin(['', '', '', '', '', '']);
      pinRefs[0].current?.focus();
    } finally {
      setLoading(false);
    }
  };

  const handleManualPinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const fullPin = pin.join('');
    if (fullPin.length === 6) verifyPin(fullPin);
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: 'var(--bg-main)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
      }}
    >
      <div
        className="card"
        style={{
          width: '100%',
          maxWidth: '440px',
          padding: '36px 32px',
          boxShadow: 'var(--shadow-modal)',
        }}
      >
        {/* Brand Header */}
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div
            style={{
              width: '52px',
              height: '52px',
              borderRadius: '12px',
              backgroundColor: 'var(--primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 14px',
              color: '#FFFFFF',
            }}
          >
            <Activity size={28} strokeWidth={2.4} />
          </div>
          <h1 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--dark)' }}>
            JJM Hospital Kashipur
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--primary)', fontWeight: 600, marginTop: '2px' }}>
            Central Signage & Queue Control Plane
          </p>
        </div>

        {error && (
          <div
            style={{
              padding: '12px',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: 'var(--danger-subtle)',
              border: '1px solid #F8C8CB',
              color: 'var(--danger)',
              fontSize: '12px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '20px',
            }}
          >
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        {/* Step 1: Administrator Credentials */}
        {step === 'credentials' ? (
          <form onSubmit={handleCredentialsSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Administrator Email</label>
              <div style={{ position: 'relative' }}>
                <input
                  type="email"
                  className="form-input"
                  style={{ paddingLeft: '36px' }}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@hospital.com"
                  required
                  autoFocus
                  autoComplete="email"
                />
                <Mail size={16} color="var(--text-muted)" style={{ position: 'absolute', left: '12px', top: '12px' }} />
              </div>
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Password</label>
              <div style={{ position: 'relative' }}>
                <input
                  type="password"
                  className="form-input"
                  style={{ paddingLeft: '36px' }}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                />
                <Lock size={16} color="var(--text-muted)" style={{ position: 'absolute', left: '12px', top: '12px' }} />
              </div>
            </div>

            <button
              type="submit"
              className="btn btn-primary btn-lg"
              disabled={loading}
              style={{ width: '100%', marginTop: '8px' }}
            >
              <span>Continue to PIN Verification</span>
              <ArrowRight size={16} />
            </button>
          </form>
        ) : (
          /* Step 2: 6-Digit Security PIN */
          <form onSubmit={handleManualPinSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            <div style={{ textAlign: 'center' }}>
              <div
                style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '50%',
                  backgroundColor: 'var(--primary-subtle)',
                  color: 'var(--primary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 8px',
                }}
              >
                <KeyRound size={20} />
              </div>
              <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--dark)' }}>
                Security PIN Verification
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                Enter the authorized 6-digit administrative security PIN
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'center', gap: '8px' }}>
              {pin.map((digit, index) => (
                <input
                  key={index}
                  ref={pinRefs[index]}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handlePinChange(index, e.target.value)}
                  onKeyDown={(e) => handlePinKeyDown(index, e)}
                  style={{
                    width: '44px',
                    height: '52px',
                    fontSize: '22px',
                    fontWeight: 700,
                    textAlign: 'center',
                    backgroundColor: '#FFFFFF',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)',
                    outline: 'none',
                    color: 'var(--primary)',
                  }}
                  autoFocus={index === 0}
                />
              ))}
            </div>

            <button
              type="submit"
              className="btn btn-primary btn-lg"
              disabled={loading || pin.join('').length !== 6}
              style={{ width: '100%' }}
            >
              <span>{loading ? 'Verifying...' : 'Verify & Launch Dashboard'}</span>
              <ShieldCheck size={16} />
            </button>

            <div style={{ textAlign: 'center' }}>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => { setStep('credentials'); setPin(['', '', '', '', '', '']); setError(null); }}
                style={{ fontSize: '12px', color: 'var(--text-secondary)' }}
              >
                ← Back to credentials
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
