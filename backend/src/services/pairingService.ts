import { v4 as uuidv4 } from 'uuid';
import { pairingRepo, auditRepo } from '../db/repositories/miscRepositories';
import { screenRepo } from '../db/repositories/screenRepository';
import { deviceRepo } from '../db/repositories/deviceRepository';
import { PairingSession, Screen } from '../types';

export class PairingService {
  /**
   * Generates a 6-digit numeric pairing code with 15 minutes validity
   */
  public createPairingSession(socketId?: string, deviceMetadata?: Record<string, any>): PairingSession {
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

    pairingRepo.save(session);
    return session;
  }

  /**
   * Admin claims pairing code and binds physical TV hardware (deviceId) to logical screen slot (screenId)
   */
  public pairScreen(
    pairingCode: string,
    data: {
      name: string;
      code?: string;
      departmentId: string;
      location: string;
      queueUrl: string;
      staleThresholdSeconds?: number;
    }
  ): { screen: Screen; session: PairingSession } {
    const session = pairingRepo.get(pairingCode);
    if (!session) {
      throw new Error('Invalid or expired pairing code');
    }

    if (session.status !== 'pending' || session.expiresAt < Date.now()) {
      throw new Error('Pairing code has expired or is already used');
    }

    // Generate a clean numeric code (e.g. "342") and a prefixed ID (e.g. "SCR-342")
    const rawCode = data.code?.replace(/^SCR-/i, '') || Math.floor(100 + Math.random() * 900).toString();
    const screenCode = rawCode;
    const screenId = data.code?.startsWith('SCR-') ? data.code : `SCR-${rawCode}`;
    const deviceToken = `DEV-${uuidv4()}`;
    const deviceId = `HW-${uuidv4().substring(0, 8).toUpperCase()}`;

    // 1. Register physical hardware device in devices table
    const meta = session.deviceMetadata || {};
    deviceRepo.upsert({
      id: deviceId,
      deviceToken,
      platform: meta.platform || 'Android TV',
      model: meta.model || 'Hospital Smart TV',
      appVersion: meta.version || '1.0.0',
      ipAddress: meta.ipAddress,
    });

    // 2. Link device to logical screen slot without duplicating screens
    let screen = screenRepo.getById(screenId);
    if (screen) {
      screen = screenRepo.update(screenId, {
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
      })!;
    } else {
      screen = screenRepo.create({
        id: screenId,
        name: data.name,
        code: screenId, // store full ID as code for display
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

    // 3. Mark session paired
    session.status = 'paired';
    session.screenId = screen.id;
    session.deviceToken = deviceToken;
    pairingRepo.save(session);

    auditRepo.log('PAIR_DEVICE', 'Screen', screen.id, `Device ${deviceId} paired with code ${pairingCode} as ${screen.name}`);
    return { screen, session };
  }

  public unpairScreen(screenId: string): Screen | null {
    const screen = screenRepo.getById(screenId);
    if (!screen) return null;

    const updated = screenRepo.update(screenId, {
      deviceToken: null,
      deviceId: null,
      connectionStatus: 'offline',
      healthStatus: 'OFFLINE',
      status: 'inactive',
    });

    auditRepo.log('UNPAIR_DEVICE', 'Screen', screenId, `Device unpaired from screen ${screen.name}`);
    return updated;
  }
}

export const pairingService = new PairingService();
