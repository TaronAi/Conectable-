import React, { useState, useRef, useEffect } from 'react';
import { Send, Sparkles, X, Bot, Loader2 } from 'lucide-react';
import { sendMessageToGemini, initChat } from '../services/geminiService';
import { ChatMessage } from '../types';

interface AiAssistantProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AiAssistant: React.FC<AiAssistantProps> = ({ isOpen, onClose }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'model',
      text: "Hello. I am your AI meeting assistant. How can I help you today?",
      timestamp: Date.now()
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
        initChat("You are a professional AI assistant for a business video call. Keep answers short, professional, and helpful.");
    } catch (e) {
        console.error("Failed to init chat", e);
    }
  }, []);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      text: input,
      timestamp: Date.now()
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      let fullResponse = '';
      const responseId = (Date.now() + 1).toString();
      
      setMessages(prev => [...prev, {
        id: responseId,
        role: 'model',
        text: '',
        timestamp: Date.now()
      }]);

      const stream = sendMessageToGemini(userMsg.text);
      
      for await (const chunk of stream) {
        fullResponse += chunk;
        setMessages(prev => prev.map(msg => 
          msg.id === responseId ? { ...msg, text: fullResponse } : msg
        ));
      }
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="absolute right-0 top-0 h-full w-full md:w-96 bg-gray-950/95 backdrop-blur-xl border-l border-gray-800 shadow-2xl z-40 flex flex-col transform transition-transform duration-300 ease-in-out">
      {/* Header */}
      <div className="flex items-center justify-between p-5 border-b border-gray-800">
        <div className="flex items-center gap-2 font-semibold text-white">
          <div className="p-1.5 bg-brand-600/20 rounded-lg">
            <Sparkles className="w-4 h-4 text-brand-500" />
          </div>
          <span>AI Assistant</span>
        </div>
        <button onClick={onClose} className="p-2 hover:bg-gray-800 rounded-lg transition-colors text-gray-400 hover:text-white">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
          >
            <div className={`flex items-center gap-2 mb-1.5 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
               <div className={`w-6 h-6 rounded-full flex items-center justify-center ${msg.role === 'user' ? 'bg-gray-700' : 'bg-brand-600'}`}>
                  {msg.role === 'user' ? <div className="w-2 h-2 bg-gray-400 rounded-full" /> : <Bot className="w-3 h-3 text-white" />}
               </div>
               <span className="text-xs text-gray-500 font-medium">
                 {msg.role === 'user' ? 'You' : 'AI'}
               </span>
            </div>
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-gray-800 text-white rounded-tr-none border border-gray-700'
                  : 'bg-transparent text-gray-300 border border-gray-800 rounded-tl-none'
              }`}
            >
              {msg.text || <div className="flex gap-1"><span className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce"></span><span className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce delay-75"></span><span className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce delay-150"></span></div>}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-gray-800 bg-gray-900/50">
        <form onSubmit={handleSend} className="relative flex items-center group">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask anything..."
            className="w-full bg-gray-900 text-white placeholder-gray-600 rounded-xl py-3.5 pl-4 pr-12 focus:outline-none focus:ring-1 focus:ring-brand-500 border border-gray-800 transition-all"
          />
          <button
            type="button"
            onClick={() => handleSend()}
            disabled={!input.trim() || isLoading}
            className="absolute right-2 p-2 bg-brand-600 text-white rounded-lg disabled:opacity-50 disabled:bg-gray-800 hover:bg-brand-500 transition-colors shadow-lg shadow-brand-500/20"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </form>
      </div>
    </div>
  );
};
