'use client';

// ============================================================
// Placeholder Chat — DFD Process 7.0 (Placeholder UI)
// ============================================================

import React, { useState, useRef, useEffect } from 'react';
import { Send, User, Sparkles, Paperclip } from 'lucide-react';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export default function PlaceholderChat({ toolName }: { toolName: string }) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: `Hello! I am your ${toolName} assistant. How can I help you today?`,
      timestamp: new Date()
    }
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    // Simulate AI response
    setTimeout(() => {
      const assistantMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `This is a placeholder response for the **${toolName}**. \n\nIn Phase 2, this will be connected to a real AI model (Claude/GPT) to process your request: "${input}".`,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, assistantMsg]);
      setIsTyping(false);
    }, 1500);
  };

  return (
    <div className="card" style={{ height: '100%', display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}>
      {/* Chat Area */}
      <div 
        ref={scrollRef}
        style={{ 
          flex: 1, 
          overflowY: 'auto', 
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '24px'
        }}
      >
        {messages.map((msg) => (
          <div 
            key={msg.id} 
            style={{ 
              display: 'flex', 
              gap: '16px', 
              alignItems: 'flex-start',
              flexDirection: msg.role === 'user' ? 'row-reverse' : 'row'
            }}
          >
            <div style={{ 
              width: '36px', 
              height: '36px', 
              borderRadius: '10px', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              background: msg.role === 'user' ? 'var(--primary)' : 'var(--surface-2)',
              flexShrink: 0
            }}>
              {msg.role === 'user' ? <User size={18} color="white" /> : <Sparkles size={18} className="text-primary-light" />}
            </div>
            
            <div style={{ 
              maxWidth: '80%', 
              padding: '16px', 
              borderRadius: 'var(--radius-md)',
              background: msg.role === 'user' ? 'rgba(124, 58, 237, 0.12)' : 'var(--surface-1)',
              border: '1px solid var(--border)',
              fontSize: '0.9375rem',
              whiteSpace: 'pre-wrap'
            }}>
              {msg.content}
              <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: '8px', textAlign: msg.role === 'user' ? 'right' : 'left' }}>
                {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          </div>
        ))}
        {isTyping && (
          <div style={{ display: 'flex', gap: '12px', paddingLeft: '52px' }}>
            <div className="dot-typing"></div>
          </div>
        )}
      </div>

      {/* Input Area */}
      <div style={{ padding: '24px', borderTop: '1px solid var(--border)', background: 'rgba(0, 0, 0, 0.2)' }}>
        <form onSubmit={handleSend} style={{ display: 'flex', gap: '12px', position: 'relative' }}>
          <button type="button" className="btn-outline" style={{ padding: '0 12px', borderRadius: 'var(--radius-md)' }}>
            <Paperclip size={20} className="text-dim" />
          </button>
          <input 
            type="text" 
            placeholder={`Message ${toolName}...`} 
            value={input}
            onChange={(e) => setInput(e.target.value)}
            style={{ flex: 1, height: '48px' }}
          />
          <button type="submit" className="btn btn-primary" style={{ padding: '0 20px' }}>
            <Send size={18} />
          </button>
        </form>
      </div>

      <style jsx>{`
        .dot-typing {
          position: relative;
          left: -9999px;
          width: 6px;
          height: 6px;
          border-radius: 5px;
          background-color: var(--primary-light);
          color: var(--primary-light);
          box-shadow: 9984px 0 0 0 var(--primary-light), 9999px 0 0 0 var(--primary-light), 10014px 0 0 0 var(--primary-light);
          animation: dotTyping 1.5s infinite linear;
        }

        @keyframes dotTyping {
          0% { box-shadow: 9984px 0 0 0 var(--primary-light), 9999px 0 0 0 var(--primary-light), 10014px 0 0 0 var(--primary-light); }
          16.667% { box-shadow: 9984px -6px 0 0 var(--primary-light), 9999px 0 0 0 var(--primary-light), 10014px 0 0 0 var(--primary-light); }
          33.333% { box-shadow: 9984px 0 0 0 var(--primary-light), 9999px 0 0 0 var(--primary-light), 10014px 0 0 0 var(--primary-light); }
          50% { box-shadow: 9984px 0 0 0 var(--primary-light), 9999px -6px 0 0 var(--primary-light), 10014px 0 0 0 var(--primary-light); }
          66.667% { box-shadow: 9984px 0 0 0 var(--primary-light), 9999px 0 0 0 var(--primary-light), 10014px 0 0 0 var(--primary-light); }
          83.333% { box-shadow: 9984px 0 0 0 var(--primary-light), 9999px 0 0 0 var(--primary-light), 10014px -6px 0 0 var(--primary-light); }
          100% { box-shadow: 9984px 0 0 0 var(--primary-light), 9999px 0 0 0 var(--primary-light), 10014px 0 0 0 var(--primary-light); }
        }
      `}</style>
    </div>
  );
}
