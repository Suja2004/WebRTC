import React, { useRef, useEffect, useState } from "react";
import { MicOff, VideoOff, Minimize2, Maximize2 } from "lucide-react";

const ParticipantVideo = ({ participant }) => {
  const videoRef = useRef(null);
  const [minimize, setMinimize] = useState(false);

  useEffect(() => {
    if (videoRef.current && participant.stream) {
      videoRef.current.srcObject = participant.stream;
    }
  }, [participant.stream]);

  const handleClose = () => {
    setMinimize((prev) => !prev);
  };

  return (
    <div
      className={`participant-video-container ${participant.isMe ? "me" : ""} ${minimize ? "other" : ""
        }`}
    >

      {!participant.isMe && <button className="minimize-btn" onClick={handleClose} title="minimize/Show">

        {minimize ? <Maximize2 /> : <Minimize2 />}
      </button>}

      <div className="video-wrapper">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={participant.isMe}
          className={`participant-video ${!participant.isVideoOn ? "video-off" : ""
            }`}
        />

        {!participant.isVideoOn && (
          <div className="video-placeholder">
            <div className="participant-avatar">
              {participant.name?.charAt(0).toUpperCase() || "U"}
            </div>
          </div>
        )}

        <div className="participant-info">
          <span className="participant-name">
            {participant.name} {participant.isMe ? "(You)" : ""}
          </span>
          <div className="participant-status">
            {!participant.isAudioOn && (
              <span className="muted-icon">
                <MicOff />
              </span>
            )}
            {!participant.isVideoOn && (
              <span className="video-off-icon">
                <VideoOff />
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ParticipantVideo;
