export interface LogContext {
  requestId?: string;
  deviceId?: string;
  screenId?: string;
  commandId?: string;
  eventId?: string;
  [key: string]: any;
}

export class Logger {
  public static info(message: string, context?: LogContext) {
    this.log('INFO', message, context);
  }

  public static warn(message: string, context?: LogContext) {
    this.log('WARN', message, context);
  }

  public static error(message: string, error?: any, context?: LogContext) {
    const errorDetails = error instanceof Error
      ? { message: error.message, stack: error.stack }
      : error;
    this.log('ERROR', message, { ...context, error: errorDetails });
  }

  public static command(stage: string, commandId: string, screenId: string, details?: any) {
    this.log('COMMAND', `[${stage}] Command ${commandId} for ${screenId}`, {
      commandId,
      screenId,
      stage,
      ...details,
    });
  }

  private static log(level: string, message: string, context?: LogContext) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...(context || {}),
    };

    const output = JSON.stringify(logEntry);
    if (level === 'ERROR') {
      console.error(output);
    } else if (level === 'WARN') {
      console.warn(output);
    } else {
      console.log(output);
    }
  }
}
