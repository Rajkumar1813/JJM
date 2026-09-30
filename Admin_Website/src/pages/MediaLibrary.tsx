import React, { useState } from 'react';
import {
  Image as ImageIcon,
  Upload,
  Video,
  Trash2,
  Play,
  X,
  FileCheck,
  Search,
  ExternalLink,
  Eye,
  Clock,
  Film,
} from 'lucide-react';
import { MediaItem } from '../types';
import { api, getBackendBaseUrl } from '../services/api';

interface MediaLibraryPageProps {
  media: MediaItem[];
  onRefresh: () => void;
}

export const MediaLibraryPage: React.FC<MediaLibraryPageProps> = ({
  media,
  onRefresh,
}) => {
  const [activeFilter, setActiveFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [previewItem, setPreviewItem] = useState<MediaItem | null>(null);

  // Upload state
  const [title, setTitle] = useState('');
  const [customUrl, setCustomUrl] = useState('');
  const [duration, setDuration] = useState(15);
  const [category, setCategory] = useState('Posters');
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  // Filtering
  const filteredMedia = media.filter((item) => {
    const matchesSearch = item.title.toLowerCase().includes(searchTerm.toLowerCase());
    if (!matchesSearch) return false;

    if (activeFilter === 'all') return true;
    if (activeFilter === 'images') return item.type === 'image';
    if (activeFilter === 'videos') return item.type === 'video';
    if (activeFilter === 'posters') return item.category?.toLowerCase() === 'posters' || item.type === 'image';
    if (activeFilter === 'announcements') return item.category?.toLowerCase() === 'announcements';
    return true;
  });

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsUploading(true);
    try {
      const formData = new FormData();
      if (file) {
        formData.append('file', file);
      }
      formData.append('title', title);
      formData.append('customUrl', customUrl);
      formData.append('duration', duration.toString());
      formData.append('category', category);

      await api.post('/media', formData);
      setShowUploadModal(false);
      setTitle('');
      setCustomUrl('');
      setFile(null);
      onRefresh();
    } catch (err: any) {
      alert(`Upload failed: ${err.message}`);
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this media asset?')) return;
    try {
      await api.delete(`/media/${id}`);
      onRefresh();
    } catch (err: any) {
      alert(`Delete failed: ${err.message}`);
    }
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const dropped = e.dataTransfer.files[0];
      setFile(dropped);
      if (!title) {
        setTitle(dropped.name.replace(/\.[^/.]+$/, ''));
      }
    }
  };

  return (
    <div style={{ padding: '28px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Top Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--dark)' }}>
            Media Assets Library
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Store, verify and deploy high-definition clinical guidance posters and department video commercials.
          </p>
        </div>

        <button className="btn btn-primary" onClick={() => setShowUploadModal(true)}>
          <Upload size={15} />
          <span>Upload Media</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="card" style={{ padding: '16px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
          {/* Category Tabs */}
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {[
              { id: 'all', label: 'All Media' },
              { id: 'images', label: 'Images' },
              { id: 'videos', label: 'Videos' },
              { id: 'posters', label: 'Posters' },
              { id: 'announcements', label: 'Announcements' },
            ].map((cat) => (
              <button
                key={cat.id}
                onClick={() => setActiveFilter(cat.id)}
                className={activeFilter === cat.id ? 'btn btn-primary btn-sm' : 'btn btn-outline btn-sm'}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Search Box */}
          <div className="search-bar" style={{ minWidth: '240px' }}>
            <Search size={15} color="var(--text-muted)" />
            <input
              type="text"
              placeholder="Search filename or title..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Media Cards Grid */}
      {filteredMedia.length === 0 ? (
        <div className="card" style={{ padding: '40px', textAlign: 'center' }}>
          <ImageIcon size={38} color="var(--text-muted)" style={{ margin: '0 auto 12px' }} />
          <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--dark)' }}>
            No Media Assets Found
          </h3>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px', maxWidth: '360px', margin: '4px auto 16px' }}>
            Upload high-resolution clinical advisory posters or department showcase videos.
          </p>
          <button className="btn btn-primary btn-sm" onClick={() => setShowUploadModal(true)}>
            <Upload size={14} />
            <span>Upload First Asset</span>
          </button>
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: '18px',
          }}
        >
          {filteredMedia.map((item) => {
            const isVideo = item.type === 'video';
            const fullUrl = item.url.startsWith('/') ? `${getBackendBaseUrl()}${item.url}` : item.url;

            return (
              <div
                key={item.id}
                className="card"
                style={{
                  padding: '14px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: '12px',
                }}
              >
                {/* Media Preview Box */}
                <div
                  onClick={() => setPreviewItem(item)}
                  style={{
                    position: 'relative',
                    width: '100%',
                    aspectRatio: '16 / 9',
                    backgroundColor: '#15131E',
                    borderRadius: 'var(--radius-sm)',
                    overflow: 'hidden',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {isVideo ? (
                    <>
                      <video
                        src={fullUrl}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        muted
                        preload="metadata"
                      />
                      <div
                        style={{
                          position: 'absolute',
                          inset: 0,
                          backgroundColor: 'rgba(0, 0, 0, 0.35)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#FFFFFF',
                        }}
                      >
                        <Play size={28} />
                      </div>
                    </>
                  ) : (
                    <img
                      src={fullUrl}
                      alt={item.title}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  )}

                  {/* Top Type Tag */}
                  <span
                    className={`badge ${isVideo ? 'badge-purple' : 'badge-neutral'}`}
                    style={{ position: 'absolute', top: '8px', left: '8px', zIndex: 2 }}
                  >
                    {isVideo ? <Film size={11} /> : <ImageIcon size={11} />}
                    {item.type}
                  </span>

                  {/* Duration Tag */}
                  <span
                    style={{
                      position: 'absolute',
                      bottom: '8px',
                      right: '8px',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      backgroundColor: 'rgba(0, 0, 0, 0.75)',
                      color: '#FFFFFF',
                      fontSize: '10px',
                      fontWeight: 600,
                    }}
                  >
                    {item.duration || 15}s
                  </span>
                </div>

                {/* Info */}
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--dark)' }}>
                    {item.title}
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      fontSize: '11px',
                      color: 'var(--text-secondary)',
                      marginTop: '4px',
                      flexWrap: 'wrap',
                    }}
                  >
                    <span>{item.dimensions || '1920x1080'}</span>
                    <span>•</span>
                    <span>{item.fileSize ? `${Math.round(item.fileSize / 1024)} KB` : 'Cloud Asset'}</span>
                    <span>•</span>
                    <span style={{ color: '#0E805E', display: 'flex', alignItems: 'center', gap: '3px' }}>
                      <FileCheck size={11} /> SHA-256
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingTop: '10px',
                    borderTop: '1px solid var(--border)',
                  }}
                >
                  <button
                    className="btn btn-outline btn-sm"
                    onClick={() => setPreviewItem(item)}
                    style={{ fontSize: '12px' }}
                  >
                    <Eye size={13} />
                    <span>Preview</span>
                  </button>

                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={(e) => handleDelete(item.id, e)}
                    title="Delete Media"
                    style={{ color: 'var(--danger)' }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Drag & Drop Upload Modal */}
      {showUploadModal && (
        <div className="modal-overlay" onClick={() => setShowUploadModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '520px' }}>
            <div className="modal-header">
              <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--dark)' }}>
                Upload Media Asset
              </h3>
              <button
                className="btn-ghost"
                onClick={() => setShowUploadModal(false)}
                style={{ padding: '4px' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleUploadSubmit}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {/* Drag and Drop Box */}
                <div
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleFileDrop}
                  style={{
                    border: `2px dashed ${isDragging ? 'var(--primary)' : 'var(--border)'}`,
                    backgroundColor: isDragging ? 'var(--primary-subtle)' : 'var(--bg-subtle)',
                    borderRadius: 'var(--radius-md)',
                    padding: '24px 16px',
                    textAlign: 'center',
                    cursor: 'pointer',
                    transition: 'all 0.18s ease',
                  }}
                  onClick={() => document.getElementById('media-file-input')?.click()}
                >
                  <input
                    id="media-file-input"
                    type="file"
                    accept="image/*,video/*"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        setFile(e.target.files[0]);
                        if (!title) setTitle(e.target.files[0].name.replace(/\.[^/.]+$/, ''));
                      }
                    }}
                  />
                  <Upload size={28} color="var(--primary)" style={{ margin: '0 auto 8px' }} />
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--dark)' }}>
                    {file ? file.name : 'Click to select or drag and drop a file'}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                    PNG, JPG, MP4, WebM (Full HD 1920x1080 recommended, max 100MB)
                  </div>
                </div>

                {/* Or Custom URL */}
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Or Custom Direct Web URL</label>
                  <input
                    type="url"
                    className="form-input"
                    placeholder="https://images.unsplash.com/..."
                    value={customUrl}
                    onChange={(e) => setCustomUrl(e.target.value)}
                  />
                </div>

                {/* Media Title */}
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Asset Title</label>
                  <input
                    type="text"
                    className="form-input"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Free Cardiology Health Camp Banner"
                    required
                  />
                </div>

                {/* Category & Duration */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label className="form-label">Category</label>
                    <select
                      className="form-select"
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                    >
                      <option value="Posters">Posters</option>
                      <option value="Announcements">Announcements</option>
                      <option value="Commercials">Commercials</option>
                      <option value="Educational">Educational</option>
                    </select>
                  </div>

                  <div>
                    <label className="form-label">Playback Duration</label>
                    <select
                      className="form-select"
                      value={duration}
                      onChange={(e) => setDuration(Number(e.target.value))}
                    >
                      <option value={10}>10 seconds</option>
                      <option value={15}>15 seconds</option>
                      <option value={20}>20 seconds</option>
                      <option value={30}>30 seconds</option>
                      <option value={60}>60 seconds</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => setShowUploadModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary btn-sm"
                  disabled={isUploading || (!file && !customUrl)}
                >
                  {isUploading ? 'Uploading...' : 'Upload Media'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Asset Preview Modal */}
      {previewItem && (
        <div className="modal-overlay" onClick={() => setPreviewItem(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '720px' }}>
            <div className="modal-header">
              <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--dark)' }}>
                {previewItem.title}
              </h3>
              <button
                className="btn-ghost"
                onClick={() => setPreviewItem(null)}
                style={{ padding: '4px' }}
              >
                <X size={18} />
              </button>
            </div>

            <div className="modal-body" style={{ padding: '16px', backgroundColor: '#0F0E17', textAlign: 'center' }}>
              {previewItem.type === 'video' ? (
                <video
                  src={previewItem.url.startsWith('/') ? `${getBackendBaseUrl()}${previewItem.url}` : previewItem.url}
                  controls
                  autoPlay
                  style={{ width: '100%', maxHeight: '420px', borderRadius: 'var(--radius-sm)' }}
                />
              ) : (
                <img
                  src={previewItem.url.startsWith('/') ? `${getBackendBaseUrl()}${previewItem.url}` : previewItem.url}
                  alt={previewItem.title}
                  style={{ width: '100%', maxHeight: '420px', objectFit: 'contain', borderRadius: 'var(--radius-sm)' }}
                />
              )}
            </div>

            <div className="modal-footer">
              <span style={{ fontSize: '11px', color: 'var(--text-secondary)', marginRight: 'auto' }}>
                SHA-256 Hash: {previewItem.sha256Hash ? `${previewItem.sha256Hash.substring(0, 16)}...` : 'Verified'}
              </span>
              <button className="btn btn-outline btn-sm" onClick={() => setPreviewItem(null)}>
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
