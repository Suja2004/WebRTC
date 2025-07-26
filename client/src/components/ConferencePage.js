import React, { useState, useEffect, useCallback, useRef } from "react";
import { useSocket } from "../context/SocketProvider";
import ParticipantGrid from "./ParticipantGrid";
import ControlPanel from "./ControlPanel";
import ChatPanel from "./ChatPanel";
import PeerManager from "../services/PeerManager";

const ConferencePage = ({ user, room, onLeave }) => {
  const socket = useSocket();
  const [participants, setParticipants] = useState(new Map());
  const [myStream, setMyStream] = useState(null);
  const [isVideoOn, setIsVideoOn] = useState(user.isVideoOn);
  const [isAudioOn, setIsAudioOn] = useState(user.isAudioOn);
  const [showChat, setShowChat] = useState(false);
  const [messages, setMessages] = useState([]);

  const peerManager = useRef(new PeerManager()).current;

  // Initialize media stream
  useEffect(() => {
    const initializeStream = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: isVideoOn,
          audio: isAudioOn,
        });
        setMyStream(stream);

        // Add myself to participants
        setParticipants(
          (prev) =>
            new Map(
              prev.set(socket.id, {
                id: socket.id,
                name: user.name,
                stream: stream,
                isVideoOn,
                isAudioOn,
                isMe: true,
              })
            )
        );
      } catch (error) {
        console.error("Error accessing media devices:", error);
      }
    };

    initializeStream();
  }, []);

  // Join room
  useEffect(() => {
    if (socket && myStream) {
      socket.emit("room:join", {
        email: user.email,
        name: user.name,
        room,
      });
    }

    // Cleanup function
    return () => {
      if (socket) {
        socket.emit("room:leave", { room });
      }
    };
  }, [socket, myStream, user, room]);

  // Socket event handlers
  const handleUserJoined = useCallback(
    async ({ email, name, id }) => {
      console.log(`${name} joined the room`);

      // Add participant to list first
      setParticipants(
        (prev) =>
          new Map(
            prev.set(id, {
              id,
              name,
              email,
              stream: null,
              isVideoOn: true,
              isAudioOn: true,
              isMe: false,
            })
          )
      );

      // Only create offer if I have a stream (existing user creates offer for new user)
      if (myStream) {
        try {
          const peerConnection = await peerManager.createPeerConnection(
            id,
            myStream
          );

          // Create and send offer
          const offer = await peerConnection.createOffer();
          await peerConnection.setLocalDescription(offer);

          socket.emit("webrtc:offer", { to: id, offer });
        } catch (error) {
          console.error("Error creating offer:", error);
        }
      }
    },
    [myStream, socket, peerManager]
  );

  const handleWebRTCOffer = useCallback(
    async ({ from, offer, name }) => {
      console.log("Received offer from:", name);

      try {
        const peerConnection = await peerManager.createPeerConnection(
          from,
          myStream
        );

        // Set remote description (offer)
        await peerConnection.setRemoteDescription(
          new RTCSessionDescription(offer)
        );

        // Create and send answer
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);

        socket.emit("webrtc:answer", { to: from, answer });

        // Add participant if not already added
        setParticipants((prev) => {
          if (!prev.has(from)) {
            return new Map(
              prev.set(from, {
                id: from,
                name: name || "Unknown",
                stream: null,
                isVideoOn: true,
                isAudioOn: true,
                isMe: false,
              })
            );
          }
          return prev;
        });
      } catch (error) {
        console.error("Error handling offer:", error);
      }
    },
    [myStream, socket, peerManager]
  );

  const handleWebRTCAnswer = useCallback(
    async ({ from, answer }) => {
      console.log("Received answer from:", from);

      try {
        const peerConnection = peerManager.getPeerConnection(from);
        if (
          peerConnection &&
          peerConnection.signalingState === "have-local-offer"
        ) {
          await peerConnection.setRemoteDescription(
            new RTCSessionDescription(answer)
          );
        }
      } catch (error) {
        console.error("Error handling answer:", error);
      }
    },
    [peerManager]
  );

  const handleICECandidate = useCallback(
    async ({ from, candidate }) => {
      const peerConnection = peerManager.getPeerConnection(from);
      if (peerConnection) {
        await peerConnection.addIceCandidate(candidate);
      }
    },
    [peerManager]
  );

  const handleRemoteStream = useCallback((peerId, stream) => {
    setParticipants((prev) => {
      const updated = new Map(prev);
      const participant = updated.get(peerId);
      if (participant) {
        participant.stream = stream;
        updated.set(peerId, participant);
      }
      return updated;
    });
  }, []);

  // Handle existing participants (when joining a room with people already in it)
  const handleExistingParticipants = useCallback((existingParticipants) => {
    console.log("Existing participants:", existingParticipants);

    // Add existing participants to the list
    existingParticipants.forEach(({ id, name, email }) => {
      setParticipants(
        (prev) =>
          new Map(
            prev.set(id, {
              id,
              name,
              email,
              stream: null,
              isVideoOn: true,
              isAudioOn: true,
              isMe: false,
            })
          )
      );
    });
  }, []);

  const handleUserLeft = useCallback(
    ({ id, name }) => {
      console.log(`${name} left the room`);
      peerManager.removePeerConnection(id);
      setParticipants((prev) => {
        const updated = new Map(prev);
        updated.delete(id);
        return updated;
      });
    },
    [peerManager]
  );

  const handleChatMessage = useCallback(
    ({ from, name, message, timestamp }) => {
      setMessages((prev) => [...prev, { from, name, message, timestamp }]);
    },
    []
  );

  const handleParticipantVideoToggle = useCallback(
    ({ participantId, isVideoOn }) => {
      setParticipants((prev) => {
        const updated = new Map(prev);
        const participant = updated.get(participantId);
        if (participant) {
          participant.isVideoOn = isVideoOn;
          updated.set(participantId, participant);
        }
        return updated;
      });
    },
    []
  );

  const handleParticipantAudioToggle = useCallback(
    ({ participantId, isAudioOn }) => {
      setParticipants((prev) => {
        const updated = new Map(prev);
        const participant = updated.get(participantId);
        if (participant) {
          participant.isAudioOn = isAudioOn;
          updated.set(participantId, participant);
        }
        return updated;
      });
    },
    []
  );

  // Set up peer manager callbacks
  useEffect(() => {
    peerManager.onRemoteStream = handleRemoteStream;
    peerManager.onICECandidate = (peerId, candidate) => {
      socket.emit("webrtc:ice-candidate", { to: peerId, candidate });
    };
  }, [peerManager, handleRemoteStream, socket]);

  // Socket event listeners
  useEffect(() => {
    if (!socket) return;

    socket.on("room:existing-participants", handleExistingParticipants);
    socket.on("user:joined", handleUserJoined);
    socket.on("user:left", handleUserLeft);
    socket.on("webrtc:offer", handleWebRTCOffer);
    socket.on("webrtc:answer", handleWebRTCAnswer);
    socket.on("webrtc:ice-candidate", handleICECandidate);
    socket.on("chat:message", handleChatMessage);
    socket.on("participant:video-toggle", handleParticipantVideoToggle);
    socket.on("participant:audio-toggle", handleParticipantAudioToggle);

    return () => {
      socket.off("room:existing-participants", handleExistingParticipants);
      socket.off("user:joined", handleUserJoined);
      socket.off("user:left", handleUserLeft);
      socket.off("webrtc:offer", handleWebRTCOffer);
      socket.off("webrtc:answer", handleWebRTCAnswer);
      socket.off("webrtc:ice-candidate", handleICECandidate);
      socket.off("chat:message", handleChatMessage);
      socket.off("participant:video-toggle", handleParticipantVideoToggle);
      socket.off("participant:audio-toggle", handleParticipantAudioToggle);
    };
  }, [
    socket,
    handleExistingParticipants,
    handleUserJoined,
    handleUserLeft,
    handleWebRTCOffer,
    handleWebRTCAnswer,
    handleICECandidate,
    handleChatMessage,
    handleParticipantVideoToggle,
    handleParticipantAudioToggle,
  ]);

  const toggleVideo = useCallback(async () => {
    if (!myStream) return;

    const currentVideoTrack = myStream.getVideoTracks()[0];

    if (isVideoOn && currentVideoTrack) {
      // Turn OFF video
      currentVideoTrack.stop();
      myStream.removeTrack(currentVideoTrack);
      setIsVideoOn(false);

      setParticipants((prev) => {
        const updated = new Map(prev);
        const me = updated.get(socket.id);
        if (me) {
          me.isVideoOn = false;
          me.stream = new MediaStream(myStream.getAudioTracks());
          updated.set(socket.id, me);
        }
        return updated;
      });

      socket.emit("participant:toggle-video", { isVideoOn: false });
    } else {
      try {
        const newStream = await navigator.mediaDevices.getUserMedia({
          video: true,
        });
        const newVideoTrack = newStream.getVideoTracks()[0];
        if (newVideoTrack) {
          myStream.addTrack(newVideoTrack);

          setMyStream(new MediaStream([...myStream.getTracks()]));
          setIsVideoOn(true);

          setParticipants((prev) => {
            const updated = new Map(prev);
            const me = updated.get(socket.id);
            if (me) {
              me.isVideoOn = true;
              me.stream = new MediaStream([...myStream.getTracks()]);
              updated.set(socket.id, me);
            }
            return updated;
          });

          socket.emit("participant:toggle-video", { isVideoOn: true });
        }
      } catch (err) {
        console.error("Error accessing camera:", err);
      }
    }
  }, [myStream, isVideoOn, socket]);

  const toggleAudio = useCallback(async () => {
    if (myStream) {
      const audioTrack = myStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !isAudioOn;
        setIsAudioOn(!isAudioOn);

        // Update participant info
        setParticipants((prev) => {
          const updated = new Map(prev);
          const me = updated.get(socket.id);
          if (me) {
            me.isAudioOn = !isAudioOn;
            updated.set(socket.id, me);
          }
          return updated;
        });

        // Notify other participants
        socket.emit("participant:toggle-audio", { isAudioOn: !isAudioOn });
      }
    }
  }, [myStream, isAudioOn, socket]);

  const sendMessage = useCallback(
    (message) => {
      const messageData = {
        from: socket.id,
        name: user.name,
        message,
        timestamp: new Date().toISOString(),
      };

      socket.emit("chat:message", { room, ...messageData });
      setMessages((prev) => [...prev, messageData]);
    },
    [socket, user.name, room]
  );

  const leaveConference = useCallback(() => {
    // Stop all streams
    if (myStream) {
      myStream.getTracks().forEach((track) => track.stop());
    }
    // Close all peer connections
    peerManager.closeAllConnections();
    // Leave socket room
    socket.emit("room:leave", { room });
    onLeave();
    window.location.reload();
  }, [myStream, peerManager, socket, room, onLeave]);

  return (
    <div className="conference-container">
      <div className="conference-header">
        <h1 className="conference-title">Conference Room: {room}</h1>
      </div>

      <div className="conference-main">
        <div className={`video-section ${showChat ? "with-chat" : ""}`}>
          <ParticipantGrid participants={Array.from(participants.values())} />
        </div>

        {showChat && (
          <ChatPanel
            messages={messages}
            onSendMessage={sendMessage}
            onClose={() => setShowChat(false)}
          />
        )}
      </div>

      <ControlPanel
        isVideoOn={isVideoOn}
        isAudioOn={isAudioOn}
        showChat={showChat}
        onToggleVideo={toggleVideo}
        onToggleAudio={toggleAudio}
        onToggleChat={() => setShowChat(!showChat)}
        onLeave={leaveConference}
        participantCount={participants.size}
      />
    </div>
  );
};

export default ConferencePage;
