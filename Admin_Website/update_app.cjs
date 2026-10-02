const fs = require('fs');

// Add useEffect to AuditLogs.tsx
let auditContent = fs.readFileSync('c:\\xampp\\htdocs\\JJM\\Admin_Website\\src\\pages\\AuditLogs.tsx', 'utf8');
auditContent = auditContent.replace("import React, { useState } from 'react';", "import React, { useState, useEffect } from 'react';");
fs.writeFileSync('c:\\xampp\\htdocs\\JJM\\Admin_Website\\src\\pages\\AuditLogs.tsx', auditContent);

// Update App.tsx
let appContent = fs.readFileSync('c:\\xampp\\htdocs\\JJM\\Admin_Website\\src\\App.tsx', 'utf8');

// 1. Remove state
appContent = appContent.replace(
  '  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);\n',
  ''
);

// 2. Remove from Promise.all
appContent = appContent.replace(
  '        const [resScreens, resDepts, resMedia, resPlay, resCamp, resAudit] = await Promise.all([\n          api.get(\'/screens\'),\n          api.get(\'/departments\'),\n          api.get(\'/media\'),\n          api.get(\'/playlists\'),\n          api.get(\'/campaigns\'),\n          api.get(\'/audit-logs\')\n        ]);',
  `        const [resScreens, resDepts, resMedia, resPlay, resCamp] = await Promise.all([
          api.get('/screens'),
          api.get('/departments'),
          api.get('/media'),
          api.get('/playlists'),
          api.get('/campaigns')
        ]);`
);

appContent = appContent.replace(
  '        if (resAudit.data.success) setAuditLogs(resAudit.data.auditLogs);',
  ''
);

// 3. Remove props passed to AuditLogsPage
appContent = appContent.replace(
  '<AuditLogsPage logs={auditLogs} />',
  '<AuditLogsPage />'
);

fs.writeFileSync('c:\\xampp\\htdocs\\JJM\\Admin_Website\\src\\App.tsx', appContent);
console.log('App.tsx and AuditLogs.tsx updated');
