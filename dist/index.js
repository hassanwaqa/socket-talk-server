"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const http_1 = __importDefault(require("http"));
const socket_io_1 = require("socket.io");
const redis_adapter_1 = require("@socket.io/redis-adapter");
const redis_1 = require("redis");
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = require("dotenv");
const uuid_1 = require("uuid");
// Load environment variables
(0, dotenv_1.config)();
const redisHost = process.env.REDIS_HOST || 'localhost';
const redisPort = Number(process.env.REDIS_PORT || 6379);
const redisTls = process.env.REDIS_TLS === 'true';
const redisUrl = process.env.REDIS_URL;
const redisUsername = process.env.REDIS_USERNAME || undefined;
const redisPassword = process.env.REDIS_PASSWORD || undefined;
function createRedisOptions() {
    if (redisUrl) {
        return {
            url: redisUrl,
            socket: {
                tls: redisUrl.startsWith('rediss://') || redisTls
            }
        };
    }
    return {
        username: redisUsername,
        password: redisPassword,
        socket: {
            host: redisHost,
            port: redisPort,
            tls: redisTls
        }
    };
}
// Create Express app
const app = (0, express_1.default)();
const server = http_1.default.createServer(app);
// Create Redis clients for Socket.IO adapter
const pubClient = (0, redis_1.createClient)(createRedisOptions());
const subClient = pubClient.duplicate();
// Create a separate Redis client for database operations
const dbClient = (0, redis_1.createClient)(createRedisOptions());
pubClient.on('error', (error) => console.error('❌ Redis pub client error:', error.message));
subClient.on('error', (error) => console.error('❌ Redis sub client error:', error.message));
dbClient.on('error', (error) => console.error('❌ Redis db client error:', error.message));
// Create Socket.IO server
const io = new socket_io_1.Server(server, {
    cors: {
        origin: "*", // Allow all origins for development
        methods: ["GET", "POST"]
    },
    transports: ['websocket', 'polling']
});
// Middleware
app.use((0, cors_1.default)());
app.use(express_1.default.json());
// Basic route
app.get('/', (req, res) => {
    res.json({
        message: 'Socket.IO Chat Server with Redis Database is running!',
        timestamp: new Date().toISOString()
    });
});
// Store user sessions: socketId -> { username, roomId }
const userSessions = new Map();
// Store room participants: roomId -> Set<username>
const roomParticipants = new Map();
// Initialize Redis connections
async function initializeRedis() {
    try {
        const redisTarget = redisUrl ? redisUrl.replace(/\/\/.*@/, '//***@') : `${redisHost}:${redisPort}`;
        console.log(`🔌 Connecting to Redis at ${redisTarget} (TLS: ${redisTls ? 'enabled' : 'disabled'})`);
        // Connect all Redis clients
        await Promise.all([
            pubClient.connect(),
            subClient.connect(),
            dbClient.connect()
        ]);
        // Set up Redis adapter for Socket.IO
        io.adapter((0, redis_adapter_1.createAdapter)(pubClient, subClient));
        console.log('✅ Redis adapter and database initialized successfully');
    }
    catch (error) {
        console.error('❌ Redis connection failed:', error);
        console.log('⚠️  Running without Redis (single instance mode, no message persistence)');
    }
}
// Store message in Redis
async function storeMessage(message) {
    try {
        if (!dbClient.isOpen) {
            console.log('⚠️  Redis not connected, message not stored');
            return;
        }
        // Store message in a list for the room (simpler approach)
        const messageKey = `room:${message.roomId}:messages`;
        const messageData = JSON.stringify(message);
        // Use list to store messages in order
        await dbClient.lPush(messageKey, messageData);
        // Keep only the last 1000 messages per room
        await dbClient.lTrim(messageKey, 0, 999);
        // Optional: Set expiration for room messages (e.g., 30 days)
        await dbClient.expire(messageKey, 30 * 24 * 60 * 60); // 30 days
        console.log(`💾 Message stored in Redis for room ${message.roomId}`);
    }
    catch (error) {
        console.error('❌ Error storing message in Redis:', error);
    }
}
// Retrieve messages from Redis for a room
async function getRoomMessages(roomId, limit = 100) {
    try {
        if (!dbClient.isOpen) {
            console.log('⚠️  Redis not connected, returning empty message history');
            return [];
        }
        const messageKey = `room:${roomId}:messages`;
        // Get messages from list (newest first, so we reverse for chronological order)
        const messages = await dbClient.lRange(messageKey, 0, limit - 1);
        const parsedMessages = messages.reverse().map(messageData => {
            try {
                return JSON.parse(messageData);
            }
            catch (error) {
                console.error('❌ Error parsing message from Redis:', error);
                return null;
            }
        }).filter(msg => msg !== null);
        console.log(`📚 Retrieved ${parsedMessages.length} messages for room ${roomId}`);
        return parsedMessages;
    }
    catch (error) {
        console.error('❌ Error retrieving messages from Redis:', error);
        return [];
    }
}
// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log(`🟢 User connected: ${socket.id}`);
    // Handle joining a room
    socket.on('join-room', async (data) => {
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
            roomParticipants.get(roomId).add(username);
            // Retrieve and send message history to the user
            const messageHistory = await getRoomMessages(roomId);
            // Send message history to the user who just joined
            if (messageHistory.length > 0) {
                console.log(`📤 Sending ${messageHistory.length} historical messages to ${username}`);
                // Convert stored messages to frontend format
                const formattedMessages = messageHistory.map(msg => ({
                    id: msg.id,
                    username: msg.username,
                    content: msg.content,
                    timestamp: msg.timestamp,
                    isOwn: msg.username === username // Mark user's own messages
                }));
                // Send all messages at once
                socket.emit('message-history', {
                    roomId: roomId,
                    messages: formattedMessages
                });
            }
            // Notify others in the room that user joined
            socket.to(roomId).emit('user-joined', { username });
            console.log(`✅ User ${username} successfully joined room ${roomId}`);
        }
        catch (error) {
            console.error('❌ Error joining room:', error);
        }
    });
    // Handle sending messages
    socket.on('send-message', async (data) => {
        try {
            const { roomId, message } = data;
            const userSession = userSessions.get(socket.id);
            if (!userSession || userSession.roomId !== roomId) {
                console.log(`❌ User ${socket.id} not in room ${roomId}`);
                return;
            }
            // Create message with unique ID
            const messageWithId = {
                id: (0, uuid_1.v4)(),
                username: message.username,
                content: message.content,
                timestamp: message.timestamp || new Date().toISOString(),
                isOwn: false // Will be set to true by the sender's client
            };
            // Store message in Redis database
            const storedMessage = {
                id: messageWithId.id,
                username: messageWithId.username,
                content: messageWithId.content,
                timestamp: messageWithId.timestamp,
                roomId: roomId
            };
            await storeMessage(storedMessage);
            console.log(`📨 Message from ${message.username} in room ${roomId}: ${message.content}`);
            // Broadcast message to all users in the room (including sender)
            io.to(roomId).emit('message', messageWithId);
        }
        catch (error) {
            console.error('❌ Error sending message:', error);
        }
    });
    // Handle leaving room
    socket.on('leave-room', async (data) => {
        try {
            const { roomId, username } = data;
            console.log(`👋 User ${username} leaving room: ${roomId}`);
            // Remove from room participants
            if (roomParticipants.has(roomId)) {
                roomParticipants.get(roomId).delete(username);
                if (roomParticipants.get(roomId).size === 0) {
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
        }
        catch (error) {
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
                roomParticipants.get(roomId).delete(username);
                if (roomParticipants.get(roomId).size === 0) {
                    roomParticipants.delete(roomId);
                }
                // Notify others in the room that user left
                socket.to(roomId).emit('user-left', { username });
            }
            // Remove user session
            userSessions.delete(socket.id);
        }
        else {
            console.log(`🔴 User disconnected: ${socket.id}`);
        }
    });
    // Handle getting room participants (optional utility)
    socket.on('get-room-participants', (data) => {
        const { roomId } = data;
        const participants = roomParticipants.get(roomId);
        socket.emit('room-participants', {
            roomId,
            participants: participants ? Array.from(participants) : []
        });
    });
    // Handle clearing room messages (optional utility for testing)
    socket.on('clear-room-messages', async (data) => {
        try {
            if (!dbClient.isOpen) {
                socket.emit('error', { message: 'Redis not connected' });
                return;
            }
            const { roomId } = data;
            const messageKey = `room:${roomId}:messages`;
            await dbClient.del(messageKey);
            console.log(`🗑️  Cleared messages for room ${roomId}`);
            socket.emit('room-messages-cleared', { roomId });
        }
        catch (error) {
            console.error('❌ Error clearing room messages:', error);
            socket.emit('error', { message: 'Failed to clear messages' });
        }
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
        console.log(`📡 Ready to accept connections with Redis database...`);
    });
}
// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n🛑 Shutting down server...');
    try {
        await Promise.all([
            pubClient.quit(),
            subClient.quit(),
            dbClient.quit()
        ]);
        console.log('✅ Redis connections closed');
    }
    catch (error) {
        console.error('❌ Error closing Redis connections:', error);
    }
    process.exit(0);
});
startServer().catch(console.error);
//# sourceMappingURL=index.js.map