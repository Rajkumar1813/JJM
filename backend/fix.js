const fs = require('fs');
const path = require('path');

// Fix server.ts
let serverTs = fs.readFileSync('src/server.ts', 'utf8');
serverTs = serverTs.replace("import dotenv from 'dotenv';\ndotenv.config();\nimport 'express-async-errors';",
`import dotenv from 'dotenv';\ndotenv.config();\nimport { z } from 'zod';\nimport 'express-async-errors';\n
const envSchema = z.object({
  MONGODB_URI: z.string().min(1, "MONGODB_URI is required"),
  CORS_ORIGIN: z.string().min(1, "CORS_ORIGIN is required"),
});
try {
  envSchema.parse(process.env);
} catch (err) {
  if (err instanceof z.ZodError) {
    console.error('[CRITICAL] Invalid environment variables:');
    err.errors.forEach(e => console.error(\`  - \${e.path.join('.')}: \${e.message}\`));
  }
  process.exit(1);
}
`);
serverTs = serverTs.replace('export const io = initIO(server, isOriginAllowed);', 'initIO(server, isOriginAllowed);');
serverTs = serverTs.replace('startServer();', 'startServer().catch(err => {\n  Logger.error(`[CRITICAL] startServer failed: ${err.message}`, { stack: err.stack });\n  process.exit(1);\n});');
serverTs = serverTs.replace("process.on('uncaughtException', (err) => {\n  Logger.error(`[CRITICAL UNCAUGHT EXCEPTION] ${err.message}`, { stack: err.stack });\n});", "process.on('uncaughtException', (err) => {\n  Logger.error(`[CRITICAL UNCAUGHT EXCEPTION] ${err.message}`, { stack: err.stack });\n  process.exit(1);\n});");
fs.writeFileSync('src/server.ts', serverTs);

// Fix mongo.ts
let mongoTs = fs.readFileSync('src/db/mongo.ts', 'utf8');
mongoTs = mongoTs.replace('await client.connect();', `await client.connect();
    const adminDb = client.db().admin();
    const info = await adminDb.command({ hello: 1 });
    if (!info.setName) {
      Logger.error('[CRITICAL] MongoDB is not running as a replica set. Transactions require a replica set (e.g. Atlas or local mongod --replSet rs0).');
      process.exit(1);
    }`);
fs.writeFileSync('src/db/mongo.ts', mongoTs);

// Fix circular imports
function walk(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();
    isDirectory ? walk(dirPath, callback) : callback(path.join(dir, f));
  });
}

walk('src', (filePath) => {
  if (filePath.endsWith('.ts') && !filePath.endsWith('server.ts') && !filePath.endsWith('socket.ts')) {
    let content = fs.readFileSync(filePath, 'utf8');
    if (content.includes("import { io } from '../server'") || content.includes("import { io } from '../../server'")) {
      content = content.replace(/import\s*\{\s*io\s*\}\s*from\s*['"]\.\.\/server['"];?/g, "import { getIO } from '../realtime/socket';");
      content = content.replace(/import\s*\{\s*io\s*\}\s*from\s*['"]\.\.\/\.\.\/server['"];?/g, "import { getIO } from '../../realtime/socket';");
      
      content = content.replace(/\bio\./g, 'getIO().');
      fs.writeFileSync(filePath, content);
    }
  }
});
