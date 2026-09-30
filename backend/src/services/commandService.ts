import { v4 as uuidv4 } from 'uuid';
import { commandRepo } from '../db/repositories/commandRepository';
import { screenRepo } from '../db/repositories/screenRepository';
import { auditRepo } from '../db/repositories/miscRepositories';
import { getIO } from '../realtime/socket';
import { CommandType, DeviceCommand } from '../types';
import { Logger } from './logger';

export class CommandService {
  public async dispatchCommand(
    screenId: string,
    commandType: CommandType,
    payload: any = {}
  ): Promise<DeviceCommand> {
    const screen = await screenRepo.getById(screenId);
    if (!screen) {
      throw new Error(`Screen ${screenId} not found`);
    }

    const commandId = `CMD-${uuidv4().substring(0, 8).toUpperCase()}`;
    const expiresAt = Date.now() + 35000;

    const command = await commandRepo.create({
      id: commandId,
      screenId: screen.id,
      deviceId: screen.deviceId,
      commandType,
      payload,
      expiresAt,
    });

    Logger.command('CREATED', commandId, screenId, { commandType, payload });

    try {
      const io = getIO();
      const room = `screen:${screen.id}`;
      io.to(room).emit('device:command', {
        commandId: command.id,
        screenId: screen.id,
        commandType: command.commandType,
        payload: command.payload,
        expiresAt: command.expiresAt,
      });

      await commandRepo.markSent(command.id);
      Logger.command('SENT', commandId, screenId, { room });

      io.to('admins').emit('command:status_updated', {
        commandId: command.id,
        screenId: screen.id,
        status: 'SENT',
        commandType: command.commandType,
      });
    } catch(e) {}

    await auditRepo.log('DISPATCH_COMMAND', 'Screen', screen.id, `Dispatched ${commandType} (${commandId})`);
    return (await commandRepo.getById(commandId))!;
  }

  public async handleReceived(commandId: string, screenId: string): Promise<DeviceCommand | null> {
    const cmd = await commandRepo.markReceived(commandId);
    if (cmd) {
      Logger.command('RECEIVED', commandId, screenId);
      try {
        const io = getIO();
        io.to('admins').emit('command:status_updated', {
          commandId: cmd.id,
          screenId: cmd.screenId,
          status: 'RECEIVED',
          commandType: cmd.commandType,
        });
      } catch(e) {}
    }
    return cmd;
  }

  public async handleApplied(commandId: string, screenId: string): Promise<DeviceCommand | null> {
    const cmd = await commandRepo.markApplied(commandId);
    if (cmd) {
      Logger.command('APPLIED', commandId, screenId);
      try {
        const io = getIO();
        io.to('admins').emit('command:status_updated', {
          commandId: cmd.id,
          screenId: cmd.screenId,
          status: 'APPLIED',
          commandType: cmd.commandType,
        });
      } catch(e) {}
    }
    return cmd;
  }

  public async handleAcknowledged(commandId: string, screenId: string, resultPayload: any = {}): Promise<DeviceCommand | null> {
    const cmd = await commandRepo.markAcknowledged(commandId);
    if (cmd) {
      Logger.command('ACKNOWLEDGED', commandId, screenId, { resultPayload });

      if (cmd.commandType === 'SYNC_CONFIG' && resultPayload?.appliedConfigVersion) {
        await screenRepo.update(screenId, {
          appliedConfigVersion: resultPayload.appliedConfigVersion,
          lastSyncAt: new Date().toISOString(),
        });
      }

      try {
        const io = getIO();
        io.to('admins').emit('command:status_updated', {
          commandId: cmd.id,
          screenId: cmd.screenId,
          status: 'ACKNOWLEDGED',
          commandType: cmd.commandType,
          resultPayload,
        });
        io.to('admins').emit('screens:changed');
      } catch(e) {}

      await auditRepo.log('COMMAND_ACK', 'Screen', screenId, `Command ${cmd.commandType} (${commandId}) successfully acknowledged`);
    }
    return cmd;
  }

  public async handleFailed(commandId: string, screenId: string, errorMessage: string): Promise<DeviceCommand | null> {
    const cmd = await commandRepo.markFailed(commandId, errorMessage);
    if (cmd) {
      Logger.command('FAILED', commandId, screenId, { errorMessage });
      try {
        const io = getIO();
        io.to('admins').emit('command:status_updated', {
          commandId: cmd.id,
          screenId: cmd.screenId,
          status: 'FAILED',
          commandType: cmd.commandType,
          errorMessage,
        });
      } catch(e) {}
      await auditRepo.log('COMMAND_FAIL', 'Screen', screenId, `Command ${cmd.commandType} (${commandId}) FAILED: ${errorMessage}`);
    }
    return cmd;
  }

  public async reapTimeouts(): Promise<void> {
    const reaped = await commandRepo.reapExpiredTimeouts(30000);
    if (reaped > 0) {
      try {
        const io = getIO();
        io.to('admins').emit('commands:reaped', { reapedCount: reaped });
      } catch(e) {}
    }
  }
}

export const commandService = new CommandService();
