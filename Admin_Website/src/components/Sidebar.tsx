import React from 'react';
import {
  LayoutDashboard,
  Tv,
  Building2,
  Image as ImageIcon,
  ListVideo,
  Megaphone,
  FileText,
  Video,
  AlertTriangle,
  LogOut,
  X,
  Layers,
  Settings,
  Activity,
  User,
} from 'lucide-react';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onlineScreensCount: number;
  totalScreensCount: number;
  hasActiveEmergency?: boolean;
  onLogout?: () => void;
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  onlineScreensCount,
  totalScreensCount,
  hasActiveEmergency,
  onLogout,
  isMobileOpen,
  onCloseMobile,
}) => {
  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    {
      id: 'emergency',
      label: 'Emergency Alerts',
      icon: AlertTriangle,
      badge: hasActiveEmergency ? 'ACTIVE' : undefined,
      isEmergency: true,
    },
    {
      id: 'screens',
      label: 'Screens / TVs',
      icon: Tv,
      badge: `${onlineScreensCount}/${totalScreensCount}`,
    },
    {
      id: 'live-feeds',
      label: 'Live Feeds',
      icon: Video,
      badge: 'LIVE',
      isLive: true,
    },
    { id: 'reconciliation', label: 'Reconciliation', icon: Layers },
    { id: 'departments', label: 'Departments', icon: Building2 },
    { id: 'media', label: 'Media Assets', icon: ImageIcon },
    { id: 'playlists', label: 'Playlists', icon: ListVideo },
    { id: 'campaigns', label: 'Campaigns & Ads', icon: Megaphone },
    { id: 'audit', label: 'Audit Logs', icon: FileText },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <>
      {/* Mobile Backdrop Overlay */}
      {isMobileOpen && (
        <div
          onClick={onCloseMobile}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(32, 32, 51, 0.4)',
            zIndex: 900,
          }}
        />
      )}

      <aside
        className={`app-sidebar ${isMobileOpen ? 'mobile-open' : ''}`}
        style={{
          width: 'var(--sidebar-width)',
          backgroundColor: '#FFFFFF',
          borderRight: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          flexShrink: 0,
          height: '100vh',
          position: 'sticky',
          top: 0,
          zIndex: 950,
        }}
      >
        {/* Brand Header */}
        <div
          style={{
            height: 'var(--header-height)',
            padding: '0 20px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                backgroundColor: 'var(--primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#FFFFFF',
                flexShrink: 0,
              }}
            >
              <Activity size={20} strokeWidth={2.2} />
            </div>
            <div>
              <div
                style={{
                  fontSize: '13px',
                  fontWeight: 700,
                  color: 'var(--dark)',
                  letterSpacing: '0.02em',
                  lineHeight: 1.2,
                }}
              >
                JJM HOSPITAL
              </div>
              <div
                style={{
                  fontSize: '10px',
                  fontWeight: 600,
                  color: 'var(--primary)',
                  letterSpacing: '0.04em',
                }}
              >
                KASHIPUR • SIGNAGE
              </div>
            </div>
          </div>

          {onCloseMobile && (
            <button
              onClick={onCloseMobile}
              className="mobile-menu-btn"
              style={{
                display: 'none',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--text-secondary)',
                padding: '4px',
              }}
            >
              <X size={18} />
            </button>
          )}
        </div>

        {/* Navigation Items */}
        <nav
          style={{
            padding: '16px 10px',
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: '2px',
            overflowY: 'auto',
          }}
        >
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;

            return (
              <button
                key={item.id}
                onClick={() => {
                  setActiveTab(item.id);
                  onCloseMobile?.();
                }}
                style={{
                  position: 'relative',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  width: '100%',
                  padding: '9px 12px 9px 14px',
                  borderRadius: 'var(--radius-sm)',
                  border: 'none',
                  backgroundColor: isActive ? 'var(--primary-subtle)' : 'transparent',
                  color: isActive ? 'var(--primary)' : 'var(--text-secondary)',
                  cursor: 'pointer',
                  fontWeight: isActive ? 600 : 500,
                  fontSize: '13px',
                  transition: 'background-color 0.15s ease, color 0.15s ease',
                  textAlign: 'left',
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.backgroundColor = 'var(--bg-main)';
                    e.currentTarget.style.color = 'var(--text-main)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.backgroundColor = 'transparent';
                    e.currentTarget.style.color = 'var(--text-secondary)';
                  }
                }}
              >
                {/* Active Indicator Bar */}
                {isActive && (
                  <div
                    style={{
                      position: 'absolute',
                      left: 0,
                      top: '6px',
                      bottom: '6px',
                      width: '3px',
                      backgroundColor: 'var(--primary)',
                      borderRadius: '0 2px 2px 0',
                    }}
                  />
                )}

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Icon
                    size={17}
                    color={
                      isActive
                        ? 'var(--primary)'
                        : item.isEmergency && hasActiveEmergency
                        ? 'var(--danger)'
                        : 'var(--text-secondary)'
                    }
                    strokeWidth={isActive ? 2.2 : 1.8}
                  />
                  <span>{item.label}</span>
                </div>

                {item.badge && (
                  <span
                    style={{
                      padding: '2px 6px',
                      borderRadius: '4px',
                      fontSize: '10px',
                      fontWeight: 700,
                      letterSpacing: '0.02em',
                      backgroundColor: item.isEmergency
                        ? 'var(--danger-subtle)'
                        : item.isLive
                        ? 'var(--danger-subtle)'
                        : isActive
                        ? '#FFFFFF'
                        : '#EDE8F2',
                      color: item.isEmergency || item.isLive
                        ? 'var(--danger)'
                        : 'var(--primary)',
                      border: item.isEmergency
                        ? '1px solid #F8C8CB'
                        : item.isLive
                        ? '1px solid #F8C8CB'
                        : '1px solid #E2D7E9',
                    }}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Bottom Section: Connection Status + Admin Profile */}
        <div
          style={{
            padding: '14px 16px',
            borderTop: '1px solid var(--border)',
            backgroundColor: 'var(--bg-subtle)',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          {/* Connection Status Indicator */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '11px',
              fontWeight: 500,
              color: 'var(--text-secondary)',
            }}
          >
            <span
              style={{
                width: '7px',
                height: '7px',
                borderRadius: '50%',
                backgroundColor: 'var(--success)',
                display: 'inline-block',
              }}
            />
            <span>Central Engine Connected</span>
          </div>

          {/* Admin Profile & Logout */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingTop: '8px',
              borderTop: '1px solid #EAE5F0',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  backgroundColor: 'var(--primary-subtle)',
                  color: 'var(--primary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '12px',
                  fontWeight: 600,
                }}
              >
                <User size={15} />
              </div>
              <div>
                <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--dark)' }}>
                  Admin
                </div>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                  Super Admin
                </div>
              </div>
            </div>

            {onLogout && (
              <button
                onClick={onLogout}
                className="btn-ghost"
                style={{
                  padding: '6px',
                  borderRadius: 'var(--radius-sm)',
                  cursor: 'pointer',
                  border: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--text-secondary)',
                }}
                title="Log Out"
              >
                <LogOut size={16} />
              </button>
            )}
          </div>
        </div>
      </aside>
    </>
  );
};
