import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';

export interface Message {
    id?: string;
    user: string;
    content: string;
    timestamp?: Date;
  }

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*", // Allow all origins for demo purposes
  }
});

// Store chat history in memory
const chatHistory: Message[] = [];

// Serve static files if needed
app.use(express.static('public'));

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  
  // Send chat history to newly connected user
  socket.emit('chat-history', chatHistory);

  // Handle new messages
  socket.on('send-message', (message: Message) => {
    const messageWithTimestamp = {
      ...message,
      timestamp: new Date(),
      id: Date.now().toString()
    };
    
    // Store in history
    chatHistory.push(messageWithTimestamp);
    
    // Broadcast to all clients
    io.emit('new-message', messageWithTimestamp);
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});