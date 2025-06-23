import { Server, Socket } from 'socket.io';
import { createNewThread, getNewUsers, getThreads, sendMessage, getThreadMessagesAndJoinRoom } from './utils';

export function registerSocketHandlers(socket: Socket, io: Server) {
  socket.on('message', async (data) => {
    console.log('data', data);
    const { event, requestId, Authorization, payload } = data;
    const { query, params } = payload

    // if (!Authorization || !Authorization.startsWith('Bearer')) {
    //   return socket.emit('message', {
    //     event,
    //     requestId,
    //     statusCode: 401,
    //     error: 'Unauthorized',
    //   });
    // }

    switch (event) {

      case "threads":
        return getThreads({ socket, requestId, userId: query?.userId })

      case 'new_users':
        return getNewUsers({ socket, requestId, userId: query?.userId })

      case "new_thread":
        return createNewThread({ socket, requestId, participants: params?.participants, userId: query?.userId })

      case "send_message":
        return sendMessage({
          socket,
          io,
          requestId,
          threadId: params?.threadId,
          senderId: query?.userId,
          content: params?.content,
          messageType: params?.messageType || 'text',
        });

      case "thread_messages":
        return getThreadMessagesAndJoinRoom({
          socket,
          requestId,
          threadId: query?.threadId
        });

      // Add more cases here
    }
  });

  socket.on('disconnect', () => {
    console.log(`[socket] disconnected: ${socket.id}`);
  });
}
