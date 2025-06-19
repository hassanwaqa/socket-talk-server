import { Server, Socket } from 'socket.io';
import { prisma } from './prisma';

export function registerSocketHandlers(socket: Socket, io: Server) {
  socket.on('message', async (data) => {
    console.log('data', data);
    const { event, requestId, Authorization, payload } = data;

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

      case 'users':
        try {
          const users = await prisma.user.findMany({
            select: {
              id: true,
              email: true,
              name: true,
            },
          });

          console.log('users', users)

          return socket.emit('message', {
            event: 'users',
            requestId,
            statusCode: 200,
            payload: {
              data: users,
              count: users.length,
            },
          });
        } catch (err) {
          console.error('[users] Failed to fetch users:', err);
          return socket.emit('message', {
            event: 'users',
            requestId,
            statusCode: 500,
            error: 'Internal Server Error',
          });
        }

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
