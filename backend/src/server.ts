import dotenv from 'dotenv';
dotenv.config();
import { z } from 'zod';
import 'express-async-errors';
import fs from 'fs';
import crypto from 'crypto';
import path from 'path';

const pkgStr = fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8');
const pkgVersion = JSON.parse(pkgStr).version || '2.0.0-PROD';

const envSchema = z.object({
  MONGODB_URI: z.string().min(1, "MONGODB_URI is required"),
  CORS_ORIGIN: z.string().min(1, "CORS_ORIGIN is required"),
});
try {
  envSchema.parse(process.env);
} catch (err: any) {
  if (err instanceof z.ZodError) {
    console.error('[CRITICAL] Invalid environment variables:');
    (err as any).errors.forEach((e: any) => console.error(`  - ${e.path.join('.')}: ${e.message}`));
  }
  process.exit(1);
}


import express, { Request, Response, NextFunction } from 'express';
import http from 'http';
import cors from 'cors';
import helmet from 'helmet';

import { healthMonitor } from './services/healthMonitor';
import { Logger } from './services/logger';
import { commandService } from './services/commandService';
import { schedulerService } from './services/scheduler';

import authRouter from './routes/auth.routes';
import screensRouter from './routes/screens.routes';
import departmentsRouter from './routes/departments.routes';
import mediaRouter from './routes/media.routes';
import campaignsRouter from './routes/campaigns.routes';
import playlistsRouter from './routes/playlists.routes';
import displayRouter from './routes/display.routes';
import publicDisplayRouter from './routes/publicDisplay.routes';
import auditRouter from './routes/audit.routes';
import emergencyRouter from './routes/emergency.routes';
import settingsRouter from './routes/settings.routes';
import pairingRouter from './routes/pairing.routes';

import { initDbPool, getDb, closeDb } from './db/mongo';
import { runMigrations } from './db/migrate';
import { initIO } from './realtime/socket';
import { requireAdminAuth } from './middleware/auth.middleware';

const app = express();
const server = http.createServer(app);

const PORT = Number(process.env.PORT) || 5000;
const HOST = process.env.HOST || '0.0.0.0';

app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.disable('x-powered-by');
app.set('trust proxy', 1);

const ALLOWED_ORIGINS = process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',').map(s => s.trim()) : [];

const isOriginAllowed = (origin: string | undefined): boolean => {
  if (!origin) return true; // allow server-to-server or tools
  if (process.env.NODE_ENV !== 'production' && ALLOWED_ORIGINS.includes('*')) return true;
  if (ALLOWED_ORIGINS.includes('*') && process.env.NODE_ENV === 'production') {
    // strict rule: '*' forbidden in production
    return false;
  }
  const cleanOrigin = origin.replace(/\/+$/, '').toLowerCase();
  return ALLOWED_ORIGINS.some((o) => o.toLowerCase() === cleanOrigin);
};

const corsOptions: cors.CorsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    if (isOriginAllowed(origin)) {
      callback(null, true);
    } else {
      Logger.warn(`[CORS] Rejected origin: ${origin}`);
      callback(null, false);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-admin-token', 'X-Requested-With', 'Accept', 'Origin', 'X-Device-Token'],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
  maxAge: 86400,
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// Default body limit 1mb
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

app.use((req, res, next) => {
  const reqId = req.headers['x-request-id'] || crypto.randomUUID();
  res.setHeader('x-request-id', reqId);
  (req as any).id = reqId;
  Logger.info(`[Req] ${reqId} ${req.method} ${req.url}`);
  next();
});

// Init Socket.IO
initIO(server, isOriginAllowed);

// Routes
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '../uploads');
app.use('/uploads', cors(), express.static(UPLOAD_DIR, {
  setHeaders: (res) => { res.setHeader('Access-Control-Allow-Origin', '*'); },
}));

app.use('/api/auth', authRouter);
app.use('/api/public-display', publicDisplayRouter); // Uses displayKey query param
app.use('/api/display', displayRouter); // TV routes (uses device auth inside)
app.use('/api/pairing', pairingRouter); // Public pairing


app.use('/api/screens', requireAdminAuth, screensRouter);
app.use('/api/departments', requireAdminAuth, departmentsRouter);
app.use('/api/media', requireAdminAuth, mediaRouter);
app.use('/api/campaigns', requireAdminAuth, campaignsRouter);
app.use('/api/playlists', requireAdminAuth, playlistsRouter);
app.use('/api/audit-logs', requireAdminAuth, auditRouter);
app.use('/api/emergency', requireAdminAuth, emergencyRouter);
app.use('/api/settings', requireAdminAuth, settingsRouter);

app.get('/api/health', async (req, res) => {
  let dbStatus = 'down';
  try {
    const db = getDb();
    if (db) {
      await db.command({ ping: 1 });
      dbStatus = 'up';
    }
  } catch (err) {
    dbStatus = 'down';
  }
  
  if (dbStatus === 'down') {
    return res.status(503).json({
      status: 'error',
      db: 'down',
      version: pkgVersion,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  }

  res.json({
    status: 'ok',
    db: dbStatus,
    version: pkgVersion,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err.code === 11000) {
    Logger.error(`[Duplicate Key Error] ${req.method} ${req.url}: ${err.message}`);
    return res.status(409).json({
      success: false,
      message: 'Code or ID already exists',
    });
  }

  Logger.error(`[Unhandled Error] ${req.method} ${req.url}: ${err.message}`, { stack: err.stack });
  
  const isProd = process.env.NODE_ENV === 'production';
  res.status(err.status || 500).json({
    success: false,
    message: isProd ? 'Internal Hospital Control Server Error' : err.message || 'Internal Error',
  });
});

process.on('uncaughtException', (err) => {
  Logger.error(`[CRITICAL UNCAUGHT EXCEPTION] ${err.message}`, { stack: err.stack });
  process.exit(1);
});

process.on('unhandledRejection', (reason: any) => {
  Logger.error(`[UNHANDLED PROMISE REJECTION] ${reason?.message || reason}`);
});

async function startServer() {
  await initDbPool();
  await runMigrations();

  server.listen(PORT, HOST, () => {
    Logger.info(`=======================================================`);
    Logger.info(` JJM Hospital Queue & Signage Controller (MongoDB)     `);
    Logger.info(` Port: http://${HOST}:${PORT}                       `);
    Logger.info(` Health: http://${HOST}:${PORT}/api/health           `);
    Logger.info(` Environment: ${process.env.NODE_ENV || 'production'} `);
    Logger.info(`=======================================================`);
  });

  schedulerService.start();
}

startServer().catch(err => {
  Logger.error(`[CRITICAL] startServer failed: ${err.message}`, { stack: err.stack });
  process.exit(1);
});

const shutdown = async () => {
  schedulerService.stop();

  Logger.info('[System] Shutting down gracefully...');
  server.close(() => {
    Logger.info('[System] HTTP server closed.');
  });
  await closeDb();
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

export default server;
