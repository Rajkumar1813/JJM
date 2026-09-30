import { Server as SocketIOServer } from 'socket.io';
import http from 'http';
import { Logger } from '../services/logger';
import crypto from 'crypto';
import { isValidAdminToken } from '../middleware/auth.middleware';
import { screenRepo } from '../db/repositories/screenRepository';
import { healthMonitor } from '../services/healthMonitor';
import { commandService } from '../services/commandService';

let io: SocketIOServer | null = null;

export const initIO = (server: http.Server, isOriginAllowed: (origin: string | undefined) => boolean) => {
  io = new SocketIOServer(server, {
    cors: {
      origin: (origin, callback) => {
        callback(null, isOriginAllowed(origin));
      },
      methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      credentials: true,
    },
  });

  io.use(async (socket, next) => {
    try {
      const adminToken = socket.handshake.auth?.token || socket.handshake.headers?.['x-admin-token'];
      if (adminToken) {
        const user = await isValidAdminToken(adminToken);
        if (user) {
          (socket as any).adminUser = user;
          socket.join('admins');
          return next();
        }
      }

      const screenId = socket.handshake.auth?.screenId;
      const deviceToken = socket.handshake.auth?.deviceToken;

      if (screenId && deviceToken) {
        const screen = await screenRepo.getById(screenId);
        if (screen && screen.deviceToken) {
          const isMatch = crypto.timingSafeEqual(
            Buffer.from(deviceToken.padEnd(255)),
            Buffer.from(screen.deviceToken.padEnd(255))
          ) || deviceToken === screen.deviceToken;

          if (isMatch) {
            (socket as any).screen = screen;
            socket.join(`screen:${screenId}`);
            if (screen.departmentId) {
              socket.join(`dept:${screen.departmentId}`);
            }
            return next();
          }
        }
      }

      // Pairing fallback: if it's explicitly for pairing without auth. 
      // But pairing screens shouldn't just connect freely unless they join a specific room later.
      // Wait, pairing requires the socket to connect first.
      const isPairing = socket.handshake.auth?.isPairing;
      if (isPairing) {
        (socket as any).isPairing = true;
        return next();
      }

      return next(new Error('Authentication error'));
    } catch (e: any) {
      return next(new Error('Authentication error'));
    }
  });

  io.on('connection', (socket) => {
    Logger.info(`[Socket.IO] Client connected: ${socket.id}`);

    // Pairing join
    socket.on('pairing:join', (code: string) => {
      if ((socket as any).isPairing) {
        socket.join(`pairing:${code}`);
        Logger.info(`[Socket.IO] Socket ${socket.id} joined pairing:${code}`);
      }
    });

    socket.on('screen:register', async ({ screenId, appVersion, configVersion }: any) => {
      // Must be authenticated as a screen
      const screen = (socket as any).screen;
      if (screen && screen.id === screenId) {
        const now = new Date().toISOString();
        await screenRepo.update(screenId, {
          connectionStatus: 'online',
          healthStatus: 'ONLINE',
          lastHeartbeat: now,
          lastHeartbeatAt: now,
          playerVersion: appVersion || screen.playerVersion || '1.0.0',
          appliedConfigVersion: configVersion !== undefined ? Number(configVersion) : undefined,
        });
        io?.to('admins').emit('screen:status_change', { screenId, status: 'online', healthStatus: 'ONLINE' });
        io?.to('admins').emit('screens:changed');
      }
    });

    socket.on('screen:heartbeat', async ({
      screenId, currentContent, playerVersion, appliedConfigVersion,
      mediaManifestVersion, queueConnected, queueLastUpdateAt, deviceMetadata,
    }: any) => {
      const screen = (socket as any).screen;
      if (screen && screen.id === screenId) {
        // Record heartbeat first
        await screenRepo.recordHeartbeat(screenId, {
          appliedConfigVersion: appliedConfigVersion !== undefined ? Number(appliedConfigVersion) : undefined,
          mediaManifestVersion: mediaManifestVersion !== undefined ? Number(mediaManifestVersion) : undefined,
          currentContent: currentContent || 'queue',
          playerVersion: playerVersion || screen.playerVersion || '1.0.0',
          deviceMetadata,
          healthStatus: 'ONLINE', // temp
        });
        
        // Then re-evaluate
        const updatedScreen = await screenRepo.getById(screenId);
        if (updatedScreen) {
          const healthStatus = await healthMonitor.evaluateScreenHealth(updatedScreen as any, {
            queueConnected, queueLastUpdateAt, mediaManifestVersion,
          });
          if (healthStatus !== updatedScreen.healthStatus) {
            await screenRepo.update(screenId, { healthStatus });
          }

          io?.to('admins').emit('screen:heartbeat_received', {
            screenId, status: 'online', healthStatus,
            appliedConfigVersion, targetConfigVersion: updatedScreen.targetConfigVersion, currentContent,
          });
        }
      }
    });

    socket.on('screen:snapshot', async ({ screenId, image }: any) => {
      const screen = (socket as any).screen;
      if (screen && screen.id === screenId && image) {
        const now = new Date().toISOString();
        await screenRepo.saveSnapshot(screenId, image);
        io?.to('admins').emit('screen:snapshot_updated', { screenId, latestSnapshotTime: now });
      }
    });

    socket.on('command:received', async ({ commandId, screenId }: any) => {
      if (screenId === (socket as any).screen?.id && commandId) await commandService.handleReceived(commandId, screenId);
    });
    socket.on('command:applied', async ({ commandId, screenId }: any) => {
      if (screenId === (socket as any).screen?.id && commandId) await commandService.handleApplied(commandId, screenId);
    });
    socket.on('command:ack', async ({ commandId, screenId, resultPayload }: any) => {
      if (screenId === (socket as any).screen?.id && commandId) await commandService.handleAcknowledged(commandId, screenId, resultPayload);
    });
    socket.on('command:fail', async ({ commandId, screenId, errorMessage }: any) => {
      if (screenId === (socket as any).screen?.id && commandId) await commandService.handleFailed(commandId, screenId, errorMessage || 'Unknown error');
    });

    socket.on('disconnect', () => {
      Logger.info(`[Socket.IO] Client disconnected: ${socket.id}`);
    });
  });

  return io;
};

export const getIO = (): SocketIOServer => {
  if (!io) throw new Error('Socket.IO has not been initialized');
  return io;
};
