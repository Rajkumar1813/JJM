import React from 'react';
import { Plus, Megaphone, Menu } from 'lucide-react';

interface HeaderProps {
  title: string;
  subtitle?: string;
  onlineScreensCount?: number;
  totalScreensCount?: number;
  onOpenPairModal: () => void;
  onOpenGlobalAdModal: () => void;
  onLogout?: () => void;
  onToggleMobileMenu?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  title,
  subtitle,
  onlineScreensCount = 0,
  totalScreensCount = 0,
  onOpenPairModal,
  onOpenGlobalAdModal,
  onToggleMobileMenu,
}) => {
  return (
    <header
      style={{
        height: 'var(--header-height)',
        borderBottom: '1px solid var(--border)',
        backgroundColor: '#FFFFFF',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 28px',
        position: 'sticky',
        top: 0,
        zIndex: 500,
        gap: '16px',
      }}
    >
      {/* Left: Page Title & Subtitle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
        {onToggleMobileMenu && (
          <button
            onClick={onToggleMobileMenu}
            className="mobile-menu-btn"
            style={{
              display: 'none',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '6px',
              color: 'var(--text-main)',
            }}
          >
            <Menu size={22} />
          </button>
        )}
        <div style={{ minWidth: 0 }}>
          <h2
            style={{
              fontSize: '18px',
              fontWeight: 700,
              color: 'var(--dark)',
              lineHeight: 1.2,
              letterSpacing: '-0.01em',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {title}
          </h2>
          {subtitle && (
            <p
              style={{
                fontSize: '12px',
                color: 'var(--text-secondary)',
                marginTop: '2px',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {subtitle}
            </p>
          )}
        </div>
      </div>

      {/* Right: Live TV Status & Action Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
        {/* Live TV Status Badge */}
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '5px 10px',
            borderRadius: 'var(--radius-sm)',
            backgroundColor: 'var(--bg-main)',
            border: '1px solid var(--border)',
            fontSize: '12px',
            fontWeight: 600,
            color: 'var(--text-main)',
          }}
          title="Active screen telemetry across the hospital"
        >
          <span
            style={{
              width: '7px',
              height: '7px',
              borderRadius: '50%',
              backgroundColor: onlineScreensCount > 0 ? 'var(--success)' : 'var(--warning)',
              display: 'inline-block',
            }}
          />
          <span style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
            Live System:
          </span>
          <span style={{ color: 'var(--dark)', fontWeight: 700 }}>
            {onlineScreensCount} / {totalScreensCount} TVs Online
          </span>
        </div>

        {/* Broadcast to All TVs Quick CTA */}
        <button
          className="btn btn-secondary btn-sm"
          onClick={onOpenGlobalAdModal}
          title="Broadcast content immediately across all hospital screens"
        >
          <Megaphone size={14} />
          <span className="desktop-only">Broadcast to All TVs</span>
        </button>

        {/* Pair New TV CTA */}
        <button
          className="btn btn-primary btn-sm"
          onClick={onOpenPairModal}
          title="Pair a new TV display with a 6-digit code"
        >
          <Plus size={15} />
          <span>Pair New TV</span>
        </button>
      </div>
    </header>
  );
};
