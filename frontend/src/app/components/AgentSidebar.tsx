import React, { useState, useEffect, useRef } from 'react';
import { Bot, Send, X, Minimize2, Maximize2, MessageSquare, Loader2, Sparkles } from 'lucide-react';
import { Button, cn } from './ui';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export const AgentSidebar = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  // Listen for custom event to trigger agent from other pages
  useEffect(() => {
    const handleTrigger = (e: any) => {
      setIsOpen(true);
      setIsMinimized(false);
      if (e.detail?.initialMessage) {
        handleSendMessage(e.detail.initialMessage);
      }
    };
    window.addEventListener('trigger-agent', handleTrigger);
    return () => window.removeEventListener('trigger-agent', handleTrigger);
  }, []);

  const handleSendMessage = async (text: string = input) => {
    if (!text.trim() || isTyping) return;

    const newMessages: Message[] = [...messages, { role: 'user', content: text }];
    setMessages(newMessages);
    setInput('');
    setIsTyping(true);

    try {
      const response = await fetch('/api/v1/agent/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('id_visual_token')}`
        },
        body: JSON.stringify({
          messages: newMessages.map(m => ({ role: m.role, content: m.content }))
        })
      });

      if (!response.ok) throw new Error('Falha na comunicação com o Agente');

      const reader = response.body?.getReader();
      if (!reader) throw new Error('Stream não disponível');

      let assistantMessage = '';
      setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = new TextDecoder().decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.replace('data: ', '').trim();
            if (dataStr === '[DONE]') continue;
            
            try {
              const data = JSON.parse(dataStr);
              if (data.content) {
                assistantMessage += data.content;
                setMessages(prev => {
                  const last = prev[prev.length - 1];
                  return [...prev.slice(0, -1), { ...last, content: assistantMessage }];
                });
              } else if (data.error) {
                assistantMessage += `\n[Erro: ${data.error}]`;
                setMessages(prev => {
                  const last = prev[prev.length - 1];
                  return [...prev.slice(0, -1), { ...last, content: assistantMessage }];
                });
              }
            } catch (e) {
              console.error('Erro ao processar chunk SSE', e);
            }
          }
        }
      }
    } catch (error: any) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Desculpe, ocorreu um erro: ${error.message}` }]);
    } finally {
      setIsTyping(false);
    }
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 w-14 h-14 bg-blue-600 text-white rounded-full shadow-lg flex items-center justify-center hover:bg-blue-700 transition-all hover:scale-110 z-[60] group"
      >
        <Bot size={28} />
        <span className="absolute right-full mr-3 px-2 py-1 bg-slate-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
          Falar com Co-pilot
        </span>
      </button>
    );
  }

  return (
    <div className={cn(
      "fixed bottom-6 right-6 bg-white border border-slate-200 rounded-2xl shadow-2xl flex flex-col transition-all duration-300 z-[60] overflow-hidden",
      isMinimized ? "w-64 h-14" : "w-96 h-[600px] max-h-[80vh]"
    )}>
      {/* Header */}
      <div className="p-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center">
            <Bot size={20} />
          </div>
          <div>
            <h4 className="text-sm font-bold text-slate-800">Co-pilot ID Visual</h4>
            {!isMinimized && <div className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
              <span className="text-[10px] text-emerald-600 font-medium uppercase tracking-wider">Online</span>
            </div>}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button 
            onClick={() => setIsMinimized(!isMinimized)}
            className="p-1.5 text-slate-400 hover:bg-slate-200 rounded-lg transition-colors"
          >
            {isMinimized ? <Maximize2 size={16} /> : <Minimize2 size={16} />}
          </button>
          <button 
            onClick={() => setIsOpen(false)}
            className="p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500 rounded-lg transition-colors"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {!isMinimized && (
        <>
          {/* Chat Container */}
          <div className="flex-1 overflow-hidden flex flex-col pt-4">
            <div className="flex-1 px-4 pb-4 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-200">
              <div ref={scrollRef} className="space-y-4 pr-2">
                {messages.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-full text-center py-10">
                    <div className="w-12 h-12 bg-blue-50 text-blue-500 rounded-2xl flex items-center justify-center mb-3">
                      <Sparkles size={24} />
                    </div>
                    <p className="text-slate-900 font-bold">Olá! Como posso ajudar hoje?</p>
                    <p className="text-slate-500 text-xs mt-1 max-w-[200px]">Tire dúvidas sobre SLAs, 5S, Andon ou peça um relatório MPR.</p>
                  </div>
                )}

                {messages.map((m, i) => (
                  <div key={i} className={cn(
                    "flex",
                    m.role === 'user' ? "justify-end" : "justify-start"
                  )}>
                    <div className={cn(
                      "max-w-[85%] px-3 py-2 rounded-2xl text-sm shadow-sm",
                      m.role === 'user' 
                        ? "bg-blue-600 text-white rounded-tr-none" 
                        : "bg-slate-100 text-slate-800 rounded-tl-none border border-slate-200"
                    )}>
                      <div className="whitespace-pre-wrap leading-relaxed">{m.content}</div>
                    </div>
                  </div>
                ))}

                {isTyping && messages[messages.length-1]?.role !== 'assistant' && (
                  <div className="flex justify-start">
                    <div className="bg-slate-100 p-3 rounded-2xl rounded-tl-none border border-slate-200 shadow-sm animate-pulse space-y-2">
                      <div className="h-2 w-12 bg-slate-300 rounded-full" />
                      <div className="h-2 w-20 bg-slate-300 rounded-full" />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Input */}
          <div className="p-4 border-t border-slate-200 bg-white shrink-0">
            <form 
              onSubmit={(e) => { e.preventDefault(); handleSendMessage(); }}
              className="relative"
            >
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Perguntar ao Co-pilot..."
                className="w-full pl-4 pr-12 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all"
                disabled={isTyping}
              />
              <button
                type="submit"
                disabled={!input.trim() || isTyping}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:bg-slate-300 transition-all shadow-sm"
              >
                {isTyping ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
              </button>
            </form>
            <p className="text-[10px] text-center text-slate-400 mt-2">
              IA pode cometer erros. Verifique informações críticas.
            </p>
          </div>
        </>
      )}
    </div>
  );
};
