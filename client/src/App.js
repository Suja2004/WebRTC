import React, { useState, useEffect } from 'react';
import LobbyPage from './components/LobbyPage';
import ConferencePage from './components/ConferencePage';
import './App.css';
import { SocketProvider } from './context/SocketProvider';

const App = () => {
  const [user, setUser] = useState(null);
  const [room, setRoom] = useState(null);

  return (
    <SocketProvider>
      <div className="app">
        {!user || !room ? (
          <LobbyPage onJoin={(userData, roomId) => {
            setUser(userData);
            setRoom(roomId);
          }} />
        ) : (
          <ConferencePage 
            user={user} 
            room={room} 
            onLeave={() => {
              setUser(null);
              setRoom(null);
            }}
          />
        )}
      </div>
    </SocketProvider>
  );
};

export default App;
