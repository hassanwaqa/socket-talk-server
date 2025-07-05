import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';
import cors from 'cors';
import { config } from 'dotenv';
import { v4 as uuidv4 } from 'uuid';

// Load environment variables
config();

// Create Express app
const app = express();
const server = http.createServer(app);

// Create Redis clients for Socket.IO adapter
const pubClient = createClient({ url: process.env.REDIS_URL || 'redis://localhost:6379' });
const subClient = pubClient.duplicate();

// Create Socket.IO server
const io = new Server(server, {
  cors: {
    origin: "*", // Allow all origins for development
    methods: ["GET", "POST"]
  },
  transports: ['websocket', 'polling']
});

// Middleware
app.use(cors());
app.use(express.json());

// Basic route
app.get('/', (req, res) => {
  res.json({
    message: 'Socket.IO Chat Server with Redis is running!',
    timestamp: new Date().toISOString()
  });
});

// Store user sessions: socketId -> { username, roomId }
const userSessions = new Map<string, { username: string; roomId?: string }>();

// Store room participants: roomId -> Set<username>
const roomParticipants = new Map<string, Set<string>>();

// Initialize Redis adapter
async function initializeRedis() {
  try {
    await pubClient.connect();
    await subClient.connect();

    // Set up Redis adapter for Socket.IO
    io.adapter(createAdapter(pubClient, subClient));

    console.log('✅ Redis adapter initialized successfully');
  } catch (error) {
    console.error('❌ Redis connection failed:', error);
    console.log('⚠️  Running without Redis adapter (single instance mode)');
  }
}

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log(`🟢 User connected: ${socket.id}`);

  // Handle joining a room
  socket.on('join-room', async (data: { roomId: string; username: string }) => {
    try {
      const { roomId, username } = data;

      console.log(`👥 User ${username} (${socket.id}) joining room: ${roomId}`);

      // Store user session
      userSessions.set(socket.id, { username, roomId });

      // Leave previous room if any
      const rooms = Array.from(socket.rooms);
      rooms.forEach(room => {
        if (room !== socket.id) {
          socket.leave(room);
        }
      });

      // Join the new room
      await socket.join(roomId);

      // Update room participants
      if (!roomParticipants.has(roomId)) {
        roomParticipants.set(roomId, new Set());
      }
      roomParticipants.get(roomId)!.add(username);

      // Notify others in the room that user joined
      socket.to(roomId).emit('user-joined', { username });

      console.log(`✅ User ${username} successfully joined room ${roomId}`);

    } catch (error) {
      console.error('❌ Error joining room:', error);
    }
  });

  // Handle sending messages
  socket.on('send-message', async (data: {
    roomId: string;
    message: { username: string; content: string; timestamp: string; isOwn: boolean }
  }) => {
    try {
      const { roomId, message } = data;
      const userSession = userSessions.get(socket.id);

      if (!userSession || userSession.roomId !== roomId) {
        console.log(`❌ User ${socket.id} not in room ${roomId}`);
        return;
      }

      // Create message with unique ID
      const messageWithId = {
        id: uuidv4(),
        username: message.username,
        content: message.content,
        timestamp: message.timestamp || new Date().toISOString(),
        isOwn: false // Will be set to true by the sender's client
      };

      console.log(`📨 Message from ${message.username} in room ${roomId}: ${message.content}`);

      // Broadcast message to all users in the room (including sender)
      io.to(roomId).emit('message', messageWithId);

    } catch (error) {
      console.error('❌ Error sending message:', error);
    }
  });

  // Handle leaving room
  socket.on('leave-room', async (data: { roomId: string; username: string }) => {
    try {
      const { roomId, username } = data;

      console.log(`👋 User ${username} leaving room: ${roomId}`);

      // Remove from room participants
      if (roomParticipants.has(roomId)) {
        roomParticipants.get(roomId)!.delete(username);
        if (roomParticipants.get(roomId)!.size === 0) {
          roomParticipants.delete(roomId);
        }
      }

      // Leave the room
      await socket.leave(roomId);

      // Notify others in the room that user left
      socket.to(roomId).emit('user-left', { username });

      // Update user session
      const userSession = userSessions.get(socket.id);
      if (userSession) {
        userSession.roomId = undefined;
      }

      console.log(`✅ User ${username} left room ${roomId}`);

    } catch (error) {
      console.error('❌ Error leaving room:', error);
    }
  });

  // Handle user disconnect
  socket.on('disconnect', () => {
    const userSession = userSessions.get(socket.id);

    if (userSession) {
      const { username, roomId } = userSession;

      console.log(`🔴 User ${username} (${socket.id}) disconnected`);

      // Remove from room participants if in a room
      if (roomId && roomParticipants.has(roomId)) {
        roomParticipants.get(roomId)!.delete(username);
        if (roomParticipants.get(roomId)!.size === 0) {
          roomParticipants.delete(roomId);
        }

        // Notify others in the room that user left
        socket.to(roomId).emit('user-left', { username });
      }

      // Remove user session
      userSessions.delete(socket.id);
    } else {
      console.log(`🔴 User disconnected: ${socket.id}`);
    }
  });

  // Handle getting room participants (optional utility)
  socket.on('get-room-participants', (data: { roomId: string }) => {
    const { roomId } = data;
    const participants = roomParticipants.get(roomId);

    socket.emit('room-participants', {
      roomId,
      participants: participants ? Array.from(participants) : []
    });
  });
});

// Start server
const PORT = process.env.PORT || 4000;

async function startServer() {
  // Initialize Redis first
  await initializeRedis();

  // Start the server
  server.listen(PORT, () => {
    console.log(`🚀 Socket.IO server running on http://localhost:${PORT}`);
    console.log(`📡 Ready to accept connections with Redis scaling...`);
  });
}

startServer().catch(console.error); 