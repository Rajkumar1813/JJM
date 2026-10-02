import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { getBackendBaseUrl } from '../services/api';
import { AlertTriangle, Activity, Wifi, WifiOff } from 'lucide-react';

interface PublicDisplayViewProps {
  screenId: string;
}

const bareAxios = axios.create({
  baseURL: getBackendBaseUrl() + '/api',
});

export const PublicDisplayView: React.FC<PublicDisplayViewProps> = ({ screenId }) => {
  const [config, setConfig] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeEmergency, setActiveEmergency] = useState<any>(null);
  const [currentMode, setCurrentMode] = useState<'queue' | 'ad'>('queue');
  const [currentAdIndex, setCurrentAdIndex] = useState(0);
  const [isConnected, setIsConnected] = useState(false);

  const cycleTimerRef = useRef<any>(null);

  // Fetch initial configuration
  const fetchConfig = async () => {
    try {
      const params = new URLSearchParams(window.location.search);
      const key = params.get('key');
      const res = await bareAxios.get(`/public-display/${screenId}/config?key=${key || ''}`);
      if (res.data.success && res.data.config) {
        setConfig(res.data.config);
        setActiveEmergency(res.data.activeEmergency || null);
        setError(null);
        setIsConnected(true);
      } else {
        setError(res.data.message || 'Screen configuration not found');
      }
    } catch (err: any) {
      if (err.response?.status === 401) {
         setError('Access Denied: Invalid display key.');
      } else {
         setError(err.response?.data?.message || 'Failed to connect to hospital display server');
      }
      setIsConnected(false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConfig();
    const timer = setInterval(fetchConfig, 10000);
    return () => clearInterval(timer);
  }, [screenId]);

  // Playlist / Rotation Engine
  useEffect(() => {
    if (!config || activeEmergency) return;

    const playlistItems: any[] = Array.isArray(config.playlist)
      ? config.playlist
      : config.playlist?.items || [];
    const ads = playlistItems.filter((it: any) => it.type === 'image' || it.type === 'video');
    const hasQueue = playlistItems.some((it: any) => it.type === 'queue');

    // 1. If no ads exist, always stay in queue mode
    if (ads.length === 0) {
      setCurrentMode('queue');
      return;
    }

    // 2. If NO queue exists in playlist (continuous fullscreen ad mode)
    if (!hasQueue) {
      setCurrentMode('ad');
      if (ads.length > 1) {
        const currentAd = ads[currentAdIndex % ads.length];
        const adDuration = (currentAd?.duration || currentAd?.durationSeconds || 15) * 1000;
        cycleTimerRef.current = setTimeout(() => {
          setCurrentAdIndex((prev) => (prev + 1) % ads.length);
        }, adDuration);
      }
      return () => {
        if (cycleTimerRef.current) clearTimeout(cycleTimerRef.current);
      };
    }

    // 3. Alternating Mode (Doctor OPD Queue <-> Advertisements)
    if (currentMode === 'queue') {
      const queueItem = playlistItems.find((it: any) => it.type === 'queue');
      const queueDuration = (queueItem?.duration || config.settings?.queueDurationSeconds || 20) * 1000;
      cycleTimerRef.current = setTimeout(() => {
        setCurrentMode('ad');
      }, queueDuration);
    } else {
      const currentAd = ads[currentAdIndex % ads.length];
      const adDuration = (currentAd?.duration || currentAd?.durationSeconds || 15) * 1000;
      cycleTimerRef.current = setTimeout(() => {
        setCurrentAdIndex((prev) => (prev + 1) % ads.length);
        setCurrentMode('queue');
      }, adDuration);
    }

    return () => {
      if (cycleTimerRef.current) clearTimeout(cycleTimerRef.current);
    };
  }, [config, currentMode, currentAdIndex, activeEmergency]);

  if (loading) {
    return (
      <div
        style={{
          width: '100vw',
          height: '100vh',
          backgroundColor: '#0D0B18',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#FFFFFF',
          fontFamily: 'Inter, sans-serif',
        }}
      >
        <Activity size={48} color="#6B3A8A" className="spin" style={{ marginBottom: 16 }} />
        <h2 style={{ fontSize: '20px', fontWeight: 600 }}>Connecting to JJM Hospital Display Server...</h2>
        <p style={{ fontSize: '13px', color: '#777486', marginTop: 6 }}>Screen ID: {screenId}</p>
      </div>
    );
  }

  if (error || !config) {
    return (
      <div
        style={{
          width: '100vw',
          height: '100vh',
          backgroundColor: '#0D0B18',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#FFFFFF',
          fontFamily: 'Inter, sans-serif',
          padding: '24px',
          textAlign: 'center',
        }}
      >
        <AlertTriangle size={54} color="#E85B61" style={{ marginBottom: 16 }} />
        <h2 style={{ fontSize: '22px', fontWeight: 700 }}>Hospital Display Offline</h2>
        <p style={{ fontSize: '14px', color: '#A09CAE', marginTop: 8, maxWidth: '420px' }}>
          {error || 'Screen configuration could not be resolved. Please verify pairing status in the Admin Console.'}
        </p>
        <button
          onClick={fetchConfig}
          style={{
            marginTop: 20,
            padding: '10px 24px',
            backgroundColor: '#6B3A8A',
            color: '#FFFFFF',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontWeight: 600,
          }}
        >
          Retry Connection
        </button>
      </div>
    );
  }

  const playlistItems: any[] = Array.isArray(config.playlist)
    ? config.playlist
    : config.playlist?.items || [];
  const ads = playlistItems.filter((it: any) => it.type === 'image' || it.type === 'video');
  const currentAd = ads.length > 0 ? ads[currentAdIndex % ads.length] : null;

  const rawMediaUrl = currentAd?.mediaUrl || currentAd?.url || '';
  const resolvedMediaUrl = rawMediaUrl.startsWith('/')
    ? `${getBackendBaseUrl()}${rawMediaUrl}`
    : rawMediaUrl;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        backgroundColor: '#000000',
        overflow: 'hidden',
        fontFamily: 'Inter, sans-serif',
      }}
    >
      {/* LAYER 1: Doctor OPD Live Queue */}
      <iframe
        src={config.queueUrl}
        title="JJM Hospital Queue"
        style={{
          width: '100%',
          height: '100%',
          border: 'none',
          display: currentMode === 'queue' && !activeEmergency ? 'block' : 'none',
        }}
      />

      {/* LAYER 2: Advertisement / Campaign Overlay */}
      {currentMode === 'ad' && currentAd && resolvedMediaUrl && !activeEmergency && (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#000000',
          }}
        >
          {currentAd.type === 'video' ? (
            <video
              src={resolvedMediaUrl}
              autoPlay
              muted
              loop
              playsInline
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            />
          ) : (
            <img
              src={resolvedMediaUrl}
              alt={currentAd.title || 'Hospital Advertisement'}
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            />
          )}
        </div>
      )}

      {/* LAYER 3: Emergency Broadcast Override */}
      {activeEmergency && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 9999,
            backgroundColor: activeEmergency.severity === 'warning' ? '#D97706' : '#DC2626',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '48px',
            color: '#FFFFFF',
            textAlign: 'center',
            boxShadow: 'inset 0 0 80px rgba(0,0,0,0.5)',
          }}
        >
          <AlertTriangle size={96} color="#FFFFFF" style={{ marginBottom: 24 }} />
          <h1
            style={{
              fontSize: '44px',
              fontWeight: 900,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              margin: 0,
            }}
          >
            {activeEmergency.title || 'EMERGENCY ANNOUNCEMENT'}
          </h1>
          <p
            style={{
              fontSize: '26px',
              fontWeight: 600,
              maxWidth: '850px',
              marginTop: '20px',
              lineHeight: 1.4,
            }}
          >
            {activeEmergency.message}
          </p>
        </div>
      )}

      {/* Connection Indicator Pill (Subtle bottom-right) */}
      <div
        style={{
          position: 'absolute',
          bottom: '12px',
          right: '12px',
          padding: '4px 10px',
          borderRadius: '16px',
          backgroundColor: 'rgba(0, 0, 0, 0.75)',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          fontSize: '11px',
          fontWeight: 600,
          color: isConnected ? '#18B88A' : '#F2A93B',
          zIndex: 100,
          pointerEvents: 'none',
        }}
      >
        {isConnected ? <Wifi size={12} /> : <WifiOff size={12} />}
        <span>{isConnected ? 'LIVE' : 'RECONNECTING'}</span>
      </div>
    </div>
  );
};
