import dotenv from 'dotenv';
dotenv.config();
import 'express-async-errors';

import express, { Request, Response, NextFunction } from 'express';
import http from 'http';
import cors from 'cors';
import path from 'path';
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

import { initDbPool, pool } from './db/mysql';
import { runMigrations } from './db/migrate';
import { initIO } from './realtime/socket';
import { requireAdminAuth } from './middleware/auth.middleware';

const app = express();
const server = http.createServer(app);

const PORT = Number(process.env.PORT) || 5000;
const HOST = process.env.HOST || '0.0.0.0';

app.use(helmet());
app.disable('x-powered-by');

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

// Init Socket.IO
export const io = initIO(server, isOriginAllowed);

// Routes
app.use('/uploads', cors(), express.static(path.join(__dirname, '../uploads'), {
  setHeaders: (res) => { res.setHeader('Access-Control-Allow-Origin', '*'); },
}));

app.use('/api/auth', authRouter);
app.use('/api/public-display', publicDisplayRouter); // Uses displayKey query param
app.use('/api/display', displayRouter); // TV routes (uses device auth inside)

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
    if (pool) {
      await pool.query('SELECT 1');
      dbStatus = 'up';
    }
  } catch (err) {
    dbStatus = 'down';
  }
  res.json({
    status: 'ok',
    db: dbStatus,
    version: '2.0.0-PROD',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  Logger.error(`[Unhandled Error] ${req.method} ${req.url}: ${err.message}`, { stack: err.stack });
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal Hospital Control Server Error',
  });
});

process.on('uncaughtException', (err) => {
  Logger.error(`[CRITICAL UNCAUGHT EXCEPTION] ${err.message}`, { stack: err.stack });
});

process.on('unhandledRejection', (reason: any) => {
  Logger.error(`[UNHANDLED PROMISE REJECTION] ${reason?.message || reason}`);
});

async function startServer() {
  initDbPool();

  let retries = 10;
  while (retries > 0) {
    try {
      await pool.query('SELECT 1');
      Logger.info('[Database] Connected to MySQL successfully.');
      break;
    } catch (err: any) {
      retries--;
      Logger.warn(`[Database] Connection failed. Retries left: ${retries}. Error: ${err.message}`);
      if (retries === 0) {
        Logger.error('[Database] Could not connect to database after maximum retries. Exiting.');
        process.exit(1);
      }
      await new Promise(res => setTimeout(res, 3000));
    }
  }

  await runMigrations();

  server.listen(PORT, HOST, () => {
    Logger.info(`=======================================================`);
    Logger.info(` JJM Hospital Queue & Signage Controller (MySQL V2)    `);
    Logger.info(` Port: http://${HOST}:${PORT}                       `);
    Logger.info(` Health: http://${HOST}:${PORT}/api/health           `);
    Logger.info(` Environment: ${process.env.NODE_ENV || 'production'} `);
    Logger.info(`=======================================================`);
  });

  schedulerService.start();
}

startServer();

const shutdown = async () => {
  schedulerService.stop();

  Logger.info('[System] Shutting down gracefully...');
  server.close(() => {
    Logger.info('[System] HTTP server closed.');
  });
  if (pool) {
    await pool.end();
    Logger.info('[System] Database pool closed.');
  }
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

export default server;
