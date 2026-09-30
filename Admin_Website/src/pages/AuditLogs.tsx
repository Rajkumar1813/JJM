import React, { useState } from 'react';
import { FileText, Clock, Search, Filter, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { AuditLog } from '../types';

interface AuditLogsPageProps {
  logs: AuditLog[];
}

export const AuditLogsPage: React.FC<AuditLogsPageProps> = ({ logs }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAction, setSelectedAction] = useState<string>('all');
  const [selectedUser, setSelectedUser] = useState<string>('all');

  const actionTypes = Array.from(new Set(logs.map((l) => l.action)));

  const filteredLogs = logs.filter((log) => {
    const matchesSearch =
      log.details.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.entity.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.entityId.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesAction = selectedAction === 'all' || log.action === selectedAction;
    const matchesUser = selectedUser === 'all' || (log.userId || 'Admin') === selectedUser;

    return matchesSearch && matchesAction && matchesUser;
  });

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
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <select
              className="form-select"
              style={{ width: 'auto', minWidth: '150px' }}
              value={selectedAction}
              onChange={(e) => setSelectedAction(e.target.value)}
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
    </div>
  );
};
