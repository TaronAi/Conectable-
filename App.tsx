import React, { useEffect, useState } from 'react';
import { MeetingRoom } from './components/MeetingRoom';
import { Video, Globe2, ShieldCheck, Zap } from 'lucide-react';

const App = () => {
  const [roomId, setRoomId] = useState<string | undefined>(undefined);
  const [inLobby, setInLobby] = useState(true);

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash;
      const params = new URLSearchParams(hash.split('?')[1]);
      const room = params.get('room');
      
      if (room) {
        setRoomId(room);
        setInLobby(false);
      } else {
        setRoomId(undefined);
        setInLobby(true);
      }
    };
    handleHashChange();
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const startMeeting = () => {
    setInLobby(false);
  };

  if (!inLobby) {
    return <MeetingRoom roomId={roomId} />;
  }

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Abstract Background */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0">
          <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-brand-600/10 rounded-full blur-[100px]" />
          <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-600/10 rounded-full blur-[100px]" />
      </div>

      <nav className="absolute top-0 left-0 right-0 p-6 flex justify-between items-center z-10 max-w-7xl mx-auto w-full">
         <div className="flex items-center gap-2 font-bold text-xl tracking-tight">
            <div className="w-8 h-8 bg-brand-600 rounded-lg flex items-center justify-center text-white">C</div>
            <span>Connectable</span>
         </div>
         <a href="#" className="text-gray-400 hover:text-white transition-colors text-sm font-medium">Help Center</a>
      </nav>

      <div className="z-10 max-w-4xl w-full text-center space-y-10 mt-10">
        <div className="space-y-6">
           <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-900/30 border border-brand-500/20 text-brand-300 text-sm font-medium mb-4">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-brand-500"></span>
              </span>
              Now with AI Assistance
           </div>
           
           <h1 className="text-5xl md:text-7xl font-bold tracking-tight text-white leading-[1.1]">
             Connect instantly.<br />
             <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-500 to-purple-500">No downloads needed.</span>
           </h1>
           
           <p className="text-xl text-gray-400 max-w-2xl mx-auto leading-relaxed">
             Secure, peer-to-peer video conferencing with built-in AI tools. Create a room, share the link, and start collaborating in seconds.
           </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center pt-4">
          <button 
            onClick={startMeeting}
            className="group relative px-8 py-4 bg-brand-600 text-white text-lg font-semibold rounded-2xl hover:bg-brand-500 transition-all shadow-[0_0_40px_-10px_rgba(79,70,229,0.5)] hover:shadow-[0_0_60px_-15px_rgba(79,70,229,0.6)] flex items-center gap-3"
          >
            Create Meeting
            <span className="bg-white/20 rounded-lg p-1 group-hover:translate-x-1 transition-transform">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </span>
          </button>
        </div>

        {/* Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-12 text-left">
           <div className="p-6 rounded-2xl bg-gray-900/50 border border-gray-800 backdrop-blur-sm hover:bg-gray-800/50 transition-colors">
              <div className="w-10 h-10 bg-blue-900/30 rounded-lg flex items-center justify-center mb-4">
                 <Zap className="w-5 h-5 text-blue-400" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">Lightning Fast</h3>
              <p className="text-sm text-gray-400">Powered by WebRTC for low-latency, high-quality video streams directly between devices.</p>
           </div>
           <div className="p-6 rounded-2xl bg-gray-900/50 border border-gray-800 backdrop-blur-sm hover:bg-gray-800/50 transition-colors">
              <div className="w-10 h-10 bg-purple-900/30 rounded-lg flex items-center justify-center mb-4">
                 <ShieldCheck className="w-5 h-5 text-purple-400" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">Secure P2P</h3>
              <p className="text-sm text-gray-400">Your data flows directly between you and your guest. No middleman servers recording calls.</p>
           </div>
           <div className="p-6 rounded-2xl bg-gray-900/50 border border-gray-800 backdrop-blur-sm hover:bg-gray-800/50 transition-colors">
              <div className="w-10 h-10 bg-brand-900/30 rounded-lg flex items-center justify-center mb-4">
                 <Globe2 className="w-5 h-5 text-brand-400" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">Browser Based</h3>
              <p className="text-sm text-gray-400">Works in any modern browser. No installations or sign-ups required to join.</p>
           </div>
        </div>
      </div>
      
      <footer className="absolute bottom-6 text-gray-600 text-sm flex gap-6">
        <span>© 2024 Connectable</span>
        <a href="#" className="hover:text-gray-400">Privacy</a>
        <a href="#" className="hover:text-gray-400">Terms</a>
      </footer>
    </div>
  );
};

export default App;
