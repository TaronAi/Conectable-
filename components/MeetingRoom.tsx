import React, { useEffect, useRef, useState, useCallback } from 'react';
import Peer, { MediaConnection, DataConnection } from 'peerjs';
import { 
  Mic, MicOff, Video, VideoOff, PhoneOff, 
  Copy, Check, Sparkles, Users, Hand, ShieldAlert, BadgeCheck, Home
} from 'lucide-react';
import { Button } from './Button';
import { AiAssistant } from './GeminiAssistant';
import { CallStatus, SignalMessage } from '../types';

interface MeetingRoomProps {
  roomId?: string; 
}

export const MeetingRoom: React.FC<MeetingRoomProps> = ({ roomId: targetRoomId }) => {
  // State
  const [peerId, setPeerId] = useState<string>('');
  const [status, setStatus] = useState<CallStatus>(CallStatus.IDLE);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [endReason, setEndReason] = useState<string | null>(null);
  
  // Controls
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [showCopied, setShowCopied] = useState(false);
  const [showAiPanel, setShowAiPanel] = useState(false);
  
  // Advanced Features
  const [isHandRaised, setIsHandRaised] = useState(false);
  const [remoteHandRaised, setRemoteHandRaised] = useState(false);
  const amIHost = !targetRoomId; // If I didn't join a room ID, I created it.

  // Refs
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const peerInstance = useRef<Peer | null>(null);
  const callRef = useRef<MediaConnection | null>(null);
  const dataConnRef = useRef<DataConnection | null>(null);

  const initMedia = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true
      });
      setLocalStream(stream);
      // Note: We cannot set srcObject here reliably because the video element might not be in the DOM yet.
      // We rely on the useEffects below to bind the stream to the video element.
      return stream;
    } catch (err) {
      console.error("Failed to get media", err);
      return null;
    }
  }, []);

  // Helper: Send data message to peer
  const sendSignal = (type: SignalMessage['type'], payload?: any) => {
    if (dataConnRef.current && dataConnRef.current.open) {
      dataConnRef.current.send({ type, payload } as SignalMessage);
    }
  };

  // Clean up media tracks (turns off camera light)
  const stopLocalStream = () => {
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
    }
  };

  // Effect to attach LOCAL stream to video element when it becomes available
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream, status]); // Run when stream changes OR when status changes (video element mounts)

  // Effect to attach REMOTE stream to video element when it becomes available
  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream, status]);

  useEffect(() => {
    const initPeer = async () => {
      const stream = await initMedia();
      if (!stream) return;

      const PeerDetails = (await import('peerjs')).default;
      const peer = new PeerDetails();

      peer.on('open', (id) => {
        setPeerId(id);
        setStatus(CallStatus.IDLE);

        // JOINING A ROOM
        if (targetRoomId) {
          setStatus(CallStatus.CONNECTING);
          
          // 1. Establish Media Call
          const call = peer.call(targetRoomId, stream);
          
          call.on('stream', (remoteStream) => {
            setRemoteStream(remoteStream);
            setStatus(CallStatus.CONNECTED);
          });

          call.on('close', () => {
             setEndReason("The host ended the meeting.");
             endCall(false);
          });
          
          call.on('error', () => setStatus(CallStatus.ERROR));
          callRef.current = call;

          // 2. Establish Data Connection for signaling
          const conn = peer.connect(targetRoomId);
          conn.on('open', () => {
            dataConnRef.current = conn;
          });
          conn.on('data', (data: any) => handleSignal(data));
          conn.on('close', () => console.log("Data connection closed"));
        }
      });

      // HOSTING A ROOM
      // 1. Handle incoming media calls
      peer.on('call', (call) => {
        call.answer(stream);
        setStatus(CallStatus.CONNECTED);
        call.on('stream', (remoteStream) => {
            setRemoteStream(remoteStream);
        });
        call.on('close', () => {
            setEndReason("The participant left the meeting.");
            endCall(false);
        });
        callRef.current = call;
      });

      // 2. Handle incoming data connections
      peer.on('connection', (conn) => {
        dataConnRef.current = conn;
        conn.on('data', (data: any) => handleSignal(data));
      });

      peerInstance.current = peer;
    };

    initPeer();

    return () => {
      stopLocalStream();
      if (peerInstance.current) peerInstance.current.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetRoomId]); 

  const handleSignal = (data: SignalMessage) => {
    switch (data.type) {
      case 'HAND_TOGGLE':
        setRemoteHandRaised(!!data.payload);
        break;
      case 'KICK_PEER':
        setEndReason("You have been removed from the meeting.");
        endCall(false);
        break;
      default:
        break;
    }
  };

  const toggleHand = () => {
    const newState = !isHandRaised;
    setIsHandRaised(newState);
    sendSignal('HAND_TOGGLE', newState);
  };

  const kickPeer = () => {
    if (!amIHost) return;
    if (confirm("Are you sure you want to kick this user?")) {
      sendSignal('KICK_PEER');
      setTimeout(() => {
        setEndReason("You removed the participant.");
        endCall(false);
      }, 500);
    }
  };

  const toggleMute = () => {
    if (localStream) {
      localStream.getAudioTracks().forEach(track => { track.enabled = !track.enabled; });
      setIsMuted(!isMuted);
    }
  };

  const toggleVideo = () => {
    if (localStream) {
      localStream.getVideoTracks().forEach(track => { track.enabled = !track.enabled; });
      setIsVideoOff(!isVideoOff);
    }
  };

  // Gracefully end the call without crashing/reloading immediately
  const endCall = (notifyPeer = true) => {
    if (notifyPeer && callRef.current) {
        callRef.current.close();
    }
    if (dataConnRef.current) {
        dataConnRef.current.close();
    }
    stopLocalStream();
    setStatus(CallStatus.ENDED);
  };

  // Return to home screen (this essentially resets the app)
  const goHome = () => {
      window.location.hash = '';
      window.location.reload();
  };

  const copyLink = () => {
    const idToShare = targetRoomId || peerId;
    const url = `${window.location.origin}${window.location.pathname}#/?room=${idToShare}`;
    navigator.clipboard.writeText(url);
    setShowCopied(true);
    setTimeout(() => setShowCopied(false), 2000);
  };

  const renderVideoContainer = (
    ref: React.RefObject<HTMLVideoElement | null>, 
    isLocal: boolean, 
    stream: MediaStream | null,
    handRaised: boolean
  ) => {
    const showPlaceholder = !stream || (isLocal && isVideoOff);
    
    return (
      <div className={`relative overflow-hidden rounded-2xl bg-gray-900 border border-gray-800 shadow-2xl transition-all duration-300 group
        ${isLocal ? 'order-2 md:order-1' : 'order-1 md:order-2'}
        w-full h-full min-h-[200px] object-cover`}
      >
        <video 
          ref={ref} 
          autoPlay 
          playsInline 
          muted={isLocal} // Always mute local video to prevent echo
          className={`w-full h-full object-cover ${isLocal ? 'mirror' : ''} ${showPlaceholder ? 'opacity-0' : 'opacity-100'}`}
        />
        
        {/* Placeholder / Fallback */}
        {showPlaceholder && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-800">
            <div className="w-20 h-20 rounded-full bg-gray-700 flex items-center justify-center">
              <span className="text-2xl font-bold text-gray-500">{isLocal ? 'You' : '...'}</span>
            </div>
          </div>
        )}

        {/* Name Tag */}
        <div className="absolute bottom-4 left-4 bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-lg text-white text-sm font-medium border border-white/10 flex items-center gap-2">
           {isLocal ? 'You' : 'Remote Guest'}
           {isLocal && amIHost && <BadgeCheck className="w-4 h-4 text-blue-400" />}
           {/* Mute Indicator */}
           {isLocal && isMuted && <MicOff className="w-3 h-3 text-red-500" />}
        </div>

        {/* Hand Raise Overlay */}
        {handRaised && (
           <div className="absolute top-4 right-4 bg-brand-500 text-white p-2 rounded-full shadow-lg animate-bounce-small">
              <Hand className="w-5 h-5" />
           </div>
        )}
      </div>
    );
  };

  return (
    <div className="relative h-screen w-full bg-gray-950 flex flex-col overflow-hidden">
      
      {/* Top Bar / Header */}
      <div className="absolute top-0 left-0 right-0 p-4 z-10 flex justify-between items-center bg-gradient-to-b from-gray-950/80 to-transparent">
        <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center text-white font-bold">C</div>
            <span className="font-semibold text-gray-200 hidden md:inline">Connectable</span>
        </div>
        
        {status === CallStatus.CONNECTED && (
          <div className="flex items-center gap-2 px-4 py-2 bg-gray-900/50 backdrop-blur rounded-full border border-gray-800">
             <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
             <span className="text-sm text-gray-300">Live</span> 
          </div>
        )}
      </div>

      {/* Main Grid Area */}
      <div className="flex-1 p-4 md:p-8 flex items-center justify-center transition-all duration-300">
        <div className={`w-full max-w-7xl h-full flex flex-col md:flex-row gap-4 items-center justify-center ${showAiPanel ? 'mr-96' : ''}`}>
           
           {/* NON-CONNECTED STATES (Lobby, Connecting, Ended, Error) */}
           {status !== CallStatus.CONNECTED && (
             <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-gray-950 text-center p-4">
                
                {status === CallStatus.IDLE && !targetRoomId && (
                   <div className="max-w-md w-full bg-gray-900 p-8 rounded-3xl border border-gray-800 shadow-2xl">
                      <div className="w-16 h-16 bg-brand-900/30 rounded-2xl flex items-center justify-center mx-auto mb-6">
                         <Users className="w-8 h-8 text-brand-500" />
                      </div>
                      <h2 className="text-2xl font-bold text-white mb-2">Ready to join?</h2>
                      <p className="text-gray-400 mb-8">Share this link to invite someone to this room.</p>
                      
                      <div className="flex items-center gap-2 bg-gray-950 p-3 rounded-xl border border-gray-800 mb-6 group hover:border-brand-500/50 transition-colors">
                         <div className="p-2 bg-gray-800 rounded-lg">
                           <Sparkles className="w-4 h-4 text-gray-400" />
                         </div>
                         <code className="flex-1 text-sm text-gray-300 font-mono truncate text-left">
                            {window.location.href}
                         </code>
                         <Button variant="ghost" size="sm" onClick={copyLink}>
                            {showCopied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                         </Button>
                      </div>
                      <div className="text-sm text-gray-500">Waiting for others to join...</div>
                   </div>
                )}

                {status === CallStatus.CONNECTING && (
                    <div className="flex flex-col items-center">
                       <div className="w-16 h-16 border-4 border-brand-500 border-t-transparent rounded-full animate-spin mb-6"></div>
                       <h3 className="text-xl font-medium">Connecting to room...</h3>
                    </div>
                )}

                {/* ENDED SCREEN */}
                {status === CallStatus.ENDED && (
                    <div className="max-w-md w-full bg-gray-900 p-8 rounded-3xl border border-gray-800 shadow-2xl flex flex-col items-center animate-in fade-in zoom-in duration-300">
                        <div className="w-16 h-16 bg-gray-800 rounded-full flex items-center justify-center mb-6">
                            <PhoneOff className="w-8 h-8 text-gray-400" />
                        </div>
                        <h2 className="text-2xl font-bold text-white mb-2">Meeting Ended</h2>
                        <p className="text-gray-400 mb-8">{endReason || "You have left the call."}</p>
                        <Button onClick={goHome} className="flex items-center gap-2">
                           <Home className="w-4 h-4" /> Return to Home
                        </Button>
                    </div>
                )}

                {/* ERROR SCREEN */}
                {status === CallStatus.ERROR && (
                   <div className="max-w-md w-full bg-gray-900 p-8 rounded-3xl border border-gray-800 shadow-2xl flex flex-col items-center">
                       <h2 className="text-xl font-bold text-red-400 mb-4">Connection Error</h2>
                       <p className="text-gray-400 mb-6">Could not connect to the room.</p>
                       <Button onClick={goHome}>Try Again</Button>
                   </div>
                )}
             </div>
           )}

           {/* ACTIVE CALL LAYOUT (SPLIT or GRID) */}
           {status === CallStatus.CONNECTED && (
             <div className="flex flex-col md:grid md:grid-cols-2 gap-4 w-full h-full max-h-[80vh]">
                 {/* Remote Video */}
                 {renderVideoContainer(remoteVideoRef, false, remoteStream, remoteHandRaised)}
                 {/* Local Video */}
                 {renderVideoContainer(localVideoRef, true, localStream, isHandRaised)}
             </div>
           )}
        </div>
      </div>

      {/* Control Bar - Only show when CONNECTED */}
      {status === CallStatus.CONNECTED && (
        <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 flex items-center gap-3 bg-gray-900/80 backdrop-blur-xl p-2.5 rounded-2xl border border-gray-800 shadow-2xl z-50">
           <div className="flex items-center gap-2 px-2">
              <Button variant="icon" size="icon" onClick={toggleMute} active={!isMuted} className={isMuted ? 'bg-red-500/10 text-red-500 border-red-500/20' : ''}>
                  {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
              </Button>
              <Button variant="icon" size="icon" onClick={toggleVideo} active={!isVideoOff} className={isVideoOff ? 'bg-red-500/10 text-red-500 border-red-500/20' : ''}>
                  {isVideoOff ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
              </Button>
           </div>

           <div className="w-px h-8 bg-gray-700/50"></div>

           <div className="flex items-center gap-2 px-2">
              <Button variant="icon" size="icon" onClick={toggleHand} active={isHandRaised} className={isHandRaised ? 'bg-yellow-500/20 text-yellow-500 border-yellow-500/20' : ''} title="Raise Hand">
                 <Hand className="w-5 h-5" />
              </Button>
              
              <Button variant="icon" size="icon" onClick={() => setShowAiPanel(!showAiPanel)} active={showAiPanel} className={showAiPanel ? 'bg-brand-600 text-white border-brand-500' : 'text-brand-400'} title="AI Assistant">
                 <Sparkles className="w-5 h-5" />
              </Button>

              {amIHost && status === CallStatus.CONNECTED && (
                  <Button variant="icon" size="icon" onClick={kickPeer} className="text-red-400 hover:text-red-300 hover:bg-red-900/20" title="Kick Participant (Admin)">
                     <ShieldAlert className="w-5 h-5" />
                  </Button>
              )}
           </div>

           <div className="w-px h-8 bg-gray-700/50"></div>

           <Button variant="danger" size="icon" onClick={() => endCall(true)} className="rounded-xl w-14 h-12">
              <PhoneOff className="w-6 h-6" />
           </Button>
        </div>
      )}

      {/* Side Panel */}
      <AiAssistant isOpen={showAiPanel} onClose={() => setShowAiPanel(false)} />
    </div>
  );
};