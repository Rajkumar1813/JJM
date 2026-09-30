import React, { useState } from 'react';
import {
  ListVideo,
  Plus,
  Clock,
  Tv,
  Image as ImageIcon,
  Film,
  ArrowDown,
  Trash2,
  Edit2,
  CheckCircle2,
  ArrowUp,
  X,
  Layers,
  ChevronDown,
} from 'lucide-react';
import { Playlist, PlaylistItem, MediaItem } from '../types';
import { api } from '../services/api';

interface PlaylistsPageProps {
  playlists: Playlist[];
  media: MediaItem[];
  onRefresh: () => void;
}

export const PlaylistsPage: React.FC<PlaylistsPageProps> = ({
  playlists,
  media,
  onRefresh,
}) => {
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingPlaylist, setEditingPlaylist] = useState<Playlist | null>(null);

  // Form states
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isDefault, setIsDefault] = useState(false);
  const [items, setItems] = useState<PlaylistItem[]>([]);

  const openAddModal = () => {
    setName('');
    setDescription('');
    setIsDefault(false);
    // Default hospital sequence: Queue -> Ad -> Queue -> Video -> Queue
    setItems([
      {
        id: '1',
        type: 'queue',
        title: 'Doctor OPD Queue Display',
        duration: 20,
        order: 1,
      },
      {
        id: '2',
        type: 'image',
        title: media[0]?.title || 'Cardiology Health Notice',
        duration: 10,
        mediaId: media[0]?.id,
        mediaUrl: media[0]?.url,
        order: 2,
      },
      {
        id: '3',
        type: 'queue',
        title: 'Doctor OPD Queue Display',
        duration: 20,
        order: 3,
      },
      {
        id: '4',
        type: 'video',
        title: media.find((m) => m.type === 'video')?.title || 'Hospital Awareness Video',
        duration: 30,
        mediaId: media.find((m) => m.type === 'video')?.id,
        mediaUrl: media.find((m) => m.type === 'video')?.url,
        order: 4,
      },
    ]);
    setShowAddModal(true);
  };

  const openEditModal = (pl: Playlist) => {
    setEditingPlaylist(pl);
    setName(pl.name);
    setDescription(pl.description || '');
    setIsDefault(pl.isDefault);
    setItems(pl.items && pl.items.length ? [...pl.items] : []);
  };

  const handleAddItem = (type: 'queue' | 'image' | 'video') => {
    const newItem: PlaylistItem = {
      id: Date.now().toString(),
      type,
      title:
        type === 'queue'
          ? 'Doctor OPD Queue Display'
          : media[0]?.title || 'Hospital Slide Content',
      duration: type === 'queue' ? 20 : 15,
      mediaId: type !== 'queue' ? media[0]?.id : undefined,
      mediaUrl: type !== 'queue' ? media[0]?.url : undefined,
      order: items.length + 1,
    };
    setItems([...items, newItem]);
  };

  const handleRemoveItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    const newItems = [...items];
    const temp = newItems[index];
    newItems[index] = newItems[index - 1];
    newItems[index - 1] = temp;
    setItems(newItems);
  };

  const handleMoveDown = (index: number) => {
    if (index === items.length - 1) return;
    const newItems = [...items];
    const temp = newItems[index];
    newItems[index] = newItems[index + 1];
    newItems[index + 1] = temp;
    setItems(newItems);
  };

  const handleDurationChange = (index: number, val: number) => {
    setItems(items.map((it, i) => (i === index ? { ...it, duration: val } : it)));
  };

  const handleMediaChange = (index: number, mediaId: string) => {
    const m = media.find((item) => item.id === mediaId);
    setItems(
      items.map((it, i) =>
        i === index
          ? {
              ...it,
              mediaId: m?.id,
              mediaUrl: m?.url,
              title: m?.title || it.title,
            }
          : it
      )
    );
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingPlaylist) {
        await api.patch(`/playlists/${editingPlaylist.id}`, {
          name,
          description,
          isDefault,
          items,
        });
        setEditingPlaylist(null);
      } else {
        await api.post('/playlists', {
          name,
          description,
          isDefault,
          items,
        });
        setShowAddModal(false);
      }
      onRefresh();
    } catch (err: any) {
      alert(`Error saving playlist: ${err.message}`);
    }
  };

  const handleDelete = async (id: string, plName: string) => {
    if (!confirm(`Are you sure you want to delete playlist: "${plName}"?`)) return;
    try {
      await api.delete(`/playlists/${id}`);
      onRefresh();
    } catch (err: any) {
      alert(`Error deleting playlist: ${err.message}`);
    }
  };

  return (
    <div style={{ padding: '28px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Top Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--dark)' }}>
            Display Playlists
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Build visual sequence rotations interleaving doctor OPD queues with informational announcements and videos.
          </p>
        </div>

        <button className="btn btn-primary" onClick={openAddModal}>
          <Plus size={15} />
          <span>+ Create Playlist</span>
        </button>
      </div>

      {/* Playlist Cards List */}
      {playlists.length === 0 ? (
        <div className="card" style={{ padding: '40px', textAlign: 'center' }}>
          <ListVideo size={38} color="var(--text-muted)" style={{ margin: '0 auto 12px' }} />
          <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--dark)' }}>
            No Playlists Configured
          </h3>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px', maxWidth: '380px', margin: '4px auto 16px' }}>
            Configure a playback sequence to alternate OPD patient queue tokens with hospital medical slides.
          </p>
          <button className="btn btn-primary btn-sm" onClick={openAddModal}>
            <Plus size={14} />
            <span>Create First Sequence</span>
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {playlists.map((pl) => {
            const sequenceItems = pl.items && pl.items.length ? pl.items : [];
            const totalDuration = sequenceItems.reduce((acc, it) => acc + (it.duration || 15), 0);

            return (
              <div key={pl.id} className="card" style={{ padding: '20px' }}>
                {/* Header row */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
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
                      <ListVideo size={18} />
                    </div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--dark)' }}>
                          {pl.name}
                        </h3>
                        {pl.isDefault && (
                          <span className="badge badge-purple">
                            Default Fleet Sequence
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                        {pl.description || 'Continuous OPD Rotation'} • Total Cycle: {totalDuration}s
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      className="btn btn-outline btn-sm"
                      onClick={() => openEditModal(pl)}
                    >
                      <Edit2 size={13} />
                      <span>Edit Sequence</span>
                    </button>

                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => handleDelete(pl.id, pl.name)}
                      style={{ color: 'var(--danger)' }}
                      title="Delete Playlist"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {/* Visual Sequence Builder Diagram Blocks */}
                <div style={{ marginTop: '10px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '10px' }}>
                    Playback Cycle Flow ({sequenceItems.length} Steps)
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      overflowX: 'auto',
                      paddingBottom: '8px',
                    }}
                  >
                    {sequenceItems.map((item, idx) => {
                      const isQueue = item.type === 'queue';
                      const isVid = item.type === 'video';

                      return (
                        <React.Fragment key={item.id || idx}>
                          <div
                            style={{
                              flexShrink: 0,
                              minWidth: '150px',
                              padding: '12px',
                              borderRadius: 'var(--radius-sm)',
                              backgroundColor: isQueue ? 'var(--primary-subtle)' : '#FFFFFF',
                              border: `1px solid ${isQueue ? '#DFD3E7' : 'var(--border)'}`,
                              boxShadow: 'var(--shadow-subtle)',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                              <span
                                className={`badge ${
                                  isQueue ? 'badge-purple' : isVid ? 'badge-info' : 'badge-neutral'
                                }`}
                                style={{ fontSize: '9px', padding: '2px 5px' }}
                              >
                                {isQueue ? 'OPD Queue' : item.type}
                              </span>
                              <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                                {item.duration}s
                              </span>
                            </div>

                            <div
                              style={{
                                fontSize: '12px',
                                fontWeight: 600,
                                color: 'var(--dark)',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                              }}
                            >
                              {item.title}
                            </div>
                          </div>

                          {idx < sequenceItems.length - 1 && (
                            <span style={{ color: 'var(--text-muted)', fontSize: '14px', flexShrink: 0 }}>
                              ➔
                            </span>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add / Edit Playlist Modal */}
      {(showAddModal || editingPlaylist) && (
        <div className="modal-overlay" onClick={() => { setShowAddModal(false); setEditingPlaylist(null); }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '640px' }}>
            <div className="modal-header">
              <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--dark)' }}>
                {editingPlaylist ? 'Edit Playlist Sequence' : 'Create New Display Sequence'}
              </h3>
              <button
                className="btn-ghost"
                onClick={() => { setShowAddModal(false); setEditingPlaylist(null); }}
                style={{ padding: '4px' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSave}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Playlist Name</label>
                  <input
                    type="text"
                    className="form-input"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Standard OPD Daytime Rotation"
                    required
                  />
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Description</label>
                  <input
                    type="text"
                    className="form-input"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Short description..."
                  />
                </div>

                {/* Sequence Builder Blocks */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <label className="form-label" style={{ marginBottom: 0 }}>Sequence Steps ({items.length})</label>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => handleAddItem('queue')}
                      >
                        + Queue
                      </button>
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        onClick={() => handleAddItem('image')}
                      >
                        + Image
                      </button>
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        onClick={() => handleAddItem('video')}
                      >
                        + Video
                      </button>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '280px', overflowY: 'auto' }}>
                    {items.map((item, idx) => (
                      <div
                        key={item.id || idx}
                        style={{
                          padding: '10px 12px',
                          borderRadius: 'var(--radius-sm)',
                          backgroundColor: 'var(--bg-subtle)',
                          border: '1px solid var(--border)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                        }}
                      >
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <button
                            type="button"
                            className="btn-ghost"
                            onClick={() => handleMoveUp(idx)}
                            disabled={idx === 0}
                            style={{ padding: '2px' }}
                          >
                            <ArrowUp size={12} />
                          </button>
                          <button
                            type="button"
                            className="btn-ghost"
                            onClick={() => handleMoveDown(idx)}
                            disabled={idx === items.length - 1}
                            style={{ padding: '2px' }}
                          >
                            <ArrowDown size={12} />
                          </button>
                        </div>

                        <span className={`badge ${item.type === 'queue' ? 'badge-purple' : 'badge-neutral'}`}>
                          {item.type}
                        </span>

                        <div style={{ flex: 1 }}>
                          {item.type === 'queue' ? (
                            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--dark)' }}>
                              Doctor OPD Live Queue Display
                            </div>
                          ) : (
                            <select
                              className="form-select"
                              style={{ height: '34px', fontSize: '12px' }}
                              value={item.mediaId || ''}
                              onChange={(e) => handleMediaChange(idx, e.target.value)}
                            >
                              {media.map((m) => (
                                <option key={m.id} value={m.id}>
                                  {m.title} ({m.type.toUpperCase()})
                                </option>
                              ))}
                            </select>
                          )}
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <input
                            type="number"
                            className="form-input"
                            style={{ width: '60px', height: '34px', padding: '4px 6px', fontSize: '12px' }}
                            value={item.duration}
                            onChange={(e) => handleDurationChange(idx, Number(e.target.value))}
                            min={5}
                            max={300}
                          />
                          <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>sec</span>
                        </div>

                        <button
                          type="button"
                          className="btn-ghost"
                          onClick={() => handleRemoveItem(idx)}
                          style={{ padding: '4px', color: 'var(--danger)' }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => { setShowAddModal(false); setEditingPlaylist(null); }}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary btn-sm">
                  {editingPlaylist ? 'Save Changes' : 'Create Playlist'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
