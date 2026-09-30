import { io, Socket } from 'socket.io-client';
import { getBackendBaseUrl, getAdminToken } from './api';

let socketInstance: Socket | null = null;

export const getSocket = (): Socket => {
  if (!socketInstance) {
    socketInstance = io(getBackendBaseUrl(), {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,    // Never stop reconnecting
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,       // Cap at 10s between attempts
      auth: (cb) => {
        // Provide admin token for socket auth header on connect/reconnect
        cb({ token: getAdminToken() || '' });
      },
    });
  }
  return socketInstance;
};

export const disconnectSocket = () => {
  if (socketInstance) {
    socketInstance.disconnect();
    socketInstance = null;
  }
};
