import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { Dashboard } from './pages/Dashboard';
import { ScreensPage } from './pages/Screens';
import { DepartmentsPage } from './pages/Departments';
import { MediaLibraryPage } from './pages/MediaLibrary';
import { PlaylistsPage } from './pages/Playlists';
import { CampaignsPage } from './pages/Campaigns';
import { AuditLogsPage } from './pages/AuditLogs';
import { LiveFeeds } from './pages/LiveFeeds';
import { EmergencyAnnouncements } from './pages/EmergencyAnnouncements';
import { DeploymentReconciliation } from './pages/DeploymentReconciliation';
import { SettingsPage } from './pages/Settings';
import { Login } from './pages/Login';
import { PublicDisplayView } from './pages/PublicDisplayView';
import { PairScreenModal } from './components/PairScreenModal';
import { ScreenDetailModal } from './components/ScreenDetailModal';
import { OneClickGlobalModal } from './components/OneClickGlobalModal';
import { Screen, Department, MediaItem, Playlist, Campaign, AuditLog } from './types';
import { api, clearAdminToken } from './services/api';
import { getSocket, disconnectSocket } from './services/socket';

export const App: React.FC = () => {
  // Public Display Screen Route Check (e.g. /display/SCR-DOC038 or ?display=SCR-DOC038)
  const [displayScreenId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    const path = window.location.pathname;
    if (path.startsWith('/display/')) {
      const id = path.replace('/display/', '').trim();
      if (id) return id;
    }
    const params = new URLSearchParams(window.location.search);
    return params.get('display');
  });

  // Authentication check: Authorized with ID JJMads@Vibesoft.in & Pass JJM@#ads & PIN 935989
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    try {
      return !!localStorage.getItem('jjm_auth_user');
    } catch {
      return false;
    }
  });

  const [activeTab, setActiveTab] = useState('dashboard');
  const [screens, setScreens] = useState<Screen[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [hasActiveEmergency, setHasActiveEmergency] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  // Modals state
  const [isPairModalOpen, setIsPairModalOpen] = useState(false);
  const [isGlobalModalOpen, setIsGlobalModalOpen] = useState(false);
  const [selectedScreen, setSelectedScreen] = useState<Screen | null>(null);

  const fetchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleLogout = useCallback(() => {
    try {
      api.post('/auth/logout').catch(() => {});
      clearAdminToken();
      disconnectSocket();
    } catch {}
    setIsAuthenticated(false);
  }, []);


  // Fetch all initial data
  const fetchData = async () => {
    try {
      const [screensRes, deptsRes, mediaRes, plRes, campRes, auditRes, emRes] = await Promise.all([
        api.get('/screens'),
        api.get('/departments'),
        api.get('/media'),
        api.get('/playlists'),
        api.get('/campaigns'),
        api.get('/audit-logs'),
        api.get('/emergency').catch(() => ({ data: { success: false } })),
      ]);

      if (screensRes.data.success) setScreens(screensRes.data.screens);
      if (deptsRes.data.success) setDepartments(deptsRes.data.departments);
      if (mediaRes.data.success) setMedia(mediaRes.data.media);
      if (plRes.data.success) setPlaylists(plRes.data.playlists);
      if (campRes.data.success) setCampaigns(campRes.data.campaigns);
      if (auditRes.data.success) setAuditLogs(auditRes.data.logs);
      if (emRes.data?.success && emRes.data.announcement?.isActive) {
        setHasActiveEmergency(true);
      } else {
        setHasActiveEmergency(false);
      }
    } catch (err) {
      console.error('Error fetching admin data:', err);
    }
  };

  useEffect(() => {
    if (!isAuthenticated) return;

    fetchData();

    // Handle server-side auth expiry (401 from any API call)
    const handleAuthExpired = () => handleLogout();
    window.addEventListener('jjm:auth:expired', handleAuthExpired);

    // Setup real-time Socket.IO listeners
    const socket = getSocket();

    // Debounced full-refresh: screens:changed fires on every heartbeat (50+/min)
    // Only trigger full re-fetch at most once every 2 seconds
    const debouncedFetch = () => {
      if (fetchDebounceRef.current) clearTimeout(fetchDebounceRef.current);
      fetchDebounceRef.current = setTimeout(() => { fetchData(); }, 2000);
    };

    socket.on('screens:changed', debouncedFetch);

    socket.on('screen:status_change', ({ screenId, status, healthStatus }) => {
      setScreens((prev) =>
        prev.map((s) => (s.id === screenId ? { ...s, connectionStatus: status, healthStatus: healthStatus || s.healthStatus } : s))
      );
    });

    socket.on('screen:heartbeat_received', ({ screenId, currentContent, healthStatus, appliedConfigVersion, targetConfigVersion }) => {
      setScreens((prev) =>
        prev.map((s) =>
          s.id === screenId
            ? {
                ...s,
                connectionStatus: 'online',
                lastHeartbeat: new Date().toISOString(),
                currentContent: currentContent || s.currentContent,
                healthStatus: healthStatus || s.healthStatus,
                appliedConfigVersion: appliedConfigVersion ?? s.appliedConfigVersion,
                targetConfigVersion: targetConfigVersion ?? s.targetConfigVersion,
              }
            : s
        )
      );
    });

    socket.on('emergency:broadcast', () => { setHasActiveEmergency(true); });
    socket.on('emergency:dismiss', () => { setHasActiveEmergency(false); });

    return () => {
      window.removeEventListener('jjm:auth:expired', handleAuthExpired);
      socket.off('screens:changed', debouncedFetch);
      socket.off('screen:status_change');
      socket.off('screen:heartbeat_received');
      socket.off('emergency:broadcast');
      socket.off('emergency:dismiss');
      if (fetchDebounceRef.current) clearTimeout(fetchDebounceRef.current);
    };
  }, [isAuthenticated, handleLogout]);


  // Standalone Public TV Display Route (Bypasses admin login)
  if (displayScreenId) {
    return <PublicDisplayView screenId={displayScreenId} />;
  }

  if (!isAuthenticated) {
    return <Login onLoginSuccess={() => setIsAuthenticated(true)} />;
  }

  const onlineScreensCount = screens.filter((s) => s.connectionStatus === 'online').length;

  const getPageTitle = () => {
    switch (activeTab) {
      case 'dashboard':
        return 'Hospital Overview & Operations';
      case 'emergency':
        return 'Emergency Broadcast Center';
      case 'screens':
        return 'Screens / TVs Management';
      case 'live-feeds':
        return 'Live Screen Feeds (CCTV Monitoring)';
      case 'reconciliation':
        return 'Deployment & Version Reconciliation';
      case 'departments':
        return 'Hospital Departments';
      case 'media':
        return 'Media Assets Library';
      case 'playlists':
        return 'Display Sequence Playlists';
      case 'campaigns':
        return 'Campaigns & Advertisements';
      case 'audit':
        return 'Hospital Audit Logs';
      case 'settings':
        return 'Platform Settings & Configuration';
      default:
        return 'Hospital Overview';
    }
  };

  const getPageSubtitle = () => {
    switch (activeTab) {
      case 'dashboard':
        return 'Monitor, control and broadcast content across all connected hospital displays.';
      case 'emergency':
        return 'Instant alert takeover across all hospital screens and OPD consultation displays.';
      case 'screens':
        return 'Control and monitor connected hospital display units across all OPD wards.';
      case 'live-feeds':
        return 'Multi-screen visual matrix monitoring active OPD queue displays in real time.';
      case 'reconciliation':
        return 'Real-time telemetry tracking target vs applied configuration versions and parity.';
      case 'departments':
        return 'Manage medical divisions, assigned doctors, queue URLs, and dedicated TV screens.';
      case 'media':
        return 'Store, verify and deploy high-definition clinical guidance posters and videos.';
      case 'playlists':
        return 'Build visual sequence rotations interleaving doctor OPD queues with announcements.';
      case 'campaigns':
        return 'Schedule and target hospital awareness campaigns and health camp ads.';
      case 'audit':
        return 'Immutable operational log tracking TV pairings, emergency broadcasts, and queue updates.';
      case 'settings':
        return 'Configure hospital parameters, Android TV kiosk policies, and queue watchdog thresholds.';
      default:
        return 'JJM Hospital Kashipur Central Signage Control Plane';
    }
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: 'var(--bg-main)' }}>
      {/* Left Navigation Sidebar */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={(tab) => {
          setActiveTab(tab);
          setIsMobileOpen(false);
        }}
        onlineScreensCount={onlineScreensCount}
        totalScreensCount={screens.length}
        hasActiveEmergency={hasActiveEmergency}
        onLogout={handleLogout}
        isMobileOpen={isMobileOpen}
        onCloseMobile={() => setIsMobileOpen(false)}
      />

      {/* Main Content Area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, height: '100vh', overflow: 'hidden' }}>
        <Header
          title={getPageTitle()}
          subtitle={getPageSubtitle()}
          onlineScreensCount={onlineScreensCount}
          totalScreensCount={screens.length}
          onOpenPairModal={() => setIsPairModalOpen(true)}
          onOpenGlobalAdModal={() => setIsGlobalModalOpen(true)}
          onLogout={handleLogout}
          onToggleMobileMenu={() => setIsMobileOpen((prev) => !prev)}
        />

        <main style={{ flex: 1, overflowY: 'auto' }}>
          {activeTab === 'dashboard' && (
            <Dashboard
              screens={screens}
              departments={departments}
              media={media}
              campaigns={campaigns}
              onSelectScreen={(s) => setSelectedScreen(s)}
              onOpenPairModal={() => setIsPairModalOpen(true)}
              onOpenGlobalModal={() => setIsGlobalModalOpen(true)}
              onNavigateToLiveFeeds={() => setActiveTab('live-feeds')}
              onRefresh={fetchData}
            />
          )}

          {activeTab === 'emergency' && (
            <EmergencyAnnouncements screens={screens} onRefresh={fetchData} />
          )}

          {activeTab === 'live-feeds' && (
            <LiveFeeds
              screens={screens}
              departments={departments}
              campaigns={campaigns}
              playlists={playlists}
              media={media}
              onRefresh={fetchData}
              onOpenGlobalModal={() => setIsGlobalModalOpen(true)}
              onSelectScreen={(s) => setSelectedScreen(s)}
            />
          )}

          {activeTab === 'screens' && (
            <ScreensPage
              screens={screens}
              departments={departments}
              onSelectScreen={(s) => setSelectedScreen(s)}
              onOpenPairModal={() => setIsPairModalOpen(true)}
              onRefreshScreens={fetchData}
            />
          )}

          {activeTab === 'reconciliation' && (
            <DeploymentReconciliation />
          )}

          {activeTab === 'departments' && (
            <DepartmentsPage departments={departments} onRefresh={fetchData} />
          )}

          {activeTab === 'media' && (
            <MediaLibraryPage media={media} onRefresh={fetchData} />
          )}

          {activeTab === 'playlists' && (
            <PlaylistsPage playlists={playlists} media={media} onRefresh={fetchData} />
          )}

          {activeTab === 'campaigns' && (
            <CampaignsPage
              campaigns={campaigns}
              media={media}
              departments={departments}
              screens={screens}
              playlists={playlists}
              onOpenGlobalModal={() => setIsGlobalModalOpen(true)}
              onRefresh={fetchData}
            />
          )}

          {activeTab === 'audit' && <AuditLogsPage logs={auditLogs} />}

          {activeTab === 'settings' && <SettingsPage />}
        </main>
      </div>

      {/* Modals */}
      <PairScreenModal
        isOpen={isPairModalOpen}
        onClose={() => setIsPairModalOpen(false)}
        departments={departments}
        onScreenPaired={fetchData}
      />

      <ScreenDetailModal
        screen={selectedScreen}
        departments={departments}
        isOpen={!!selectedScreen}
        onClose={() => setSelectedScreen(null)}
        onRefreshList={fetchData}
      />

      <OneClickGlobalModal
        isOpen={isGlobalModalOpen}
        onClose={() => setIsGlobalModalOpen(false)}
        mediaList={media}
        onBroadcastSuccess={fetchData}
      />
    </div>
  );
};
