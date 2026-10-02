const fs = require('fs');

let content = fs.readFileSync('c:\\xampp\\htdocs\\JJM\\Admin_Website\\src\\pages\\AuditLogs.tsx', 'utf8');

// Replace props
content = content.replace(
  `interface AuditLogsPageProps {
  logs: AuditLog[];
}

export const AuditLogsPage: React.FC<AuditLogsPageProps> = ({ logs }) => {`,
  `import { api } from '../services/api';

interface AuditLogsPageProps {}

export const AuditLogsPage: React.FC<AuditLogsPageProps> = () => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const limit = 50;
`
);

// Add useEffect
content = content.replace(
  `  const actionTypes = Array.from(new Set(logs.map((l) => l.action)));`,
  `  const actionTypes = ['CREATE_SCREEN', 'PAIR_SCREEN', 'UPDATE_SCREEN', 'DELETE_SCREEN', 'ISSUE_COMMAND', 'CREATE_DEPARTMENT', 'UPDATE_DEPARTMENT', 'DELETE_DEPARTMENT', 'UPLOAD_MEDIA', 'DELETE_MEDIA', 'CREATE_PLAYLIST', 'UPDATE_PLAYLIST', 'DELETE_PLAYLIST', 'CREATE_CAMPAIGN', 'UPDATE_CAMPAIGN', 'DELETE_CAMPAIGN', 'BROADCAST_EMERGENCY', 'DISMISS_EMERGENCY'];

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
  }, [offset, limit, searchTerm, selectedAction]);`
);

// Remove local filtering logic
content = content.replace(
  `  const filteredLogs = logs.filter((log) => {
    const matchesSearch =
      log.details.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.entity.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.entityId.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesAction = selectedAction === 'all' || log.action === selectedAction;
    const matchesUser = selectedUser === 'all' || (log.userId || 'Admin') === selectedUser;

    return matchesSearch && matchesAction && matchesUser;
  });`,
  `  const filteredLogs = logs;`
);

// Reset offset on search
content = content.replace(
  `onChange={(e) => setSearchTerm(e.target.value)}`,
  `onChange={(e) => { setSearchTerm(e.target.value); setOffset(0); }}`
);

content = content.replace(
  `onChange={(e) => setSelectedAction(e.target.value)}`,
  `onChange={(e) => { setSelectedAction(e.target.value); setOffset(0); }}`
);

// Add pagination controls below table
const paginationHtml = `
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
`;

content = content.replace(
  `      </div>\n    </div>\n  );\n};`,
  `      </div>
${paginationHtml}
    </div>
  );
};`
);

fs.writeFileSync('c:\\xampp\\htdocs\\JJM\\Admin_Website\\src\\pages\\AuditLogs.tsx', content);
