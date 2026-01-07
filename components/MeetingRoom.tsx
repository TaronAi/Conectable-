import React, { useEffect, useRef, useState, useCallback } from 'react';
import Peer, { MediaConnection, DataConnection } from 'peerjs';
import { 
  Mic, MicOff, Video, VideoOff, PhoneOff, 
  Copy, Check, Sparkles, Users, Hand, ShieldAlert, BadgeCheck, Home, UserCircle, MoreVertical
} from 'lucide-react';
import { Button } from './Button';
import { AiAssistant } from './GeminiAssistant';
import { CallStatus, SignalMessage } from '../types';

interface MeetingRoomProps {
  roomId?: string; 
}

export const MeetingRoom: React.FC<MeetingRoomProps> = ({ roomId: targetRoomId }) => {
  // --- STATE ---
  // Setup & Identity
  const [userName, setUserName] = useState<string>('');
  const [remoteUserName, setRemoteUserName] = useState<string>('Guest');
  const [isSetupComplete, setIsSetupComplete] = useState(false);
  const [peerId, setPeerId] = useState<string>('');
  
  // Call Status
  const [status, setStatus] = useState<CallStatus>(CallStatus.IDLE);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [endReason, setEndReason] = useState<string | null>(null);
  
  // Controls
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [showCopied, setShowCopied] = useState(false);
  const [showAiPanel, setShowAiPanel] = useState(false);
  const [remoteMenuOpen, setRemoteMenuOpen] = useState(false);
  
  // Advanced Features
  const [isHandRaised, setIsHandRaised] = useState(false);
  const [remoteHandRaised, setRemoteHandRaised] = useState(false);
  
  const amIHost = !targetRoomId; 

  // --- REFS ---
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const previewVideoRef = useRef<HTMLVideoElement>(null); // For setup screen
  const peerInstance = useRef<Peer | null>(null);
  const callRef = useRef<MediaConnection | null>(null);
  const dataConnRef = useRef<DataConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);

  // --- MEDIA INITIALIZATION ---
  const initMedia = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true
      });
      setLocalStream(stream);
      localStreamRef.current = stream;
      return stream;
    } catch (err) {
      console.error("Failed to get media", err);
      return null;
    }
  }, []);

  // Run media init immediately for preview
  useEffect(() => {
    initMedia();
    return () => stopLocalStream();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Attach stream to PREVIEW video (Setup Screen)
  useEffect(() => {
    if (previewVideoRef.current && localStream && !isSetupComplete) {
      previewVideoRef.current.srcObject = localStream;
    }
  }, [localStream, isSetupComplete]);

  // Attach stream to MAIN LOCAL video (Meeting Screen)
  useEffect(() => {
    if (localVideoRef.current && localStream && isSetupComplete) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream, isSetupComplete, status]);

  // Attach stream to REMOTE video
  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream, status]);

  // --- SIGNALING & PEER LOGIC ---
  const sendSignal = (type: SignalMessage['type'], payload?: any) => {
    if (dataConnRef.current && dataConnRef.current.open) {
      dataConnRef.current.send({ type, payload } as SignalMessage);
    }
  };

  const handleSignal = (data: SignalMessage) => {
    switch (data.type) {
      case 'NAME_UPDATE':
        setRemoteUserName(data.payload);
        break;
      case 'HAND_TOGGLE':
        setRemoteHandRaised(!!data.payload);
        break;
      case 'KICK_PEER':
        setEndReason("You have been removed from the meeting.");
        endCall(false);
        break;
      case 'MUTE_REMOTE_REQ':
        if (localStreamRef.current) {
            localStreamRef.current.getAudioTracks().forEach(track => { track.enabled = false; });
            setIsMuted(true);
            alert("The host has muted your microphone.");
        }
        break;
      default:
        break;
    }
  };

  // Initialize PeerJS only AFTER setup is complete
  useEffect(() => {
    if (!isSetupComplete || !localStream) return;

    const initPeer = async () => {
      const PeerDetails = (await import('peerjs')).default;
      const peer = new PeerDetails();

      peer.on('open', (id) => {
        setPeerId(id);
        
        // If Host: We are "Connected" to the room immediately (even if alone)
        if (amIHost) {
            setStatus(CallStatus.CONNECTED); 
        } else {
            setStatus(CallStatus.CONNECTING);
        }

        // JOINING A ROOM
        if (targetRoomId) {
          // 1. Establish Media Call
          const call = peer.call(targetRoomId, localStream);
          
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

          // 2. Establish Data Connection
          const conn = peer.connect(targetRoomId);
          conn.on('open', () => {
            dataConnRef.current = conn;
            // Send my name immediately upon connection
            conn.send({ type: 'NAME_UPDATE', payload: userName });
          });
          conn.on('data', (data: any) => handleSignal(data));
        }
      });

      // HOSTING A ROOM
      peer.on('call', (call) => {
        call.answer(localStream);
        setStatus(CallStatus.CONNECTED);
        call.on('stream', (remoteStream) => {
            setRemoteStream(remoteStream);
        });
        call.on('close', () => {
            // When peer leaves, we stay in room, but remote stream is gone
            setRemoteStream(null);
            setRemoteUserName('Guest');
        });
        callRef.current = call;
      });

      peer.on('connection', (conn) => {
        dataConnRef.current = conn;
        conn.on('open', () => {
           // Send my name to the new guest
           conn.send({ type: 'NAME_UPDATE', payload: userName });
        });
        conn.on('data', (data: any) => {
            handleSignal(data);
            // If we received a name update, ensure we send ours back if it's the first contact
            if (data.type === 'NAME_UPDATE') {
                conn.send({ type: 'NAME_UPDATE', payload: userName });
            }
        });
      });

      peerInstance.current = peer;
    };

    initPeer();

    return () => {
      if (peerInstance.current) peerInstance.current.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSetupComplete]); // Only run once setup is done

  // --- ACTIONS ---

  const joinMeeting = () => {
    if (!userName.trim()) {
        alert("Please enter your name");
        return;
    }
    setIsSetupComplete(true);
  };

  const stopLocalStream = () => {
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
    }
    localStreamRef.current = null;
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
        // Just close the call on our end
        if (callRef.current) callRef.current.close();
        if (dataConnRef.current) dataConnRef.current.close();
        setRemoteStream(null);
        setRemoteUserName('Guest');
      }, 500);
    }
  };

  const mutePeer = () => {
    if (!amIHost) return;
    sendSignal('MUTE_REMOTE_REQ');
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

  // --- RENDER HELPERS ---

  const renderVideoContainer = (
    ref: React.RefObject<HTMLVideoElement | null>, 
    isLocal: boolean, 
    stream: MediaStream | null,
    handRaised: boolean,
    displayName: string
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
          muted={isLocal} 
          className={`w-full h-full object-cover ${isLocal ? 'mirror' : ''} ${showPlaceholder ? 'opacity-0' : 'opacity-100'}`}
        />
        
        {/* Placeholder / Fallback */}
        {showPlaceholder && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-800">
            <div className="w-24 h-24 rounded-full bg-gray-700 flex items-center justify-center">
              <span className="text-3xl font-bold text-gray-500 uppercase">{displayName.charAt(0)}</span>
            </div>
          </div>
        )}

        {/* Name Tag */}
        <div className="absolute bottom-4 left-4 bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-lg text-white text-sm font-medium border border-white/10 flex items-center gap-2 z-10">
           {displayName} {isLocal && '(You)'}
           {isLocal && amIHost && <BadgeCheck className="w-4 h-4 text-blue-400" />}
           {/* Mute Indicator */}
           {isLocal && isMuted && <MicOff className="w-3 h-3 text-red-500" />}
        </div>

        {/* Hand Raise Overlay - Moved to top-left */}
        {handRaised && (
           <div className="absolute top-4 left-4 bg-brand-500 text-white p-2 rounded-full shadow-lg animate-bounce-small z-10">
              <Hand className="w-5 h-5" />
           </div>
        )}

        {/* Admin Menu - Only on Remote Video for Host */}
        {!isLocal && amIHost && (
          <div className="absolute top-4 right-4 z-20">
            <Button 
              variant="icon" 
              size="icon" 
              onClick={(e) => { e.stopPropagation(); setRemoteMenuOpen(!remoteMenuOpen); }}
              className="bg-black/40 border-white/10 hover:bg-black/60 text-white rounded-full w-10 h-10 p-0 backdrop-blur-sm"
            >
              <MoreVertical className="w-5 h-5" />
            </Button>
            
            {/* Menu Dropdown */}
            {remoteMenuOpen && (
              <>
                <div 
                    className="fixed inset-0 z-30" 
                    onClick={() => setRemoteMenuOpen(false)} 
                />
                <div className="absolute right-0 top-full mt-2 w-48 bg-gray-900/95 backdrop-blur-xl border border-gray-700 rounded-xl shadow-2xl overflow-hidden flex flex-col p-1 animate-in fade-in zoom-in-95 duration-200 z-40">
                    <button 
                    onClick={() => { mutePeer(); setRemoteMenuOpen(false); }}
                    className="flex items-center gap-3 w-full px-3 py-2.5 text-sm text-gray-200 hover:text-white hover:bg-white/10 rounded-lg transition-colors text-left"
                    >
                    <MicOff className="w-4 h-4 text-orange-400" /> Mute User
                    </button>
                    <div className="h-px bg-gray-700/50 my-1 mx-2"></div>
                    <button 
                    onClick={() => { kickPeer(); setRemoteMenuOpen(false); }}
                    className="flex items-center gap-3 w-full px-3 py-2.5 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors text-left"
                    >
                    <ShieldAlert className="w-4 h-4" /> Kick User
                    </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    );
  };

  // --- VIEW: NAME SETUP SCREEN ---
  if (!isSetupComplete && status !== CallStatus.ENDED) {
      return (
        <div className="h-screen w-full bg-gray-950 flex items-center justify-center p-4">
             <div className="max-w-4xl w-full flex flex-col md:flex-row gap-8 items-center justify-center">
                 
                 {/* Preview Video */}
                 <div className="relative w-full max-w-md aspect-video bg-gray-900 rounded-2xl overflow-hidden border border-gray-800 shadow-2xl">
                    <video 
                        ref={previewVideoRef}
                        autoPlay
                        playsInline
                        muted
                        className={`w-full h-full object-cover mirror ${isVideoOff ? 'opacity-0' : 'opacity-100'}`}
                    />
                    {isVideoOff && (
                        <div className="absolute inset-0 flex items-center justify-center text-gray-500">
                            Camera Off
                        </div>
                    )}
                    <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex items-center gap-3 bg-gray-900/60 backdrop-blur p-2 rounded-xl border border-gray-700">
                        <Button variant="icon" size="sm" onClick={toggleMute} active={!isMuted}>
                            {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                        </Button>
                        <Button variant="icon" size="sm" onClick={toggleVideo} active={!isVideoOff}>
                             {isVideoOff ? <VideoOff className="w-4 h-4" /> : <Video className="w-4 h-4" />}
                        </Button>
                    </div>
                 </div>

                 {/* Setup Form */}
                 <div className="w-full max-w-sm space-y-6">
                    <div>
                        <h1 className="text-3xl font-bold text-white mb-2">Get Ready</h1>
                        <p className="text-gray-400">Check your audio and video before joining.</p>
                    </div>

                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-1">Display Name</label>
                            <div className="relative">
                                <UserCircle className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 w-5 h-5" />
                                <input 
                                    type="text" 
                                    value={userName}
                                    onChange={(e) => setUserName(e.target.value)}
                                    placeholder="Enter your name"
                                    className="w-full bg-gray-900 border border-gray-700 rounded-xl py-3 pl-10 pr-4 text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-brand-500"
                                />
                            </div>
                        </div>

                        <Button 
                            className="w-full py-4 text-lg font-semibold" 
                            onClick={joinMeeting}
                            disabled={!userName.trim()}
                        >
                            {targetRoomId ? "Join Meeting" : "Start Meeting"}
                        </Button>
                    </div>
                 </div>
             </div>
        </div>
      )
  }

  // --- VIEW: MEETING ROOM ---
  return (
    <div className="relative h-screen w-full bg-gray-950 flex flex-col overflow-hidden">
      
      {/* Top Bar / Header */}
      <div className="absolute top-0 left-0 right-0 p-4 z-10 flex justify-between items-center bg-gradient-to-b from-gray-950/80 to-transparent">
        <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center text-white font-bold">C</div>
            <span className="font-semibold text-gray-200 hidden md:inline">Connectable</span>
        </div>
        
        {/* Show room ID for Host even if no one connected yet */}
        {amIHost && status === CallStatus.CONNECTED && (
             <div className="flex items-center gap-2 bg-gray-900/50 backdrop-blur rounded-full border border-gray-800 px-3 py-1.5 hover:border-brand-500/50 transition-colors">
                <Users className="w-4 h-4 text-gray-400" />
                <span className="text-sm text-gray-300 max-w-[150px] truncate">{window.location.href}</span>
                <button onClick={copyLink} className="p-1 hover:text-white text-gray-400">
                    {showCopied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                </button>
             </div>
        )}

        {status === CallStatus.CONNECTED && (
          <div className="flex items-center gap-2 px-4 py-2 bg-gray-900/50 backdrop-blur rounded-full border border-gray-800">
             <div className={`w-2 h-2 rounded-full ${remoteStream ? 'bg-green-500 animate-pulse' : 'bg-yellow-500'}`}></div>
             <span className="text-sm text-gray-300">{remoteStream ? 'Live' : 'Waiting for others'}</span> 
          </div>
        )}
      </div>

      {/* Main Grid Area */}
      <div className="flex-1 p-4 md:p-8 flex items-center justify-center transition-all duration-300">
        <div className={`w-full max-w-7xl h-full flex flex-col md:flex-row gap-4 items-center justify-center ${showAiPanel ? 'mr-96' : ''}`}>
           
           {/* NON-CONNECTED STATES (Connecting, Ended, Error) */}
           {/* Note: Host goes straight to CONNECTED. Guest might see CONNECTING. */}
           {status === CallStatus.CONNECTING && (
                <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-gray-950 text-center p-4">
                   <div className="flex flex-col items-center">
                       <div className="w-16 h-16 border-4 border-brand-500 border-t-transparent rounded-full animate-spin mb-6"></div>
                       <h3 className="text-xl font-medium">Connecting to room...</h3>
                    </div>
                </div>
           )}

           {/* ENDED SCREEN */}
           {status === CallStatus.ENDED && (
                <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-gray-950 text-center p-4">
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
                </div>
           )}

           {/* ERROR SCREEN */}
           {status === CallStatus.ERROR && (
               <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-gray-950 text-center p-4">
                   <div className="max-w-md w-full bg-gray-900 p-8 rounded-3xl border border-gray-800 shadow-2xl flex flex-col items-center">
                       <h2 className="text-xl font-bold text-red-400 mb-4">Connection Error</h2>
                       <p className="text-gray-400 mb-6">Could not connect to the room.</p>
                       <Button onClick={goHome}>Try Again</Button>
                   </div>
               </div>
           )}

           {/* ACTIVE CALL LAYOUT (SPLIT or GRID) */}
           {/* Show this if Connected OR if (I am Host and everything is setup, even if waiting) */}
           {(status === CallStatus.CONNECTED) && (
             <div className={`flex flex-col gap-4 w-full h-full max-h-[80vh] ${remoteStream ? 'md:grid md:grid-cols-2' : 'flex items-center justify-center'}`}>
                 {/* Remote Video - Only show if exists */}
                 {remoteStream ? (
                    renderVideoContainer(remoteVideoRef, false, remoteStream, remoteHandRaised, remoteUserName)
                 ) : (
                    // Empty state waiting for guest (only visible to host)
                    <div className="hidden md:flex flex-1 w-full h-full rounded-2xl border-2 border-dashed border-gray-800 items-center justify-center flex-col gap-4 bg-gray-900/20">
                        <div className="w-16 h-16 bg-gray-800 rounded-full flex items-center justify-center animate-pulse">
                            <Users className="w-8 h-8 text-gray-500" />
                        </div>
                        <p className="text-gray-500 font-medium">Waiting for others to join...</p>
                        <Button variant="secondary" size="sm" onClick={copyLink} className="gap-2">
                            {showCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                            Copy Invite Link
                        </Button>
                    </div>
                 )}
                 
                 {/* Local Video - Always show */}
                 <div className={`${!remoteStream ? 'w-full max-w-2xl aspect-video h-auto' : 'w-full h-full'}`}>
                    {renderVideoContainer(localVideoRef, true, localStream, isHandRaised, userName)}
                 </div>
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