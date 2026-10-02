const fs = require('fs');

let content = fs.readFileSync('c:\\xampp\\htdocs\\JJM\\Admin_Website\\src\\pages\\Campaigns.tsx', 'utf8');

// 1. Add state variables
content = content.replace(
  'const [daysOfWeek, setDaysOfWeek] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);',
  `const [daysOfWeek, setDaysOfWeek] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');`
);

// 2. Initialize in openCreateModal
content = content.replace(
  'setDaysOfWeek([0, 1, 2, 3, 4, 5, 6]);',
  `setDaysOfWeek([0, 1, 2, 3, 4, 5, 6]);
    setStartDate('');
    setEndDate('');
    setStartTime('');
    setEndTime('');`
);

// 3. Initialize in openEditModal
content = content.replace(
  'setDaysOfWeek(c.daysOfWeek?.length ? c.daysOfWeek : [0, 1, 2, 3, 4, 5, 6]);',
  `setDaysOfWeek(c.daysOfWeek?.length ? c.daysOfWeek : [0, 1, 2, 3, 4, 5, 6]);
    setStartDate(c.startDate || '');
    setEndDate(c.endDate || '');
    setStartTime(c.startTime || '');
    setEndTime(c.endTime || '');`
);

// 4. Validation in handleSaveCampaign
content = content.replace(
  'const isVideo = selectedMedia?.type === \'video\';',
  `const isVideo = selectedMedia?.type === 'video';

      if (startDate && endDate && startDate > endDate) {
        alert('End date cannot be before start date.');
        setIsSubmitting(false);
        return;
      }
      if (startTime && !endTime) {
        alert('End time is required if start time is provided.');
        setIsSubmitting(false);
        return;
      }
      if (!startTime && endTime) {
        alert('Start time is required if end time is provided.');
        setIsSubmitting(false);
        return;
      }
      if (startTime && endTime && startTime >= endTime) {
        alert('End time must be after start time.');
        setIsSubmitting(false);
        return;
      }
      if (daysOfWeek.length === 0) {
        alert('Please select at least one day of the week.');
        setIsSubmitting(false);
        return;
      }`
);

// 5. Payload in PATCH
content = content.replace(
  '          intervalMinutes: Number(intervalMinutes),',
  `          intervalMinutes: Number(intervalMinutes),
          startDate: startDate || undefined,
          endDate: endDate || undefined,
          startTime: startTime || undefined,
          endTime: endTime || undefined,`
);

// 6. Payload in POST
content = content.replace(
  '          intervalMinutes: Number(intervalMinutes),\n          daysOfWeek: [0, 1, 2, 3, 4, 5, 6],',
  `          intervalMinutes: Number(intervalMinutes),
          daysOfWeek,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
          startTime: startTime || undefined,
          endTime: endTime || undefined,`
);
content = content.replace(
  '          daysOfWeek: [0, 1, 2, 3, 4, 5, 6],', // The patch one
  '          daysOfWeek,'
);

// 7. Update handleDuplicate
content = content.replace(
  '        mediaId: c.mediaId,\n        mediaUrl: c.mediaUrl,\n        targetIds: c.targetIds,\n        priority: c.priority,\n        displayDurationSeconds: c.displayDurationSeconds,\n        intervalMinutes: c.intervalMinutes,\n        daysOfWeek: c.daysOfWeek || [1, 2, 3, 4, 5, 6, 7],\n        status: \'draft\',',
  `        mediaId: c.mediaId,
        mediaUrl: c.mediaUrl,
        playlistId: c.playlistId,
        targetIds: c.targetIds,
        priority: c.priority,
        displayDurationSeconds: c.displayDurationSeconds,
        intervalMinutes: c.intervalMinutes,
        daysOfWeek: c.daysOfWeek || [0, 1, 2, 3, 4, 5, 6],
        status: 'paused',`
);

// 8. Add Form Fields to JSX
const formFields = `
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '12px' }}>
                  <div>
                    <label className="form-label">Start Date</label>
                    <input type="date" className="form-input" value={startDate} onChange={e => setStartDate(e.target.value)} />
                  </div>
                  <div>
                    <label className="form-label">End Date</label>
                    <input type="date" className="form-input" value={endDate} onChange={e => setEndDate(e.target.value)} />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '12px' }}>
                  <div>
                    <label className="form-label">Start Time</label>
                    <input type="time" className="form-input" value={startTime} onChange={e => setStartTime(e.target.value)} />
                  </div>
                  <div>
                    <label className="form-label">End Time</label>
                    <input type="time" className="form-input" value={endTime} onChange={e => setEndTime(e.target.value)} />
                  </div>
                </div>
                <div style={{ marginTop: '12px', marginBottom: '12px' }}>
                  <label className="form-label">Active Days of Week</label>
                  <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, idx) => (
                      <button
                        key={idx}
                        type="button"
                        className={daysOfWeek.includes(idx) ? 'btn btn-primary btn-sm' : 'btn btn-outline btn-sm'}
                        onClick={() => {
                          if (daysOfWeek.includes(idx)) {
                            setDaysOfWeek(daysOfWeek.filter(d => d !== idx));
                          } else {
                            setDaysOfWeek([...daysOfWeek, idx].sort());
                          }
                        }}
                      >
                        {day}
                      </button>
                    ))}
                  </div>
                </div>
`;

content = content.replace(
  '<div style={{ display: \'grid\', gridTemplateColumns: \'1fr 1fr\', gap: \'12px\' }}>',
  formFields + '\n                <div style={{ display: \'grid\', gridTemplateColumns: \'1fr 1fr\', gap: \'12px\' }}>'
);

fs.writeFileSync('c:\\xampp\\htdocs\\JJM\\Admin_Website\\src\\pages\\Campaigns.tsx', content);
console.log('Campaigns.tsx updated');
