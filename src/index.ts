import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { config } from 'dotenv';
import { registerSocketHandlers } from './socket';

config(); // Load .env

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

app.use(cors());
app.use(express.json());

app.get('/', (_, res: any) => res.send('Socket server running'));

io.on('connection', (socket) => {
  console.log('[socket] connected:', socket.id);
  registerSocketHandlers(socket, io);
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
