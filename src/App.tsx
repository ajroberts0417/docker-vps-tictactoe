import { useState, useEffect } from 'react'
import { io, Socket } from 'socket.io-client'
import './App.css'

// Initialize socket connection outside of React's render cycle
const socket = io('http://localhost:3000');

interface Message {
  id?: string;
  user: string;
  content: string;
  timestamp?: Date;
}

function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [username, setUsername] = useState('User-' + Math.floor(Math.random() * 1000));

  useEffect(() => {
    // Listen for initial chat history
    socket.on('chat-history', (history: Message[]) => {
      setMessages(history);
    });

    // Listen for new messages
    socket.on('new-message', (message: Message) => {
      setMessages(prev => [...prev, message]);
    });

    // Cleanup listeners on unmount
    return () => {
      socket.off('chat-history');
      socket.off('new-message');
    };
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim()) return;

    // Send message to server
    socket.emit('send-message', {
      user: username,
      content: newMessage
    });

    setNewMessage('');
  };

  return (
    <div className="chat-container">
      <div className="messages">
        {messages.map((msg) => (
          <div key={msg.id} className={`message ${msg.user === username ? 'own-message' : ''}`}>
            <strong>{msg.user}: </strong>
            <span>{msg.content}</span>
          </div>
        ))}
      </div>
      <form onSubmit={handleSubmit}>
        <input
          type="text"
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          placeholder="Type a message..."
        />
        <button type="submit">Send</button>
      </form>
    </div>
  )
}

export default App
