'use client';
import { useState, useRef, useEffect } from 'react';
import { Send, Loader2, MessageCircle, X, Minimize2 } from 'lucide-react';

interface Message {
  role: 'user' | 'assistant';
  text: string;
  source?: string;
}

const SUGGESTIONS = [
  "Show today's hot leads",
  'Which deals are at risk?',
  'Show overdue follow-ups',
  'Pipeline summary',
  'Top performing content',
  'Revenue forecast this month',
];

export function FloatingCopilot() {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Mock mode - will work without OpenAI key
  const sendMessage = async (query: string) => {
    if (!query.trim() || loading) return;
    
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: query }]);
    setLoading(true);

    try {
      const res = await fetch('/api/v3/copilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });
      
      const data = await res.json() as { answer?: string; data_source?: string; error?: string };
      
      setMessages(prev => [...prev, {
        role: 'assistant',
        text: data.answer ?? data.error ?? 'Something went wrong.',
        source: data.data_source,
      }]);
      
      // Increment unread if minimized
      if (isMinimized) {
        setUnreadCount(prev => prev + 1);
      }
    } catch {
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        text: 'Could not reach the AI. Please check your connection.' 
      }]);
    } finally {
      setLoading(false);
    }
  };

  const toggleChat = () => {
    setIsOpen(!isOpen);
    if (!isOpen) {
      setUnreadCount(0);
      setIsMinimized(false);
    }
  };

  const toggleMinimize = () => {
    setIsMinimized(!isMinimized);
    if (isMinimized) {
      setUnreadCount(0);
    }
  };

  return (
    <>
      {/* Floating Chat Bubble */}
      {!isOpen && (
        <button
          onClick={toggleChat}
          className="floating-chat-button"
          style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            width: '60px',
            height: '60px',
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #4f6df5, #8b5cf6)',
            border: 'none',
            cursor: 'pointer',
            boxShadow: '0 8px 24px rgba(79, 109, 245, 0.4), 0 2px 8px rgba(0,0,0,0.1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.3s ease',
            zIndex: 9999,
            animation: 'pulse 2s infinite',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'scale(1.1)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
          }}
        >
          <MessageCircle size={28} color="white" />
          {unreadCount > 0 && (
            <div style={{
              position: 'absolute',
              top: '-4px',
              right: '-4px',
              width: '24px',
              height: '24px',
              borderRadius: '50%',
              background: '#ef4444',
              color: 'white',
              fontSize: '11px',
              fontWeight: 'bold',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '2px solid white',
            }}>
              {unreadCount > 9 ? '9+' : unreadCount}
            </div>
          )}
        </button>
      )}

      {/* Chat Window */}
      {isOpen && (
        <div
          className="floating-chat-window"
          style={{
            position: 'fixed',
            bottom: isMinimized ? '-420px' : '24px',
            right: '24px',
            width: '380px',
            height: '520px',
            borderRadius: '20px',
            background: 'rgba(255, 255, 255, 0.95)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(255, 255, 255, 0.8)',
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.15), 0 8px 24px rgba(79, 109, 245, 0.2)',
            display: 'flex',
            flexDirection: 'column',
            zIndex: 9999,
            transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <div style={{
            padding: '16px 20px',
            background: 'linear-gradient(135deg, #4f6df5, #8b5cf6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderRadius: '20px 20px 0 0',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                background: 'rgba(255, 255, 255, 0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                animation: 'glow 2s infinite',
              }}>
                <MessageCircle size={20} color="white" />
              </div>
              <div>
                <div style={{ fontSize: '15px', fontWeight: '700', color: 'white' }}>
                  AI Copilot
                </div>
                <div style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.8)' }}>
                  Always here to help
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={toggleMinimize}
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  background: 'rgba(255, 255, 255, 0.2)',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'background 0.2s',
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)'}
              >
                <Minimize2 size={16} color="white" />
              </button>
              <button
                onClick={toggleChat}
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  background: 'rgba(255, 255, 255, 0.2)',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'background 0.2s',
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)'}
              >
                <X size={16} color="white" />
              </button>
            </div>
          </div>

          {/* Messages Area */}
          <div style={{
            flex: 1,
            overflowY: 'auto',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            background: 'linear-gradient(to bottom, rgba(245, 247, 250, 0.5), rgba(255, 255, 255, 0.3))',
          }}>
            {messages.length === 0 ? (
              <>
                {/* Welcome Message */}
                <div style={{ display: 'flex', gap: '10px', animation: 'slideIn 0.5s' }}>
                  <div style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, #4f6df5, #8b5cf6)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '12px',
                    fontWeight: '700',
                    color: 'white',
                    flexShrink: 0,
                  }}>
                    AI
                  </div>
                  <div style={{
                    background: 'white',
                    borderRadius: '0 16px 16px 16px',
                    padding: '12px 16px',
                    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)',
                    maxWidth: '280px',
                  }}>
                    <div style={{ fontSize: '13px', color: '#374151', lineHeight: '1.5' }}>
                      👋 Hi! I'm your AI assistant. I can help you with:
                    </div>
                    <ul style={{ fontSize: '12px', color: '#6b7280', margin: '8px 0 0 16px', padding: 0 }}>
                      <li>Find hot leads</li>
                      <li>Check pipeline status</li>
                      <li>Review overdue tasks</li>
                      <li>Analyze revenue data</li>
                    </ul>
                  </div>
                </div>

                {/* Suggestion Chips */}
                <div style={{ marginTop: '12px' }}>
                  <div style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '8px', paddingLeft: '4px' }}>
                    Try asking:
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    {SUGGESTIONS.map(suggestion => (
                      <button
                        key={suggestion}
                        onClick={() => void sendMessage(suggestion)}
                        style={{
                          padding: '10px 12px',
                          borderRadius: '12px',
                          background: 'white',
                          border: '1px solid #e5e7eb',
                          fontSize: '12px',
                          color: '#374151',
                          cursor: 'pointer',
                          textAlign: 'left',
                          transition: 'all 0.2s',
                          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.borderColor = '#4f6df5';
                          e.currentTarget.style.transform = 'translateY(-2px)';
                          e.currentTarget.style.boxShadow = '0 4px 12px rgba(79, 109, 245, 0.15)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.borderColor = '#e5e7eb';
                          e.currentTarget.style.transform = 'translateY(0)';
                          e.currentTarget.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.05)';
                        }}
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <>
                {/* Chat Messages */}
                {messages.map((message, index) => (
                  <div
                    key={index}
                    style={{
                      display: 'flex',
                      gap: '10px',
                      justifyContent: message.role === 'user' ? 'flex-end' : 'flex-start',
                      animation: 'slideIn 0.3s',
                    }}
                  >
                    {message.role === 'assistant' && (
                      <div style={{
                        width: '28px',
                        height: '28px',
                        borderRadius: '50%',
                        background: 'linear-gradient(135deg, #4f6df5, #8b5cf6)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '11px',
                        fontWeight: '700',
                        color: 'white',
                        flexShrink: 0,
                        marginTop: '2px',
                      }}>
                        AI
                      </div>
                    )}
                    <div style={{
                      maxWidth: '75%',
                      padding: '10px 14px',
                      borderRadius: message.role === 'user' ? '16px 16px 0 16px' : '0 16px 16px 16px',
                      background: message.role === 'user'
                        ? 'linear-gradient(135deg, #4f6df5, #8b5cf6)'
                        : 'white',
                      color: message.role === 'user' ? 'white' : '#374151',
                      fontSize: '13px',
                      lineHeight: '1.5',
                      boxShadow: message.role === 'assistant' ? '0 2px 8px rgba(0, 0, 0, 0.08)' : 'none',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                    }}>
                      {message.text}
                      {message.source && (
                        <div style={{
                          fontSize: '10px',
                          opacity: 0.7,
                          marginTop: '6px',
                          paddingTop: '6px',
                          borderTop: '1px solid rgba(255, 255, 255, 0.2)',
                        }}>
                          📊 {message.source}
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {/* Loading Indicator */}
                {loading && (
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <div style={{
                      width: '28px',
                      height: '28px',
                      borderRadius: '50%',
                      background: 'linear-gradient(135deg, #4f6df5, #8b5cf6)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}>
                      <Loader2 size={14} color="white" style={{ animation: 'spin 1s linear infinite' }} />
                    </div>
                    <div style={{ fontSize: '12px', color: '#9ca3af' }}>
                      Thinking...
                    </div>
                  </div>
                )}
              </>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input Area */}
          <div style={{
            padding: '16px 20px',
            background: 'white',
            borderTop: '1px solid #e5e7eb',
            borderRadius: '0 0 20px 20px',
          }}>
            <div style={{
              display: 'flex',
              gap: '8px',
              background: '#f3f4f6',
              borderRadius: '16px',
              padding: '8px 12px',
              alignItems: 'center',
            }}>
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void sendMessage(input);
                  }
                }}
                placeholder="Ask me anything..."
                disabled={loading}
                style={{
                  flex: 1,
                  background: 'none',
                  border: 'none',
                  outline: 'none',
                  fontSize: '13px',
                  color: '#374151',
                }}
              />
              <button
                onClick={() => void sendMessage(input)}
                disabled={loading || !input.trim()}
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '12px',
                  background: (loading || !input.trim())
                    ? '#e5e7eb'
                    : 'linear-gradient(135deg, #4f6df5, #8b5cf6)',
                  border: 'none',
                  cursor: (loading || !input.trim()) ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.2s',
                  flexShrink: 0,
                }}
              >
                <Send size={16} color="white" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Animations */}
      <style>{`
        @keyframes pulse {
          0%, 100% { box-shadow: 0 8px 24px rgba(79, 109, 245, 0.4), 0 2px 8px rgba(0,0,0,0.1); }
          50% { box-shadow: 0 12px 32px rgba(79, 109, 245, 0.6), 0 4px 16px rgba(0,0,0,0.15); }
        }
        @keyframes slideIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes glow {
          0%, 100% { box-shadow: 0 0 10px rgba(255, 255, 255, 0.3); }
          50% { box-shadow: 0 0 20px rgba(255, 255, 255, 0.5); }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </>
  );
}
