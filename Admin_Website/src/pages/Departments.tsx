import React, { useState } from 'react';
import {
  Building2,
  Plus,
  Edit2,
  Trash2,
  ExternalLink,
  Tv,
  ListVideo,
  Clock,
  User,
  X,
  Sliders,
  CheckCircle2,
} from 'lucide-react';
import { Department } from '../types';
import { api } from '../services/api';

interface DepartmentsPageProps {
  departments: Department[];
  onRefresh: () => void;
}

export const DepartmentsPage: React.FC<DepartmentsPageProps> = ({
  departments,
  onRefresh,
}) => {
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingDept, setEditingDept] = useState<Department | null>(null);
  const [selectedDeptDetail, setSelectedDeptDetail] = useState<Department | null>(null);

  // Form states for Add/Edit
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [floor, setFloor] = useState('');
  const [description, setDescription] = useState('');
  const [defaultQueueUrl, setDefaultQueueUrl] = useState('');
  const [loading, setLoading] = useState(false);

  const openAddModal = () => {
    setName('');
    setCode('');
    setFloor('');
    setDescription('');
    setDefaultQueueUrl('');
    setShowAddModal(true);
  };

  const openEditModal = (dept: Department, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingDept(dept);
    setName(dept.name);
    setCode(dept.code);
    setFloor(dept.floor || '');
    setDescription(dept.description || '');
    setDefaultQueueUrl(dept.defaultQueueUrl || '');
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post('/departments', {
        name,
        code,
        floor,
        description,
        defaultQueueUrl,
      });
      setShowAddModal(false);
      onRefresh();
    } catch (err: any) {
      alert(`Error creating department: ${err.response?.data?.message || err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDept) return;
    setLoading(true);
    try {
      await api.patch(`/departments/${editingDept.id}`, {
        name,
        code,
        floor,
        description,
        defaultQueueUrl,
      });
      setEditingDept(null);
      onRefresh();
    } catch (err: any) {
      alert(`Error updating department: ${err.response?.data?.message || err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string, deptName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Are you sure you want to delete department: ${deptName}?`)) return;
    try {
      await api.delete(`/departments/${id}`);
      onRefresh();
    } catch (err: any) {
      alert(`Error deleting department: ${err.response?.data?.message || err.message}`);
    }
  };

  return (
    <div style={{ padding: '28px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Top Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--dark)' }}>
            Hospital Departments
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Manage medical divisions, assigned specialist doctors, queue URLs, and dedicated TV screens.
          </p>
        </div>

        <button className="btn btn-primary" onClick={openAddModal}>
          <Plus size={15} />
          <span>+ Add Department</span>
        </button>
      </div>

      {/* Department Cards Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
          gap: '18px',
        }}
      >
        {departments.map((dept) => {
          return (
            <div
              key={dept.id}
              className="card"
              onClick={() => setSelectedDeptDetail(dept)}
              style={{
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                gap: '14px',
                padding: '20px',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
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
                      <Building2 size={18} />
                    </div>
                    <div>
                      <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--dark)', textTransform: 'uppercase' }}>
                        {dept.name}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                        {dept.floor || 'N/A'} • Code: {dept.code}
                      </div>
                    </div>
                  </div>

                  <span className="badge badge-online">
                    <span className="status-dot online" />
                    Active
                  </span>
                </div>

                {/* Doctor & Details Box */}
                <div
                  style={{
                    margin: '14px 0 0',
                    padding: '12px',
                    backgroundColor: 'var(--bg-main)',
                    borderRadius: 'var(--radius-sm)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                    fontSize: '12px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <User size={14} color="var(--primary)" />
                    <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>Assigned</span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}>
                    <span>Assigned TVs:</span>
                    <span style={{ fontWeight: 600, color: 'var(--dark)' }}>{(dept as any).screenCount || 0} Connected</span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}>
                    <span>Queue Status:</span>
                    <span style={{ fontWeight: 600, color: dept.defaultQueueUrl ? '#0E805E' : 'var(--text-muted)' }}>{dept.defaultQueueUrl ? 'Active' : 'Unset'}</span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}>
                    <span>Active Playlist:</span>
                    <span style={{ fontWeight: 600, color: 'var(--primary)' }}>{dept.defaultPlaylistId || 'None'}</span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
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
                    onClick={(e) => openEditModal(dept, e)}
                    title="Edit Department"
                  >
                    <Edit2 size={13} />
                  </button>

                  <button
                    className="btn btn-outline btn-sm"
                    onClick={(e) => handleDelete(dept.id, dept.name, e)}
                    title="Delete Department"
                  >
                    <Trash2 size={13} color="var(--danger)" />
                  </button>
                </div>

                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => setSelectedDeptDetail(dept)}
                >
                  <Sliders size={13} />
                  <span>Manage</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Department Detail Modal / Drawer */}
      {selectedDeptDetail && (
        <div className="modal-overlay" onClick={() => setSelectedDeptDetail(null)}>
          <div
            className="modal-content"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '600px' }}
          >
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Building2 size={20} color="var(--primary)" />
                <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--dark)' }}>
                  {selectedDeptDetail.name} — Department Detail
                </h3>
              </div>
              <button
                className="btn-ghost"
                onClick={() => setSelectedDeptDetail(null)}
                style={{ padding: '4px' }}
              >
                <X size={18} />
              </button>
            </div>

            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div
                style={{
                  padding: '14px',
                  backgroundColor: 'var(--bg-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                  fontSize: '13px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Department Code:</span>
                  <span style={{ fontWeight: 600, color: 'var(--dark)' }}>{selectedDeptDetail.code}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Floor Location:</span>
                  <span style={{ fontWeight: 600, color: 'var(--dark)' }}>{selectedDeptDetail.floor || 'N/A'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Specialist Doctor:</span>
                  <span style={{ fontWeight: 600, color: 'var(--dark)' }}>Assigned</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Assigned Playlist:</span>
                  <span style={{ fontWeight: 600, color: 'var(--primary)' }}>{selectedDeptDetail.defaultPlaylistId || 'None'}</span>
                </div>
              </div>

              <div>
                <label className="form-label">Doctor OPD Queue URL</label>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 12px',
                    backgroundColor: '#FFFFFF',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '12px',
                  }}
                >
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {selectedDeptDetail.defaultQueueUrl || 'No queue URL configured.'}
                  </span>
                  {selectedDeptDetail.defaultQueueUrl && (
                    <a
                      href={selectedDeptDetail.defaultQueueUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-outline btn-sm"
                      style={{ padding: '3px 8px', fontSize: '11px', flexShrink: 0, marginLeft: '8px' }}
                    >
                      <span>Visit</span>
                      <ExternalLink size={11} />
                    </a>
                  )}
                </div>
              </div>

              <div>
                <label className="form-label">Assigned Screen Displays</label>
                <div style={{ padding: '10px', backgroundColor: 'var(--bg-main)', borderRadius: 'var(--radius-sm)', fontSize: '12px', color: 'var(--text-secondary)' }}>
                  { (selectedDeptDetail as any).screens?.length > 0 ? (
                    <ul style={{ margin: 0, paddingLeft: '16px' }}>
                      {(selectedDeptDetail as any).screens.map((s: any) => (
                        <li key={s.id}>{s.name} ({s.location})</li>
                      ))}
                    </ul>
                  ) : (
                    'No screens are currently assigned to this department.'
                  )}
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button
                className="btn btn-outline btn-sm"
                onClick={() => setSelectedDeptDetail(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit Department Modal */}
      {(showAddModal || editingDept) && (
        <div className="modal-overlay" onClick={() => { setShowAddModal(false); setEditingDept(null); }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '480px' }}>
            <div className="modal-header">
              <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--dark)' }}>
                {editingDept ? 'Edit Department' : 'Add New Department'}
              </h3>
              <button
                className="btn-ghost"
                onClick={() => { setShowAddModal(false); setEditingDept(null); }}
                style={{ padding: '4px' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={editingDept ? handleUpdate : handleCreate}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Department Name</label>
                  <input
                    type="text"
                    className="form-input"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Enter department name"
                    required
                  />
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Department Code</label>
                  <input
                    type="text"
                    className="form-input"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="Enter unique code"
                    required
                  />
                </div>
                

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Floor Location</label>
                  <input
                    type="text"
                    className="form-input"
                    value={floor}
                    onChange={(e) => setFloor(e.target.value)}
                    placeholder="Enter floor location"
                    required
                  />
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Doctor OPD Queue URL</label>
                  <input
                    type="url"
                    className="form-input"
                    value={defaultQueueUrl}
                    onChange={(e) => setDefaultQueueUrl(e.target.value)}
                    placeholder="https://..."
                  />
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Description (Optional)</label>
                  <textarea
                    className="form-textarea"
                    rows={2}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Brief description of the department..."
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => { setShowAddModal(false); setEditingDept(null); }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary btn-sm"
                  disabled={loading}
                >
                  {loading ? 'Saving...' : editingDept ? 'Save Changes' : 'Create Department'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
