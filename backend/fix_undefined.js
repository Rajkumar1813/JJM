const fs = require('fs');
const path = require('path');

const repoDir = 'c:\\xampp\\htdocs\\JJM\\backend\\src\\db\\repositories';
const files = fs.readdirSync(repoDir).filter(f => f.endsWith('.ts'));

for (const file of files) {
  const filePath = path.join(repoDir, file);
  let content = fs.readFileSync(filePath, 'utf8');

  // Replace getById type
  content = content.replace(/Promise<(.+?) \| undefined>/g, 'Promise<$1 | null>');
  // Replace return undefined
  content = content.replace(/return undefined;/g, 'return null;');

  fs.writeFileSync(filePath, content);
}
console.log('Fixed undefined -> null in repositories');
