import React, { useState, useEffect } from 'react';
import { FileText, Clock, Search, Filter, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { AuditLog } from '../types';

import { api } from '../services/api';

interface AuditLogsPageProps {}

export const AuditLogsPage: React.FC<AuditLogsPageProps> = () => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const limit = 50;

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAction, setSelectedAction] = useState<string>('all');
  const [selectedUser, setSelectedUser] = useState<string>('all');

  const actionTypes = ['CREATE_SCREEN', 'PAIR_SCREEN', 'UPDATE_SCREEN', 'DELETE_SCREEN', 'ISSUE_COMMAND', 'CREATE_DEPARTMENT', 'UPDATE_DEPARTMENT', 'DELETE_DEPARTMENT', 'UPLOAD_MEDIA', 'DELETE_MEDIA', 'CREATE_PLAYLIST', 'UPDATE_PLAYLIST', 'DELETE_PLAYLIST', 'CREATE_CAMPAIGN', 'UPDATE_CAMPAIGN', 'DELETE_CAMPAIGN', 'BROADCAST_EMERGENCY', 'DISMISS_EMERGENCY'];

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const res = await api.get('/audit-logs', {
          params: {
            offset,
            limit,
            search: searchTerm || undefined,
            action: selectedAction !== 'all' ? selectedAction : undefined,
          }
        });
        if (res.data.success) {
          setLogs(res.data.auditLogs);
          setTotal(res.data.total);
        }
      } catch (err) {
        console.error('Failed to fetch audit logs', err);
      }
    };
    
    const debounce = setTimeout(fetchLogs, 300);
    return () => clearTimeout(debounce);
  }, [offset, limit, searchTerm, selectedAction]);

  const filteredLogs = logs;

  return (
    <div style={{ padding: '28px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Header */}
      <div>
        <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--dark)' }}>
          Hospital Audit Trail & Activity Logs
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
          Immutable operational log tracking TV pairings, emergency broadcasts, priority overrides, and queue updates.
        </p>
      </div>

      {/* Filter and Search Bar */}
      <div className="card" style={{ padding: '16px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
          <div className="search-bar" style={{ minWidth: '260px', flex: '1 1 260px' }}>
            <Search size={15} color="var(--text-muted)" />
            <input
              type="text"
              placeholder="Search audit trail, entity ID, or operation details..."
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setOffset(0); }}
            />
          </div>

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <select
              className="form-select"
              style={{ width: 'auto', minWidth: '150px' }}
              value={selectedAction}
              onChange={(e) => { setSelectedAction(e.target.value); setOffset(0); }}
            >
              <option value="all">All Actions</option>
              {actionTypes.map((act) => (
                <option key={act} value={act}>
                  {act}
                </option>
              ))}
            </select>

            <select
              className="form-select"
              style={{ width: 'auto', minWidth: '130px' }}
              value={selectedUser}
              onChange={(e) => setSelectedUser(e.target.value)}
            >
              <option value="all">All Operators</option>
              <option value="Admin">Admin</option>
              <option value="System">System / Engine</option>
            </select>
          </div>
        </div>
      </div>

      {/* Audit Log Table */}
      <div className="table-container">
        <table className="table">
          <thead>
            <tr>
              <th>Time</th>
              <th>User</th>
              <th>Action</th>
              <th>Target / Entity</th>
              <th>Department</th>
              <th>Status</th>
              <th>Operation Details</th>
            </tr>
          </thead>
          <tbody>
            {filteredLogs.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)' }}>
                  No audit trail records matching filters
                </td>
              </tr>
            ) : (
              filteredLogs.map((log) => {
                const dateObj = new Date(log.timestamp);
                const timeString = isNaN(dateObj.getTime())
                  ? log.timestamp
                  : dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                const dateString = isNaN(dateObj.getTime())
                  ? ''
                  : dateObj.toLocaleDateString();

                return (
                  <tr key={log.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <div style={{ fontWeight: 600, color: 'var(--dark)' }}>{timeString}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{dateString}</div>
                    </td>

                    <td>
                      <span className="badge badge-neutral">
                        {log.userId || 'Admin'}
                      </span>
                    </td>

                    <td>
                      <span className="badge badge-purple">
                        {log.action}
                      </span>
                    </td>

                    <td>
                      <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>{log.entity}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                        {log.entityId}
                      </div>
                    </td>

                    <td>
                      <span style={{ color: 'var(--text-secondary)' }}>
                        {log.entity.includes('DEP') || log.entityId.includes('DEP') ? 'OPD Department' : 'Hospital-wide'}
                      </span>
                    </td>

                    <td>
                      <span className="badge badge-online">
                        <span className="status-dot online" />
                        Success
                      </span>
                    </td>

                    <td style={{ color: 'var(--text-secondary)', maxWidth: '300px' }}>
                      {log.details}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px' }}>
        <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
          Showing {logs.length > 0 ? offset + 1 : 0} to {Math.min(offset + limit, total)} of {total} records
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button 
            className="btn btn-outline btn-sm" 
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - limit))}
          >
            Previous
          </button>
          <button 
            className="btn btn-outline btn-sm" 
            disabled={offset + limit >= total}
            onClick={() => setOffset(offset + limit)}
          >
            Next
          </button>
        </div>
      </div>

    </div>
  );
};
