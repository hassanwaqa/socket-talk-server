# Socket.IO Chat Server

A real-time chat server built with Socket.IO, Express, and TypeScript.

## 🚀 Features

- Real-time messaging with Socket.IO
- Room-based chat functionality
- Message broadcasting
- TypeScript support
- CORS enabled for frontend connections

## 📦 Installation

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Start production server
npm start
```

## 🔧 Environment Variables

Create a `.env` file in the root directory:

```env
PORT=4000
NODE_ENV=development
```

## 🌐 API Endpoints

- `GET /` - Health check endpoint

## 📡 Socket.IO Events

### Client to Server Events

- `message` - Send a message to the server
- `join-room` - Join a specific room
- `broadcast-to-room` - Broadcast message to all users in a room

### Server to Client Events

- `message` - Receive echoed messages
- `room-joined` - Confirmation of joining a room
- `room-message` - Receive messages from room members

## 🧪 Testing with Frontend

Create an HTML file to test the connection:

```html
<!DOCTYPE html>
<html>
<head>
    <title>Socket.IO Test</title>
    <script src="https://cdn.socket.io/4.7.2/socket.io.min.js"></script>
</head>
<body>
    <h1>Socket.IO Chat Test</h1>
    <div>
        <input type="text" id="messageInput" placeholder="Type a message...">
        <button onclick="sendMessage()">Send</button>
    </div>
    <div>
        <input type="text" id="roomInput" placeholder="Room name...">
        <button onclick="joinRoom()">Join Room</button>
    </div>
    <div id="messages"></div>

    <script>
        const socket = io('http://localhost:4000');
        
        socket.on('connect', () => {
            console.log('Connected:', socket.id);
            addMessage('Connected to server!');
        });
        
        socket.on('message', (data) => {
            addMessage(`Server: ${data.response}`);
        });
        
        socket.on('room-joined', (data) => {
            addMessage(`Joined room: ${data.room}`);
        });
        
        socket.on('room-message', (data) => {
            addMessage(`Room message from ${data.from}: ${data.message}`);
        });
        
        function sendMessage() {
            const input = document.getElementById('messageInput');
            const message = input.value;
            if (message) {
                socket.emit('message', { content: message });
                addMessage(`You: ${message}`);
                input.value = '';
            }
        }
        
        function joinRoom() {
            const input = document.getElementById('roomInput');
            const room = input.value;
            if (room) {
                socket.emit('join-room', room);
                input.value = '';
            }
        }
        
        function addMessage(text) {
            const div = document.createElement('div');
            div.textContent = `${new Date().toLocaleTimeString()} - ${text}`;
            document.getElementById('messages').appendChild(div);
        }
        
        document.getElementById('messageInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') sendMessage();
        });
    </script>
</body>
</html>
```

## 🛠️ Development

The server runs on `http://localhost:4000` by default.

### Available Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build TypeScript to JavaScript
- `npm start` - Start production server

## 📝 License

MIT 