const fs = require('fs');

let content = fs.readFileSync('c:\\xampp\\htdocs\\JJM\\Admin_Website\\src\\components\\PairScreenModal.tsx', 'utf8');

// 1. Remove hardcoded fallback in payload
content = content.replace(
  `        departmentId: departmentId || (departments[0]?.id || 'DEP-OPD'),
        location: location.trim() || 'Hospital OPD Clinic',`,
  `        departmentId: departmentId || departments[0]?.id,
        location: location.trim(),`
);

// 2. Wrap form body with departments check
content = content.replace(
  '        <form onSubmit={handleSubmit}>\n          <div className="modal-body" style={{ display: \'flex\', flexDirection: \'column\', gap: \'14px\' }}>',
  `        {departments.length === 0 ? (
          <div className="modal-body" style={{ textAlign: 'center', padding: '40px 20px' }}>
            <AlertCircle size={48} color="#EF5A7C" style={{ margin: '0 auto 16px' }} />
            <h4 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--dark)' }}>No Departments Found</h4>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '8px' }}>
              You must create at least one department in the Departments tab before you can pair a screen.
            </p>
            <button className="btn btn-primary" onClick={onClose} style={{ marginTop: '20px' }}>
              Close
            </button>
          </div>
        ) : (
        <form onSubmit={handleSubmit}>
          <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>`
);

content = content.replace(
  '            </div>\n          </div>\n\n          <div className="modal-footer">',
  `            </div>
          </div>

          <div className="modal-footer">`
);

// We need to close the ternary we opened. The </form> is around line 240.
// Let's replace </form> with </form>}
content = content.replace(
  '        </form>\n      </div>\n    </div>\n  );\n};',
  '        </form>\n        )}\n      </div>\n    </div>\n  );\n};'
);

// Add required attribute for location
content = content.replace(
  'onChange={(e) => setLocation(e.target.value)}\n                placeholder="e.g. Waiting Area 1"\n              />',
  'onChange={(e) => setLocation(e.target.value)}\n                placeholder="e.g. Waiting Area 1"\n                required\n              />'
);

fs.writeFileSync('c:\\xampp\\htdocs\\JJM\\Admin_Website\\src\\components\\PairScreenModal.tsx', content);
