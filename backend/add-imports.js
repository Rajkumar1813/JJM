const fs = require('fs');

const files = [
  'src/routes/campaigns.routes.ts',
  'src/routes/emergency.routes.ts',
  'src/services/scheduler.ts'
];

files.forEach(f => {
  let c = fs.readFileSync(f, 'utf8');
  if (!c.includes('import { configPublisher }')) {
    fs.writeFileSync(f, "import { configPublisher } from '../services/configPublisher';\n" + c);
  }
});

console.log('Imports added');
