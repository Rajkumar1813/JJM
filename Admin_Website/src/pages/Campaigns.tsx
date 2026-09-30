import React, { useState } from 'react';
import {
  Megaphone,
  Plus,
  Trash2,
  Edit2,
  Play,
  Pause,
  Clock,
  Tv,
  Image as ImageIcon,
  Copy,
  Building2,
  X,
  Sliders,
  CheckCircle2,
  Calendar,
  Layers,
  Film,
  AlertCircle,
} from 'lucide-react';
import { Campaign, MediaItem, Department, Screen, Playlist } from '../types';
import { api, getBackendBaseUrl } from '../services/api';

interface CampaignsPageProps {
  campaigns: Campaign[];
  media: MediaItem[];
  departments: Department[];
  screens: Screen[];
  playlists?: Playlist[];
  onOpenGlobalModal: () => void;
  onRefresh: () => void;
}

export const CampaignsPage: React.FC<CampaignsPageProps> = ({
  campaigns,
  media,
  departments,
  screens,
  playlists = [],
  onOpenGlobalModal,
  onRefresh,
}) => {
  const [activeTab, setActiveTab] = useState<'active' | 'scheduled' | 'paused' | 'expired'>('active');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);

  // Form states
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [contentTypeMode, setContentTypeMode] = useState<'media' | 'playlist'>('media');
  const [singleMediaMode, setSingleMediaMode] = useState<'fullscreen' | 'alternating'>('fullscreen');
  const [selectedMediaId, setSelectedMediaId] = useState(media[0]?.id || '');
  const [selectedPlaylistId, setSelectedPlaylistId] = useState(playlists[0]?.id || '');
  const [targetScope, setTargetScope] = useState<'all' | 'department' | 'screen'>('all');
  const [targetId, setTargetId] = useState('');
  const [priority, setPriority] = useState(70);
  const [duration, setDuration] = useState(15);
  const [intervalMinutes, setIntervalMinutes] = useState(5);
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Filtering campaigns by tab
  const filteredCampaigns = campaigns.filter((c) => {
    if (activeTab === 'active') return c.status === 'active';
    if (activeTab === 'scheduled') return c.status === 'scheduled';
    if (activeTab === 'paused') return c.status === 'paused';
    if (activeTab === 'expired') return c.status === 'expired';
    return true;
  });

  const openCreateModal = () => {
    setName('');
    setDescription('');
    setContentTypeMode(media.length > 0 ? 'media' : playlists.length > 0 ? 'playlist' : 'media');
    setSingleMediaMode('fullscreen');
    setSelectedMediaId(media[0]?.id || '');
    setSelectedPlaylistId(playlists[0]?.id || '');
    setTargetScope('all');
    setTargetId('');
    setPriority(70);
    setDuration(15);
    setIntervalMinutes(5);
    setDaysOfWeek([0, 1, 2, 3, 4, 5, 6]);
    setShowCreateModal(true);
  };

  const openEditModal = (c: Campaign) => {
    setEditingCampaign(c);
    setName(c.name);
    setDescription(c.description || '');
    if (c.playlistId && c.contentType === 'playlist') {
      setContentTypeMode('playlist');
      setSelectedPlaylistId(c.playlistId);
    } else {
      setContentTypeMode('media');
      setSelectedMediaId(c.mediaId || media[0]?.id || '');
      setSingleMediaMode(
        c.contentType === 'single_image_only' || c.contentType === 'single_video_only'
          ? 'fullscreen'
          : 'alternating'
      );
    }
    setTargetScope(c.type === 'global' ? 'all' : c.type === 'screen' ? 'screen' : 'department');
    setTargetId(c.targetIds && c.targetIds[0] !== 'all' ? c.targetIds[0] : '');
    setPriority(c.priority || 70);
    setDuration(c.displayDurationSeconds || 15);
    setIntervalMinutes(c.intervalMinutes || 5);
    setDaysOfWeek(c.daysOfWeek?.length ? c.daysOfWeek : [0, 1, 2, 3, 4, 5, 6]);
  };

  const handleSaveCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const isPlaylistMode = contentTypeMode === 'playlist';
      if (isPlaylistMode && !selectedPlaylistId) {
        alert('Please select a playlist');
        setIsSubmitting(false);
        return;
      }
      if (!isPlaylistMode && !selectedMediaId && media.length === 0) {
        alert('Please upload a media asset in Media Assets tab first or select a Playlist');
        setIsSubmitting(false);
        return;
      }

      const selectedMedia = media.find((m) => m.id === selectedMediaId) || media[0];
      const targetIds = targetScope === 'all' ? ['all'] : targetId ? [targetId] : [];
      const isVideo = selectedMedia?.type === 'video';

      let resolvedContentType = 'single_image_only';
      if (isPlaylistMode) {
        resolvedContentType = 'playlist';
      } else if (singleMediaMode === 'fullscreen') {
        resolvedContentType = isVideo ? 'single_video_only' : 'single_image_only';
      } else {
        resolvedContentType = isVideo ? 'single_video' : 'single_image';
      }

      if (editingCampaign) {
        await api.patch(`/campaigns/${editingCampaign.id}`, {
          name,
          description,
          type: targetScope === 'all' ? 'global' : targetScope,
          contentType: resolvedContentType,
          mediaId: isPlaylistMode ? null : (selectedMedia?.id || null),
          mediaUrl: isPlaylistMode ? null : (selectedMedia?.url || null),
          playlistId: isPlaylistMode ? selectedPlaylistId : null,
          targetIds,
          priority: Number(priority),
          displayDurationSeconds: Number(duration),
          intervalMinutes: Number(intervalMinutes),
          daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
        });
        setEditingCampaign(null);
      } else {
        await api.post('/campaigns', {
          name,
          description,
          type: targetScope === 'all' ? 'global' : targetScope,
          contentType: resolvedContentType,
          mediaId: isPlaylistMode ? undefined : selectedMedia?.id,
          mediaUrl: isPlaylistMode ? undefined : selectedMedia?.url,
          playlistId: isPlaylistMode ? selectedPlaylistId : undefined,
          targetIds,
          priority: Number(priority),
          displayDurationSeconds: Number(duration),
          intervalMinutes: Number(intervalMinutes),
          daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
          status: 'active',
        });
        setShowCreateModal(false);
      }
      onRefresh();
    } catch (err: any) {
      alert(`Error saving campaign: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleStatus = async (c: Campaign) => {
    const nextStatus = c.status === 'active' ? 'paused' : 'active';
    try {
      await api.patch(`/campaigns/${c.id}`, { status: nextStatus });
      onRefresh();
    } catch (err: any) {
      alert(`Failed to update campaign status: ${err.message}`);
    }
  };

  const handleDuplicate = async (c: Campaign) => {
    try {
      await api.post('/campaigns', {
        name: `${c.name} (Copy)`,
        description: c.description,
        type: c.type,
        contentType: c.contentType,
        mediaId: c.mediaId,
        mediaUrl: c.mediaUrl,
        targetIds: c.targetIds,
        priority: c.priority,
        displayDurationSeconds: c.displayDurationSeconds,
        intervalMinutes: c.intervalMinutes,
        daysOfWeek: c.daysOfWeek || [1, 2, 3, 4, 5, 6, 7],
        status: 'draft',
      });
      onRefresh();
    } catch (err: any) {
      alert(`Duplicate failed: ${err.message}`);
    }
  };

  const handleDelete = async (id: string, campName: string) => {
    if (!confirm(`Are you sure you want to delete campaign: "${campName}"?`)) return;
    try {
      await api.delete(`/campaigns/${id}`);
      onRefresh();
    } catch (err: any) {
      alert(`Delete failed: ${err.message}`);
    }
  };

  return (
    <div style={{ padding: '28px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Top Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--dark)' }}>
            Campaigns & Advertisements
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Schedule and target hospital awareness campaigns, doctor introductory slides, and health camp ads.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="btn btn-secondary btn-sm" onClick={onOpenGlobalModal}>
            <Megaphone size={14} />
            <span>Instant Broadcast</span>
          </button>
          <button className="btn btn-primary btn-sm" onClick={openCreateModal}>
            <Plus size={14} />
            <span>+ Create Campaign</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="card" style={{ padding: '12px 20px' }}>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {[
            { id: 'active', label: 'Active Campaigns', count: campaigns.filter((c) => c.status === 'active').length },
            { id: 'scheduled', label: 'Scheduled', count: campaigns.filter((c) => c.status === 'scheduled').length },
            { id: 'paused', label: 'Paused / Drafts', count: campaigns.filter((c) => c.status === 'paused').length },
            { id: 'expired', label: 'Completed / Expired', count: campaigns.filter((c) => c.status === 'expired').length },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={activeTab === tab.id ? 'btn btn-primary btn-sm' : 'btn btn-outline btn-sm'}
            >
              <span>{tab.label}</span>
              <span
                style={{
                  padding: '1px 6px',
                  borderRadius: '10px',
                  fontSize: '10px',
                  fontWeight: 700,
                  backgroundColor: activeTab === tab.id ? 'rgba(255, 255, 255, 0.25)' : 'var(--bg-main)',
                  color: activeTab === tab.id ? '#FFFFFF' : 'var(--text-secondary)',
                }}
              >
                {tab.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Campaigns Grid */}
      {filteredCampaigns.length === 0 ? (
        <div className="card" style={{ padding: '40px', textAlign: 'center' }}>
          <Megaphone size={38} color="var(--text-muted)" style={{ margin: '0 auto 12px' }} />
          <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--dark)' }}>
            No {activeTab} campaigns found
          </h3>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px', maxWidth: '380px', margin: '4px auto 16px' }}>
            Create a campaign to automatically interleave medical promotional banners with patient OPD queues.
          </p>
          <button className="btn btn-primary btn-sm" onClick={openCreateModal}>
            <Plus size={14} />
            <span>Create Campaign</span>
          </button>
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
            gap: '18px',
          }}
        >
          {filteredCampaigns.map((camp) => {
            const mediaItem = camp.mediaId ? media.find((m) => m.id === camp.mediaId) : null;
            const playlistItem = camp.playlistId ? playlists.find((p) => p.id === camp.playlistId) : null;
            const rawUrl = camp.mediaUrl || mediaItem?.url;
            const mediaThumb = rawUrl
              ? rawUrl.startsWith('/')
                ? `${getBackendBaseUrl()}${rawUrl}`
                : rawUrl
              : null;
            const isActive = camp.status === 'active';

            return (
              <div
                key={camp.id}
                className="card"
                style={{
                  padding: '18px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: '14px',
                }}
              >
                <div>
                  {/* Thumbnail & Title */}
                  <div style={{ display: 'flex', gap: '12px' }}>
                    <div
                      style={{
                        width: '70px',
                        height: '70px',
                        borderRadius: 'var(--radius-sm)',
                        backgroundColor: '#15131E',
                        overflow: 'hidden',
                        flexShrink: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {mediaThumb ? (
                        <img
                          src={mediaThumb}
                          alt={camp.name}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      ) : playlistItem ? (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                          <Layers size={22} color="#EF5A7C" />
                          <span style={{ fontSize: '9px', color: '#FFF', marginTop: '2px', fontWeight: 600 }}>
                            {playlistItem.items?.length || 0} items
                          </span>
                        </div>
                      ) : (
                        <ImageIcon size={24} color="#554F63" />
                      )}
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span className={`badge ${isActive ? 'badge-online' : 'badge-neutral'}`}>
                          <span className={`status-dot ${isActive ? 'online' : 'offline'}`} />
                          {camp.status}
                        </span>
                        <span className="badge badge-purple" style={{ fontSize: '10px' }}>
                          P-{camp.priority || 70}
                        </span>
                      </div>

                      <div
                        style={{
                          fontSize: '15px',
                          fontWeight: 700,
                          color: 'var(--dark)',
                          marginTop: '4px',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {camp.name}
                      </div>

                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                        {playlistItem ? (
                          <span style={{ color: 'var(--primary)', fontWeight: 600 }}>Playlist: {playlistItem.name} • </span>
                        ) : null}
                        Target: {camp.type === 'global' ? 'All TVs' : camp.type}
                      </div>
                    </div>
                  </div>

                  {/* Metadata Box */}
                  <div
                    style={{
                      margin: '14px 0 0',
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
                      <span style={{ color: 'var(--text-muted)' }}>Display Duration:</span>
                      <div style={{ fontWeight: 600, color: 'var(--text-main)', marginTop: '1px' }}>
                        {camp.displayDurationSeconds || 15} seconds
                      </div>
                    </div>

                    <div>
                      <span style={{ color: 'var(--text-muted)' }}>Frequency:</span>
                      <div style={{ fontWeight: 600, color: 'var(--text-main)', marginTop: '1px' }}>
                        Every {camp.intervalMinutes || 5} min
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
                      onClick={() => handleToggleStatus(camp)}
                      title={isActive ? 'Pause Campaign' : 'Start Campaign'}
                    >
                      {isActive ? <Pause size={13} color="var(--warning)" /> : <Play size={13} color="var(--success)" />}
                    </button>

                    <button
                      className="btn btn-outline btn-sm"
                      onClick={() => openEditModal(camp)}
                      title="Edit Campaign"
                    >
                      <Edit2 size={13} />
                    </button>

                    <button
                      className="btn btn-outline btn-sm"
                      onClick={() => handleDuplicate(camp)}
                      title="Duplicate Campaign"
                    >
                      <Copy size={13} />
                    </button>

                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => handleDelete(camp.id, camp.name)}
                      style={{ color: 'var(--danger)' }}
                      title="Delete Campaign"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>

                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    Created {new Date(camp.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create / Edit Campaign Modal */}
      {(showCreateModal || editingCampaign) && (
        <div className="modal-overlay" onClick={() => { setShowCreateModal(false); setEditingCampaign(null); }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '560px' }}>
            <div className="modal-header">
              <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--dark)' }}>
                {editingCampaign ? 'Edit Campaign' : 'Create New Campaign'}
              </h3>
              <button
                className="btn-ghost"
                onClick={() => { setShowCreateModal(false); setEditingCampaign(null); }}
                style={{ padding: '4px' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveCampaign}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Campaign Name</label>
                  <input
                    type="text"
                    className="form-input"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Free Cardiology Checkup Camp"
                    required
                  />
                </div>

                {/* Content Source Selection: Media vs Playlist */}
                <div>
                  <label className="form-label">Campaign Content Source</label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '10px' }}>
                    <button
                      type="button"
                      onClick={() => setContentTypeMode('media')}
                      className={contentTypeMode === 'media' ? 'btn btn-primary btn-sm' : 'btn btn-outline btn-sm'}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                    >
                      <ImageIcon size={14} />
                      <span>Single Ad (Image/Video)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setContentTypeMode('playlist')}
                      className={contentTypeMode === 'playlist' ? 'btn btn-primary btn-sm' : 'btn btn-outline btn-sm'}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                    >
                      <Layers size={14} />
                      <span>Display Playlist ({playlists.length})</span>
                    </button>
                  </div>

                  {contentTypeMode === 'media' ? (
                    media.length === 0 ? (
                      <div
                        style={{
                          padding: '12px',
                          borderRadius: 'var(--radius-sm)',
                          backgroundColor: '#FEF3C7',
                          border: '1px solid #FCD34D',
                          color: '#92400E',
                          fontSize: '12px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                        }}
                      >
                        <AlertCircle size={16} />
                        <span>
                          No media assets found in library. Please upload a promotional banner or video in <strong>Media Assets</strong> tab, or switch to a <strong>Playlist</strong> above.
                        </span>
                      </div>
                    ) : (
                      <>
                        <div className="form-group" style={{ marginBottom: 0 }}>
                          <select
                            className="form-select"
                            value={selectedMediaId}
                            onChange={(e) => setSelectedMediaId(e.target.value)}
                            required
                          >
                            {media.map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.title} [{m.type.toUpperCase()}] ({m.duration ? `${m.duration}s` : 'Ad'})
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Selected Media Preview Card */}
                        {(() => {
                          const activeMedia = media.find((m) => m.id === selectedMediaId) || media[0];
                          if (!activeMedia) return null;
                          const mediaUrl = activeMedia.url.startsWith('/')
                            ? `${getBackendBaseUrl()}${activeMedia.url}`
                            : activeMedia.url;
                          return (
                            <div
                              style={{
                                marginTop: '8px',
                                padding: '10px 12px',
                                backgroundColor: 'var(--bg-main)',
                                borderRadius: 'var(--radius-sm)',
                                border: '1px solid var(--border)',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '12px',
                              }}
                            >
                              <div
                                style={{
                                  width: '56px',
                                  height: '42px',
                                  borderRadius: '4px',
                                  backgroundColor: '#000000',
                                  overflow: 'hidden',
                                  flexShrink: 0,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                }}
                              >
                                {activeMedia.type === 'video' ? (
                                  <Film size={22} color="#EF5A7C" />
                                ) : (
                                  <img
                                    src={mediaUrl}
                                    alt={activeMedia.title}
                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                  />
                                )}
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--dark)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {activeMedia.title}
                                </div>
                                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                                  {activeMedia.type.toUpperCase()} • Duration: {activeMedia.duration || 15}s
                                </div>
                              </div>
                            </div>
                          );
                        })()}

                        {/* Single Media Playback Mode Selector */}
                        <div style={{ marginTop: '10px' }}>
                          <label className="form-label" style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                            Display Playback Mode
                          </label>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                            <button
                              type="button"
                              onClick={() => setSingleMediaMode('fullscreen')}
                              className={singleMediaMode === 'fullscreen' ? 'btn btn-primary btn-sm' : 'btn btn-outline btn-sm'}
                              style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}
                            >
                              <span style={{ fontWeight: 700, fontSize: '12px' }}>Continuous Fullscreen</span>
                              <span style={{ fontSize: '10px', opacity: 0.85 }}>100% Poster/Video Only (No Queue)</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setSingleMediaMode('alternating')}
                              className={singleMediaMode === 'alternating' ? 'btn btn-primary btn-sm' : 'btn btn-outline btn-sm'}
                              style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}
                            >
                              <span style={{ fontWeight: 700, fontSize: '12px' }}>Alternate with Queue</span>
                              <span style={{ fontSize: '10px', opacity: 0.85 }}>Ad First ➔ Doctor Queue</span>
                            </button>
                          </div>
                        </div>
                      </>
                    )
                  ) : (
                    playlists.length === 0 ? (
                      <div
                        style={{
                          padding: '12px',
                          borderRadius: 'var(--radius-sm)',
                          backgroundColor: '#FEF3C7',
                          border: '1px solid #FCD34D',
                          color: '#92400E',
                          fontSize: '12px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                        }}
                      >
                        <AlertCircle size={16} />
                        <span>
                          No playlists created yet. Create a multi-ad sequence in the <strong>Playlists</strong> tab first, or choose <strong>Single Ad</strong> above.
                        </span>
                      </div>
                    ) : (
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <select
                          className="form-select"
                          value={selectedPlaylistId}
                          onChange={(e) => setSelectedPlaylistId(e.target.value)}
                          required
                        >
                          {playlists.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} ({p.items?.length || 0} items)
                            </option>
                          ))}
                        </select>
                      </div>
                    )
                  )}
                </div>

                <div>
                  <label className="form-label">Target Scope</label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                    {(['all', 'department', 'screen'] as const).map((sc) => (
                      <button
                        key={sc}
                        type="button"
                        onClick={() => {
                          setTargetScope(sc);
                          if (sc === 'all') setTargetId('all');
                          else if (sc === 'department') setTargetId(departments[0]?.id || '');
                          else setTargetId(screens[0]?.id || '');
                        }}
                        className={targetScope === sc ? 'btn btn-primary btn-sm' : 'btn btn-outline btn-sm'}
                      >
                        {sc === 'all' ? 'All TVs' : sc === 'department' ? 'Department' : 'Single Screen'}
                      </button>
                    ))}
                  </div>
                </div>

                {targetScope === 'department' && (
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Select Department</label>
                    <select
                      className="form-select"
                      value={targetId}
                      onChange={(e) => setTargetId(e.target.value)}
                      required
                    >
                      {departments.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name} ({d.code})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {targetScope === 'screen' && (
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Select Screen</label>
                    <select
                      className="form-select"
                      value={targetId}
                      onChange={(e) => setTargetId(e.target.value)}
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

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label className="form-label">Display Duration (seconds)</label>
                    <input
                      type="number"
                      className="form-input"
                      value={duration}
                      onChange={(e) => setDuration(Number(e.target.value))}
                      min={5}
                      max={180}
                      required
                    />
                  </div>

                  <div>
                    <label className="form-label">Interval (minutes)</label>
                    <input
                      type="number"
                      className="form-input"
                      value={intervalMinutes}
                      onChange={(e) => setIntervalMinutes(Number(e.target.value))}
                      min={1}
                      max={60}
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="form-label">Priority (1-100, Higher = Precedence)</label>
                  <input
                    type="range"
                    min={10}
                    max={100}
                    value={priority}
                    onChange={(e) => setPriority(Number(e.target.value))}
                    style={{ width: '100%', accentColor: 'var(--primary)' }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-secondary)' }}>
                    <span>Standard (50)</span>
                    <span style={{ fontWeight: 700, color: 'var(--primary)' }}>Current: {priority}</span>
                    <span>High (90)</span>
                  </div>
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => { setShowCreateModal(false); setEditingCampaign(null); }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary btn-sm"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Saving...' : editingCampaign ? 'Save Changes' : 'Publish Campaign'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
