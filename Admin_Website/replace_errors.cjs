const fs = require('fs');
const path = require('path');

function processDir(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      processDir(fullPath);
    } else if (fullPath.endsWith('.tsx') || fullPath.endsWith('.ts')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      let changed = false;
      
      const relativePath = path.relative(path.dirname(fullPath), path.join('c:\\xampp\\htdocs\\JJM\\Admin_Website\\src', 'utils')).replace(/\\/g, '/');
      const importPath = relativePath.startsWith('.') ? relativePath : './' + relativePath;

      if (content.includes('err.response?.data?.message || err.message')) {
        content = content.replace(/err\.response\?\.data\?\.message\s*\|\|\s*err\.message(\s*\|\|\s*'[^']*')?/g, 'getErrorMessage(err)');
        changed = true;
      }
      
      if (content.match(/\$\{err\.message\}/) || content.match(/err\.message/)) {
        content = content.replace(/\$\{err\.message\}/g, '${getErrorMessage(err)}');
        content = content.replace(/err\.message/g, 'getErrorMessage(err)');
        changed = true;
      }

      if (changed && content.includes('getErrorMessage') && !content.includes('import { getErrorMessage }')) {
         content = `import { getErrorMessage } from '${importPath}';\n` + content;
      }

      if (changed) {
        fs.writeFileSync(fullPath, content);
        console.log('Updated ' + fullPath);
      }
    }
  }
}

processDir('c:\\xampp\\htdocs\\JJM\\Admin_Website\\src');
