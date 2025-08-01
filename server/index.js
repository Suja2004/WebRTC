const { Server } = require('socket.io');
const express = require('express');
const http = require('http');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: ["http://localhost:3000","https://web-rtc-neon.vercel.app","http://localhost:5173"],
    methods: ["GET", "POST"]
  }
});

const rooms = new Map(); 
const participants = new Map();

io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  socket.on('room:join', (data) => {
    const { email, name, room } = data;
    
    participants.set(socket.id, { email, name, room });
    
    if (!rooms.has(room)) {
      rooms.set(room, new Set());
    }
    rooms.get(room).add(socket.id);
    
    socket.join(room);
    
    const existingParticipants = Array.from(rooms.get(room))
      .filter(id => id !== socket.id)
      .map(id => {
        const participant = participants.get(id);
        return { id, email: participant.email, name: participant.name };
      });

    if (existingParticipants.length > 0) {
      socket.emit('room:existing-participants', existingParticipants);
    }
    
    socket.to(room).emit('user:joined', { 
      email, 
      name, 
      id: socket.id 
    });
    
    console.log(`${name} joined room ${room}. Room size: ${rooms.get(room).size}`);
  });

  socket.on('room:leave', (data) => {
    const { room } = data;
    const participant = participants.get(socket.id);
    
    if (participant && rooms.has(room)) {
      rooms.get(room).delete(socket.id);
      if (rooms.get(room).size === 0) {
        rooms.delete(room);
      }
      
      socket.to(room).emit('user:left', {
        id: socket.id,
        name: participant.name
      });
      
      socket.leave(room);
      console.log(`${participant.name} left room ${room}`);
    }
  });

  socket.on('webrtc:offer', ({ to, offer }) => {
    const participant = participants.get(socket.id);
    socket.to(to).emit('webrtc:offer', { 
      from: socket.id, 
      offer, 
      name: participant?.name 
    });
  });

  socket.on('webrtc:answer', ({ to, answer }) => {
    socket.to(to).emit('webrtc:answer', { from: socket.id, answer });
  });

  socket.on('webrtc:ice-candidate', ({ to, candidate }) => {
    socket.to(to).emit('webrtc:ice-candidate', { from: socket.id, candidate });
  });

  socket.on('participant:toggle-video', ({ isVideoOn }) => {
    const participant = participants.get(socket.id);
    if (participant) {
      socket.to(participant.room).emit('participant:video-toggle', {
        participantId: socket.id,
        isVideoOn
      });
    }
  });

  socket.on('participant:toggle-audio', ({ isAudioOn }) => {
    const participant = participants.get(socket.id);
    if (participant) {
      socket.to(participant.room).emit('participant:audio-toggle', {
        participantId: socket.id,
        isAudioOn
      });
    }
  });

  socket.on('participant:screen-share', ({ isSharing }) => {
    const participant = participants.get(socket.id);
    if (participant) {
      socket.to(participant.room).emit('participant:screen-share-toggle', {
        participantId: socket.id,
        isSharing
      });
    }
  });

  socket.on('chat:message', ({ room, from, name, message, timestamp }) => {
    socket.to(room).emit('chat:message', { from, name, message, timestamp });
  });

  socket.on('disconnect', () => {
    const participant = participants.get(socket.id);
    
    if (participant) {
      const { room, name } = participant;
      
      if (rooms.has(room)) {
        rooms.get(room).delete(socket.id);
        if (rooms.get(room).size === 0) {
          rooms.delete(room);
        }
      }
      
      socket.to(room).emit('user:left', {
        id: socket.id,
        name
      });
      
      participants.delete(socket.id);
      console.log(`${name} disconnected from room ${room}`);
    }
  });
});

const PORT = process.env.PORT || 8000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
