import React, { useState } from 'react';
import {
  Tv,
  Plus,
  Search,
  RotateCcw,
  Sliders,
  Play,
  Pause,
  Power,
  Trash2,
  ExternalLink,
  Layers,
  LayoutGrid,
  List,
  Edit2,
  X,
  Radio,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';
import { Screen, Department } from '../types';
import { api } from '../services/api';

interface ScreensPageProps {
  screens: Screen[];
  departments: Department[];
  onSelectScreen: (screen: Screen) => void;
  onOpenPairModal: () => void;
  onRefreshScreens: () => void;
  onOpenLiveFeed?: (screen: Screen) => void;
}

export const ScreensPage: React.FC<ScreensPageProps> = ({
  screens,
  departments,
  onSelectScreen,
  onOpenPairModal,
  onRefreshScreens,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDept, setSelectedDept] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedDoctor, setSelectedDoctor] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');

  // Edit screen modal state
  const [editingScreen, setEditingScreen] = useState<Screen | null>(null);
  const [editName, setEditName] = useState('');
  const [editLocation, setEditLocation] = useState('');
  const [editDepartmentId, setEditDepartmentId] = useState('');
  const [editQueueUrl, setEditQueueUrl] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  // Statistics
  const totalScreens = screens.length;
  const onlineScreens = screens.filter((s) => s.connectionStatus === 'online').length;
  const offlineScreens = totalScreens - onlineScreens;
  const needsAttention = screens.filter(
    (s) => s.healthStatus === 'UPDATE_REQUIRED' || s.healthStatus === 'QUEUE_STALE' || s.connectionStatus === 'offline'
  ).length;

  // Extract unique doctors from queue URLs or names for doctor filter
  const doctorList = Array.from(
    new Set(
      screens
        .map((s) => {
          const match = s.queueUrl?.match(/DOC\d+/i) || s.name.match(/Doctor\s*\d+|Dr\.\s*\w+/i);
          return match ? match[0] : null;
        })
        .filter(Boolean)
    )
  );

  // Filtered screens
  const filteredScreens = screens.filter((screen) => {
    const matchesSearch =
      screen.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      screen.location.toLowerCase().includes(searchTerm.toLowerCase()) ||
      screen.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      screen.queueUrl.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesDept = selectedDept === 'all' || screen.departmentId === selectedDept;

    const matchesStatus =
      selectedStatus === 'all' ||
      (selectedStatus === 'online' && screen.connectionStatus === 'online') ||
      (selectedStatus === 'offline' && screen.connectionStatus === 'offline') ||
      (selectedStatus === 'attention' &&
        (screen.healthStatus === 'UPDATE_REQUIRED' || screen.healthStatus === 'QUEUE_STALE'));

    const matchesDoctor =
      selectedDoctor === 'all' ||
      (screen.queueUrl && screen.queueUrl.includes(selectedDoctor)) ||
      screen.name.includes(selectedDoctor);

    return matchesSearch && matchesDept && matchesStatus && matchesDoctor;
  });

  const handleOpenEdit = (screen: Screen, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingScreen(screen);
    setEditName(screen.name);
    setEditLocation(screen.location);
    setEditDepartmentId(screen.departmentId);
    setEditQueueUrl(screen.queueUrl || '');
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingScreen) return;
    setEditSaving(true);
    try {
      await api.patch(`/screens/${editingScreen.id}`, {
        name: editName,
        location: editLocation,
        departmentId: editDepartmentId,
        queueUrl: editQueueUrl,
      });
      setEditingScreen(null);
      onRefreshScreens();
    } catch (err: any) {
      alert(`Failed to save screen settings: ${err.message}`);
    } finally {
      setEditSaving(false);
    }
  };

  const handleTogglePause = async (screenId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await api.post(`/screens/${screenId}/toggle-pause`);
      onRefreshScreens();
    } catch (err: any) {
      alert(`Failed to toggle screen playback: ${err.message}`);
    }
  };

  const handleTogglePower = async (screen: Screen, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const nextState = screen.powerState === 'off' ? 'on' : 'off';
      await api.post(`/screens/${screen.id}/power`, { state: nextState });
      onRefreshScreens();
    } catch (err: any) {
      alert(`Failed to change power state: ${err.message}`);
    }
  };

  const handleRestartScreen = async (screen: Screen, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Send restart command to "${screen.name}"?`)) return;
    try {
      await api.post(`/screens/${screen.id}/command`, {
        commandType: 'REBOOT_DEVICE',
        payload: { force: true },
      });
      alert('Restart command dispatched to TV.');
      onRefreshScreens();
    } catch (err: any) {
      alert(`Failed to restart: ${err.message}`);
    }
  };

  const handleTestScreen = async (screen: Screen, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await api.post(`/screens/${screen.id}/command`, {
        commandType: 'EMERGENCY_OVERRIDE',
        payload: {
          title: 'TV DISPLAY CONNECTION TEST',
          message: 'System test packet received successfully. Display engine operational.',
          durationSeconds: 6,
        },
      });
      alert('Test alert dispatched to screen.');
      onRefreshScreens();
    } catch (err: any) {
      alert(`Failed to test: ${err.message}`);
    }
  };

  const handleUnpairScreen = async (screen: Screen, e: React.MouseEvent) => {
    e.stopPropagation();
    if (
      !confirm(
        `Are you sure you want to unpair "${screen.name}"?\n\nThe TV will return to the 6-digit pairing code screen.`
      )
    ) {
      return;
    }
    try {
      await api.post(`/screens/${screen.id}/unpair`);
      onRefreshScreens();
    } catch (err: any) {
      alert(`Failed to unpair: ${err.message}`);
    }
  };

  return (
    <div style={{ padding: '28px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Top Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--dark)' }}>
            Screens / TVs Management
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Control and monitor connected hospital display units across all OPD wards.
          </p>
        </div>

        <button className="btn btn-primary" onClick={onOpenPairModal}>
          <Plus size={15} />
          <span>+ Pair New TV</span>
        </button>
      </div>

      {/* Top Statistics Cards (4 Cards) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
        <div className="card" style={{ padding: '16px 20px' }}>
          <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Total Screens
          </div>
          <div style={{ fontSize: '26px', fontWeight: 700, color: 'var(--dark)', marginTop: '6px' }}>
            {totalScreens}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
            Registered displays
          </div>
        </div>

        <div className="card" style={{ padding: '16px 20px' }}>
          <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Online
          </div>
          <div style={{ fontSize: '26px', fontWeight: 700, color: '#0E805E', marginTop: '6px' }}>
            {onlineScreens}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
            Transmitting heartbeats
          </div>
        </div>

        <div className="card" style={{ padding: '16px 20px' }}>
          <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Offline
          </div>
          <div style={{ fontSize: '26px', fontWeight: 700, color: offlineScreens > 0 ? 'var(--danger)' : 'var(--text-main)', marginTop: '6px' }}>
            {offlineScreens}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
            Unreachable / disconnected
          </div>
        </div>

        <div className="card" style={{ padding: '16px 20px' }}>
          <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Needs Attention
          </div>
          <div style={{ fontSize: '26px', fontWeight: 700, color: needsAttention > 0 ? 'var(--warning)' : 'var(--text-main)', marginTop: '6px' }}>
            {needsAttention}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
            Version drift or stale queue
          </div>
        </div>
      </div>

      {/* Filter and Search Bar Section */}
      <div className="card" style={{ padding: '16px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
          {/* Search Input */}
          <div className="search-bar" style={{ flex: '1 1 240px' }}>
            <Search size={16} color="var(--text-muted)" />
            <input
              type="text"
              placeholder="Search by TV name, location, doctor, or code..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {/* Department Filter */}
          <select
            className="form-select"
            style={{ width: 'auto', minWidth: '150px' }}
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

          {/* Status Filter */}
          <select
            className="form-select"
            style={{ width: 'auto', minWidth: '140px' }}
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
          >
            <option value="all">All Statuses</option>
            <option value="online">Online</option>
            <option value="offline">Offline</option>
            <option value="attention">Needs Attention</option>
          </select>

          {/* Doctor Filter if doctors exist */}
          {doctorList.length > 0 && (
            <select
              className="form-select"
              style={{ width: 'auto', minWidth: '130px' }}
              value={selectedDoctor}
              onChange={(e) => setSelectedDoctor(e.target.value)}
            >
              <option value="all">All Doctors</option>
              {doctorList.map((doc) => (
                <option key={doc} value={doc!}>
                  {doc}
                </option>
              ))}
            </select>
          )}

          {/* View Mode Switcher: Grid vs Table */}
          <div style={{ display: 'inline-flex', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
            <button
              onClick={() => setViewMode('grid')}
              style={{
                padding: '8px 12px',
                border: 'none',
                backgroundColor: viewMode === 'grid' ? 'var(--primary-subtle)' : '#FFFFFF',
                color: viewMode === 'grid' ? 'var(--primary)' : 'var(--text-secondary)',
                cursor: 'pointer',
              }}
              title="Grid View"
            >
              <LayoutGrid size={16} />
            </button>
            <button
              onClick={() => setViewMode('table')}
              style={{
                padding: '8px 12px',
                border: 'none',
                borderLeft: '1px solid var(--border)',
                backgroundColor: viewMode === 'table' ? 'var(--primary-subtle)' : '#FFFFFF',
                color: viewMode === 'table' ? 'var(--primary)' : 'var(--text-secondary)',
                cursor: 'pointer',
              }}
              title="Table View"
            >
              <List size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Main Content: Table or Grid */}
      {filteredScreens.length === 0 ? (
        <div className="card" style={{ padding: '40px', textAlign: 'center' }}>
          <Tv size={36} color="var(--text-muted)" style={{ margin: '0 auto 12px' }} />
          <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--dark)' }}>
            No Matching Screens Found
          </h3>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Try resetting your search filters or pair a new TV screen.
          </p>
        </div>
      ) : viewMode === 'grid' ? (
        /* Grid View */
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
            gap: '18px',
          }}
        >
          {filteredScreens.map((screen) => {
            const dept = departments.find((d) => d.id === screen.departmentId);
            const isOnline = screen.connectionStatus === 'online';
            const isPaused = screen.isPaused;
            const isPowerOff = screen.powerState === 'off';

            return (
              <div
                key={screen.id}
                className="card"
                onClick={() => onSelectScreen(screen)}
                style={{
                  padding: '18px',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: '14px',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--dark)' }}>
                        {screen.name}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                        {dept?.name || 'Department'} • {screen.location}
                      </div>
                    </div>

                    <span className={`badge ${isOnline ? 'badge-online' : 'badge-offline'}`}>
                      <span className={`status-dot ${isOnline ? 'online' : 'offline'}`} />
                      {isOnline ? 'Online' : 'Offline'}
                    </span>
                  </div>

                  {/* Metadata info */}
                  <div
                    style={{
                      margin: '12px 0 0',
                      padding: '10px 12px',
                      backgroundColor: 'var(--bg-main)',
                      borderRadius: 'var(--radius-sm)',
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: '8px',
                      fontSize: '11px',
                    }}
                  >
                    <div>
                      <span style={{ color: 'var(--text-muted)' }}>Now Showing:</span>
                      <div style={{ fontWeight: 600, color: 'var(--text-main)', marginTop: '2px', textTransform: 'capitalize' }}>
                        {screen.currentContent === 'queue' ? 'Queue Display' : screen.currentContent || 'Queue'}
                      </div>
                    </div>

                    <div>
                      <span style={{ color: 'var(--text-muted)' }}>Player Version:</span>
                      <div style={{ fontWeight: 600, color: 'var(--primary)', marginTop: '2px' }}>
                        v{screen.playerVersion || '1.0.0'}
                      </div>
                    </div>

                    <div>
                      <span style={{ color: 'var(--text-muted)' }}>Queue URL:</span>
                      <div style={{ fontWeight: 500, color: 'var(--text-secondary)', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {screen.queueUrl || 'None'}
                      </div>
                    </div>

                    <div>
                      <span style={{ color: 'var(--text-muted)' }}>Last Seen:</span>
                      <div style={{ fontWeight: 500, color: 'var(--text-secondary)', marginTop: '2px' }}>
                        {screen.lastHeartbeat
                          ? new Date(screen.lastHeartbeat).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                          : 'Pending'}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Actions Toolbar */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingTop: '12px',
                    borderTop: '1px solid var(--border)',
                  }}
                >
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      className="btn btn-outline btn-sm"
                      onClick={(e) => handleOpenEdit(screen, e)}
                      title="Edit Screen Details"
                    >
                      <Edit2 size={13} />
                    </button>

                    <button
                      className="btn btn-outline btn-sm"
                      onClick={(e) => handleTogglePause(screen.id, e)}
                      title={isPaused ? 'Resume Playback' : 'Pause Playback'}
                    >
                      {isPaused ? <Play size={13} color="var(--success)" /> : <Pause size={13} color="var(--warning)" />}
                    </button>

                    <button
                      className="btn btn-outline btn-sm"
                      onClick={(e) => handleTogglePower(screen, e)}
                      title={isPowerOff ? 'Power ON Display' : 'Power OFF Standby'}
                    >
                      <Power size={13} color={isPowerOff ? 'var(--danger)' : 'var(--text-secondary)'} />
                    </button>

                    <button
                      className="btn btn-outline btn-sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        window.open(`/display/${screen.id}`, '_blank');
                      }}
                      title="Open Live TV Display URL"
                    >
                      <ExternalLink size={13} color="var(--primary)" />
                    </button>

                    <button
                      className="btn btn-outline btn-sm"
                      onClick={(e) => handleRestartScreen(screen, e)}
                      title="Reboot TV Player"
                    >
                      <RotateCcw size={13} />
                    </button>

                    <button
                      className="btn btn-outline btn-sm"
                      onClick={(e) => handleTestScreen(screen, e)}
                      title="Send Test Packet"
                    >
                      <Radio size={13} />
                    </button>
                  </div>

                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => onSelectScreen(screen)}
                  >
                    <Sliders size={13} />
                    <span>Control</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Table View */
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Status</th>
                <th>TV Name & Code</th>
                <th>Department</th>
                <th>Location</th>
                <th>Current Content</th>
                <th>Queue URL</th>
                <th>Version</th>
                <th>Last Seen</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredScreens.map((screen) => {
                const dept = departments.find((d) => d.id === screen.departmentId);
                const isOnline = screen.connectionStatus === 'online';

                return (
                  <tr key={screen.id} onClick={() => onSelectScreen(screen)} style={{ cursor: 'pointer' }}>
                    <td>
                      <span className={`badge ${isOnline ? 'badge-online' : 'badge-offline'}`}>
                        <span className={`status-dot ${isOnline ? 'online' : 'offline'}`} />
                        {isOnline ? 'Online' : 'Offline'}
                      </span>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, color: 'var(--dark)' }}>{screen.name}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{screen.code}</div>
                    </td>
                    <td>{dept?.name || 'Department'}</td>
                    <td>{screen.location}</td>
                    <td>
                      <span className="badge badge-neutral" style={{ textTransform: 'capitalize' }}>
                        {screen.currentContent === 'queue' ? 'Queue Display' : screen.currentContent || 'Queue'}
                      </span>
                    </td>
                    <td style={{ maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {screen.queueUrl || '-'}
                    </td>
                    <td>
                      <span className="badge badge-purple">
                        v{screen.playerVersion || '1.0.0'}
                      </span>
                    </td>
                    <td>
                      {screen.lastHeartbeat
                        ? new Date(screen.lastHeartbeat).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                        : 'Pending'}
                    </td>
                    <td style={{ textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                      <div style={{ display: 'inline-flex', gap: '6px' }}>
                        <button
                          className="btn btn-outline btn-sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            window.open(`/display/${screen.id}`, '_blank');
                          }}
                          title="Launch Public TV Display"
                        >
                          <ExternalLink size={13} color="var(--primary)" />
                        </button>
                        <button
                          className="btn btn-outline btn-sm"
                          onClick={(e) => handleOpenEdit(screen, e)}
                          title="Edit"
                        >
                          <Edit2 size={13} />
                        </button>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => onSelectScreen(screen)}
                        >
                          <Sliders size={13} />
                          <span>Control</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit Screen Modal */}
      {editingScreen && (
        <div className="modal-overlay" onClick={() => setEditingScreen(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '480px' }}>
            <div className="modal-header">
              <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--dark)' }}>
                Edit TV Screen Settings
              </h3>
              <button
                className="btn-ghost"
                onClick={() => setEditingScreen(null)}
                style={{ padding: '4px' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveEdit}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">TV Display Name</label>
                  <input
                    type="text"
                    className="form-input"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Location / Consultation Room</label>
                  <input
                    type="text"
                    className="form-input"
                    value={editLocation}
                    onChange={(e) => setEditLocation(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Hospital Department</label>
                  <select
                    className="form-select"
                    value={editDepartmentId}
                    onChange={(e) => setEditDepartmentId(e.target.value)}
                    required
                  >
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name} ({d.code})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Doctor OPD Queue URL</label>
                  <input
                    type="url"
                    className="form-input"
                    value={editQueueUrl}
                    onChange={(e) => setEditQueueUrl(e.target.value)}
                    placeholder="https://hms.jjmhospitalkashipur.com/qd/DOC038"
                    required
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => setEditingScreen(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary btn-sm"
                  disabled={editSaving}
                >
                  {editSaving ? 'Saving...' : 'Save Settings'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
