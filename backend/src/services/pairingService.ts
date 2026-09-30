import { v4 as uuidv4 } from 'uuid';
import { pairingRepo, auditRepo } from '../db/repositories/miscRepositories';
import { screenRepo } from '../db/repositories/screenRepository';
import { deviceRepo } from '../db/repositories/deviceRepository';
import { PairingSession, Screen } from '../types';

export class PairingService {
  public async createPairingSession(socketId?: string, deviceMetadata?: Record<string, any>): Promise<PairingSession> {
    const pairingCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 15 * 60 * 1000;

    const session: PairingSession = {
      pairingCode,
      socketId,
      expiresAt,
      status: 'pending',
      deviceMetadata,
      createdAt: new Date().toISOString(),
    };

    await pairingRepo.save(session);
    return session;
  }

  public async pairScreen(
    pairingCode: string,
    data: {
      name: string;
      code?: string;
      departmentId: string;
      location: string;
      queueUrl: string;
      staleThresholdSeconds?: number;
    }
  ): Promise<{ screen: Screen; session: PairingSession }> {
    const session = await pairingRepo.get(pairingCode);
    if (!session) {
      throw new Error('Invalid or expired pairing code');
    }

    if (session.status !== 'pending' || session.expiresAt < Date.now()) {
      throw new Error('Pairing code has expired or is already used');
    }

    const rawCode = data.code?.replace(/^SCR-/i, '') || Math.floor(100 + Math.random() * 900).toString();
    const screenCode = rawCode;
    const screenId = data.code?.startsWith('SCR-') ? data.code : `SCR-${rawCode}`;
    const deviceToken = `DEV-${uuidv4()}`;
    const deviceId = `HW-${uuidv4().substring(0, 8).toUpperCase()}`;

    const meta = session.deviceMetadata || {};
    await deviceRepo.upsert({
      id: deviceId,
      deviceToken,
      platform: meta.platform || 'Android TV',
      model: meta.model || 'Hospital Smart TV',
      appVersion: meta.version || '1.0.0',
      ipAddress: meta.ipAddress,
    });

    let screen = await screenRepo.getById(screenId);
    if (screen) {
      screen = (await screenRepo.update(screenId, {
        name: data.name,
        departmentId: data.departmentId,
        deviceId,
        location: data.location,
        queueUrl: data.queueUrl,
        staleThresholdSeconds: data.staleThresholdSeconds || screen.staleThresholdSeconds || 180,
        deviceToken,
        connectionStatus: 'online',
        healthStatus: 'ONLINE',
        lastHeartbeat: new Date().toISOString(),
        lastHeartbeatAt: new Date().toISOString(),
        status: 'active',
      }))!;
    } else {
      screen = await screenRepo.create({
        id: screenId,
        name: data.name,
        code: screenId,
        departmentId: data.departmentId,
        deviceId,
        location: data.location,
        queueUrl: data.queueUrl,
        staleThresholdSeconds: data.staleThresholdSeconds || 180,
        targetConfigVersion: 1,
        appliedConfigVersion: 0,
        mediaManifestVersion: 1,
        status: 'active',
        connectionStatus: 'online',
        healthStatus: 'ONLINE',
        lastHeartbeat: new Date().toISOString(),
        lastHeartbeatAt: new Date().toISOString(),
        currentContent: 'queue',
        currentCampaignId: null,
        playlistId: 'PL-DEFAULT',
        deviceToken,
        playerVersion: meta.version || '1.0.0',
        deviceMetadata: meta,
      });
    }

    session.status = 'paired';
    session.screenId = screen.id;
    session.deviceToken = deviceToken;
    await pairingRepo.save(session);

    await auditRepo.log('PAIR_DEVICE', 'Screen', screen.id, `Device ${deviceId} paired with code ${pairingCode} as ${screen.name}`);
    return { screen, session };
  }

  public async unpairScreen(screenId: string): Promise<Screen | null> {
    const screen = await screenRepo.getById(screenId);
    if (!screen) return null;

    const updated = await screenRepo.update(screenId, {
      deviceToken: null,
      deviceId: null,
      connectionStatus: 'offline',
      healthStatus: 'OFFLINE',
      status: 'inactive',
    });

    await auditRepo.log('UNPAIR_DEVICE', 'Screen', screenId, `Device unpaired from screen ${screen.name}`);
    return updated;
  }
}

export const pairingService = new PairingService();
