import { Server, Socket } from 'socket.io';
import { getNewUsers } from './utils';

export function registerSocketHandlers(socket: Socket, io: Server) {
  socket.on('message', async (data) => {
    console.log('data', data);
    const { event, requestId, Authorization, payload } = data;
    const { query } = payload

    // if (!Authorization || !Authorization.startsWith('Bearer')) {
    //   return socket.emit('message', {
    //     event,
    //     requestId,
    //     statusCode: 401,
    //     error: 'Unauthorized',
    //   });
    // }

    switch (event) {
      case 'threads':
        return socket.emit('message', {
          event: 'threads',
          requestId,
          statusCode: 200,
          payload: {
            data: [{ id: 1, name: 'Dummy Thread' }],
            count: 1,
          },
        });

      case 'new_users':
        return getNewUsers({socket, requestId, userId: query?.userId})

      // Add more cases here
    }
  });

  socket.on('join-thread', (threadId) => {
    socket.join(threadId);
    console.log(`[${socket.id}] joined thread ${threadId}`);
  });

  socket.on('disconnect', () => {
    console.log(`[socket] disconnected: ${socket.id}`);
  });
}
