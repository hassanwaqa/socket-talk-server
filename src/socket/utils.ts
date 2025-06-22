import { Socket } from "socket.io";
import { prisma } from "../prisma";

export const getNewUsers = async ({
  socket,
  requestId,
  userId,
}: {
  socket: Socket;
  requestId: string;
  userId: string;
}) => {
  try {
    // 1. Find all threadIds the user is already in
    const existingParticipantThreads = await prisma.threadParticipant.findMany({
      where: {
        userId,
      },
      select: {
        threadId: true,
      },
    });

    const threadIds = existingParticipantThreads.map((tp) => tp.threadId);

    // 2. Find all users who are part of any of those threads (i.e. people already chatting with the current user)
    const existingContactUserIdsSet = new Set<string>();

    if (threadIds.length > 0) {
      const participantsInExistingThreads = await prisma.threadParticipant.findMany({
        where: {
          threadId: { in: threadIds },
          NOT: { userId }, // exclude the current user
        },
        select: { userId: true },
      });

      participantsInExistingThreads.forEach((p) => existingContactUserIdsSet.add(p.userId));
    }

    // 3. Now fetch all users who are NOT in the set AND not the current user
    const users = await prisma.user.findMany({
      where: {
        AND: [
          { id: { not: userId } },
          { id: { notIn: Array.from(existingContactUserIdsSet) } },
        ],
      },
      select: {
        id: true,
        email: true,
        name: true,
        image: true,
      },
    });

    return socket.emit("message", {
      event: "new_users",
      requestId,
      statusCode: 200,
      success: true,
      payload: {
        data: users,
        count: users.length,
      },
    });
  } catch (err) {
    console.error("[users] Failed to fetch new users:", err);
    return socket.emit("message", {
      event: "new_users",
      requestId,
      statusCode: 500,
      success: false,
      error: "Internal Server Error",
    });
  }
};


export const getThreads = async ({
  socket,
  requestId,
  userId,
}: {
  socket: Socket;
  requestId: string;
  userId: string;
}) => {
  try {
    const threads = await prisma.thread.findMany({
      where: {
        participants: {
          some: {
            userId: userId,
          },
        },
      },
      orderBy: {
        updatedAt: "desc",
      },
      include: {
        lastMessage: true,
        participants: {
          where: {
            NOT: {
              userId: userId,
            },
          },
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                image: true,
              },
            },
          },
        },
      },
    });

    return socket.emit("message", {
      event: "threads",
      requestId,
      statusCode: 200,
      success: true,
      payload: {
        data: threads,
        count: threads.length,
      },
    });
  } catch (err) {
    console.error("[threads] Failed to fetch threads:", err);
    return socket.emit("message", {
      event: "threads",
      requestId,
      statusCode: 500,
      success: false,
      error: "Internal Server Error",
    });
  }
};


export const createNewThread = async ({
  socket,
  requestId,
  participants,
  userId
}: {
  socket: Socket;
  requestId: string;
  participants: string[]; // array of userIds
  userId: string
}) => {
  try {
    // 1. Create the thread
    const thread = await prisma.thread.create({
      data: {},
    });

    // 2. Manually create thread participants
    await prisma.threadParticipant.createMany({
      data: participants.map((userId) => ({
        userId,
        threadId: thread.id,
      })),
    });

    // 3. Fetch the thread again with participants and user info
    const threadWithParticipants = await prisma.thread.findUnique({
      where: { id: thread.id },
      include: {
        lastMessage: true, // ✅ Include lastMessage
        participants: {
          where: {
            NOT: {
              userId: userId, // ✅ Filter out the current user
            },
          },
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                image: true,
              },
            },
          },
        },
      },
    });


    // 4. Send response to requesting user
    return socket.emit("message", {
      event: "new_thread",
      requestId,
      statusCode: 201,
      success: true,
      payload: {
        thread: threadWithParticipants,
      },
    });
  } catch (err) {
    console.error("[thread] Failed to create thread:", err);
    return socket.emit("message", {
      event: "new_thread",
      requestId,
      statusCode: 500,
      success: false,
      error: "Internal Server Error",
    });
  }
};
