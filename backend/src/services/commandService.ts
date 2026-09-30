import { v4 as uuidv4 } from 'uuid';
import { commandRepo } from '../db/repositories/commandRepository';
import { screenRepo } from '../db/repositories/screenRepository';
import { auditRepo } from '../db/repositories/miscRepositories';
import { io } from '../server';
import { CommandType, DeviceCommand } from '../types';
import { Logger } from './logger';

export class CommandService {
  /**
   * Dispatches a strictly targeted command to an exact physical TV.
   * Command Lifecycle: CREATED -> SENT -> (TV sends: RECEIVED -> APPLIED -> ACKNOWLEDGED)
   */
  public async dispatchCommand(
    screenId: string,
    commandType: CommandType,
    payload: any = {}
  ): Promise<DeviceCommand> {
    const screen = screenRepo.getById(screenId);
    if (!screen) {
      throw new Error(`Screen ${screenId} not found`);
    }

    const commandId = `CMD-${uuidv4().substring(0, 8).toUpperCase()}`;
    const expiresAt = Date.now() + 35000; // 35 seconds expiration window

    // 1. STAGE: CREATED in transactional SQLite database
    const command = commandRepo.create({
      id: commandId,
      screenId: screen.id,
      deviceId: screen.deviceId,
      commandType,
      payload,
      expiresAt,
    });

    Logger.command('CREATED', commandId, screenId, { commandType, payload });

    // 2. STAGE: SENT over isolated screen socket room
    if (io) {
      const room = `screen:${screen.id}`;
      io.to(room).emit('device:command', {
        commandId: command.id,
        screenId: screen.id,
        commandType: command.commandType,
        payload: command.payload,
        expiresAt: command.expiresAt,
      });

      commandRepo.markSent(command.id);
      Logger.command('SENT', commandId, screenId, { room });

      // Notify Admin Command Center that command was dispatched
      io.emit('command:status_updated', {
        commandId: command.id,
        screenId: screen.id,
        status: 'SENT',
        commandType: command.commandType,
      });
    }

    auditRepo.log('DISPATCH_COMMAND', 'Screen', screen.id, `Dispatched ${commandType} (${commandId})`);
    return commandRepo.getById(commandId)!;
  }

  /**
   * TV acknowledges that the packet reached its network stack.
   */
  public handleReceived(commandId: string, screenId: string): DeviceCommand | null {
    const cmd = commandRepo.markReceived(commandId);
    if (cmd) {
      Logger.command('RECEIVED', commandId, screenId);
      if (io) {
        io.emit('command:status_updated', {
          commandId: cmd.id,
          screenId: cmd.screenId,
          status: 'RECEIVED',
          commandType: cmd.commandType,
        });
      }
    }
    return cmd;
  }

  /**
   * TV reports that the command was successfully applied to the hardware/engine.
   */
  public handleApplied(commandId: string, screenId: string): DeviceCommand | null {
    const cmd = commandRepo.markApplied(commandId);
    if (cmd) {
      Logger.command('APPLIED', commandId, screenId);
      if (io) {
        io.emit('command:status_updated', {
          commandId: cmd.id,
          screenId: cmd.screenId,
          status: 'APPLIED',
          commandType: cmd.commandType,
        });
      }
    }
    return cmd;
  }

  /**
   * Final step: TV sends formal completion acknowledgement with execution payload.
   */
  public handleAcknowledged(commandId: string, screenId: string, resultPayload: any = {}): DeviceCommand | null {
    const cmd = commandRepo.markAcknowledged(commandId);
    if (cmd) {
      Logger.command('ACKNOWLEDGED', commandId, screenId, { resultPayload });

      // If command was SYNC_CONFIG and TV applied it, synchronize versions in DB
      if (cmd.commandType === 'SYNC_CONFIG' && resultPayload?.appliedConfigVersion) {
        screenRepo.update(screenId, {
          appliedConfigVersion: resultPayload.appliedConfigVersion,
          lastSyncAt: new Date().toISOString(),
        });
      }

      if (io) {
        io.emit('command:status_updated', {
          commandId: cmd.id,
          screenId: cmd.screenId,
          status: 'ACKNOWLEDGED',
          commandType: cmd.commandType,
          resultPayload,
        });
        io.emit('screens:changed');
      }

      auditRepo.log('COMMAND_ACK', 'Screen', screenId, `Command ${cmd.commandType} (${commandId}) successfully acknowledged`);
    }
    return cmd;
  }

  /**
   * TV reports failure to execute command.
   */
  public handleFailed(commandId: string, screenId: string, errorMessage: string): DeviceCommand | null {
    const cmd = commandRepo.markFailed(commandId, errorMessage);
    if (cmd) {
      Logger.command('FAILED', commandId, screenId, { errorMessage });
      if (io) {
        io.emit('command:status_updated', {
          commandId: cmd.id,
          screenId: cmd.screenId,
          status: 'FAILED',
          commandType: cmd.commandType,
          errorMessage,
        });
      }
      auditRepo.log('COMMAND_FAIL', 'Screen', screenId, `Command ${cmd.commandType} (${commandId}) FAILED: ${errorMessage}`);
    }
    return cmd;
  }

  /**
   * Periodic watchdog that transitions unacknowledged commands to TIMEOUT
   */
  public reapTimeouts(): void {
    const reaped = commandRepo.reapExpiredTimeouts(30000);
    if (reaped > 0 && io) {
      io.emit('commands:reaped', { reapedCount: reaped });
    }
  }
}

export const commandService = new CommandService();
