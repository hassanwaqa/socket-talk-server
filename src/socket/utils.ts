import { Socket } from "socket.io";
import { prisma } from "../prisma";

export const getNewUsers = async(
  {
    socket, 
    requestId,
    userId
  } : {
    socket: Socket,
    requestId: string
    userId: string 
}) => {
  try {
    const users = await prisma.user.findMany({
      where: {
        NOT: {
          id: userId,
        },
      },
      select: {
        id: true,
        email: true,
        name: true,
        image: true
      },
    });


    console.log('users', users);

    return socket.emit('message', {
      event: 'new_users',
      requestId,
      statusCode: 200,
      success: true,
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
      success: false,
      error: 'Internal Server Error',
    });
  }
}