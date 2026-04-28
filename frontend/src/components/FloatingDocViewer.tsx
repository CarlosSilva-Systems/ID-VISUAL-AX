/**
 * FloatingDocViewer — janela flutuante de documentos.
 *
 * Usa iframe (igual ao DocViewerModal) para evitar dependências pesadas.
 * Drag nativo via mousedown/mousemove. Sempre visível (z-index alto).
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { X, Minimize2, Maximize2, Pin, PinOff, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';

const API_URL = (import.meta as any).env.VITE_API_URL || '/api/v1';

interface FloatingDocViewerProps {
  moId: string;
  moNumber: string;
  documentType: 'diagrama' | 'legenda';
  onClose: () => void;
}

function buildDocUrl(moId: string, documentType: 'diagrama' | 'legenda'): string {
  const token = localStorage.getItem('id_visual_token');
  const tokenParam = token ? `?token=${token}` : '';
  // Usa o odoo_id numérico diretamente no endpoint de documentos
  const base = API_URL.replace(/\/api\/v1$/, '');
  return `${base}/api/v1/odoo/${moId}/${documentType}${tokenParam}`;
}

export function FloatingDocViewer({ moId, moNumber, documentType, onClose }: FloatingDocViewerProps) {
  const [pos, setPos] = useState(() => ({
    x: Math.max(0, window.innerWidth - 660),
    y: 60,
  }));
  const [size, setSize] = useState({ w: 620, h: 780 });
  const [minimized, setMinimized] = useState(false);
  const [pinned, setPinned] = useState(false);

  const dragging = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  // Drag
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    dragging.current = true;
    dragOffset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
    e.preventDefault();
  }, [pos]);

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!dragging.current) return;
      setPos({
        x: Math.max(0, Math.min(window.innerWidth - size.w, e.clientX - dragOffset.current.x)),
        y: Math.max(0, Math.min(window.innerHeight - 48, e.clientY - dragOffset.current.y)),
      });
    }
    function onUp() { dragging.current = false; }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [size.w]);

  // Esc fecha se não pinado
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !pinned) onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pinned, onClose]);

  function handleClose() {
    if (pinned) { toast.warning('Desafixe o viewer antes de fechar (ícone 📌)'); return; }
    onClose();
  }

  const docUrl = buildDocUrl(moId, documentType);

  // Minimizado — barra compacta no canto
  if (minimized) {
    return (
      <div
        ref={containerRef}
        style={{ position: 'fixed', left: pos.x, top: pos.y, zIndex: 9999, width: 280 }}
        className="bg-gradient-to-r from-blue-700 to-blue-800 rounded-xl shadow-2xl border border-blue-500"
      >
        <div
          className="flex items-center justify-between px-3 py-2 cursor-move"
          onMouseDown={onMouseDown}
        >
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xs font-bold text-white truncate">{moNumber}</span>
            <span className="text-[10px] text-blue-200 shrink-0">({documentType})</span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={() => setMinimized(false)} className="p-1 hover:bg-white/20 rounded text-white" title="Restaurar">
              <Maximize2 size={13} />
            </button>
            <button onClick={handleClose} className="p-1 hover:bg-white/20 rounded text-white" title="Fechar">
              <X size={13} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      style={{ position: 'fixed', left: pos.x, top: pos.y, zIndex: 9999, width: size.w, height: size.h }}
      className="flex flex-col bg-white rounded-xl shadow-2xl border-2 border-blue-600 overflow-hidden"
    >
      {/* Header — drag handle */}
      <div
        className="flex items-center justify-between px-3 py-2 bg-gradient-to-r from-blue-700 to-blue-800 cursor-move shrink-0"
        onMouseDown={onMouseDown}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-bold text-white truncate">{moNumber}</span>
          <span className="text-[11px] text-blue-200 shrink-0 capitalize">({documentType})</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => { setPinned(p => !p); toast.info(pinned ? 'Viewer desfixado' : 'Viewer fixado — não fecha com Esc'); }}
            className={`p-1.5 rounded transition-colors ${pinned ? 'bg-yellow-400 text-yellow-900' : 'hover:bg-white/20 text-white'}`}
            title={pinned ? 'Desfixar' : 'Fixar (impede fechar com Esc)'}
          >
            {pinned ? <Pin size={13} /> : <PinOff size={13} />}
          </button>
          <a
            href={docUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1.5 hover:bg-white/20 rounded text-white"
            title="Abrir em nova aba"
          >
            <ExternalLink size={13} />
          </a>
          <button
            type="button"
            onClick={() => setMinimized(true)}
            className="p-1.5 hover:bg-white/20 rounded text-white"
            title="Minimizar"
          >
            <Minimize2 size={13} />
          </button>
          <button
            type="button"
            onClick={handleClose}
            className="p-1.5 hover:bg-red-500 rounded text-white transition-colors"
            title="Fechar"
          >
            <X size={13} />
          </button>
        </div>
      </div>

      {/* Conteúdo */}
      <iframe
        src={docUrl}
        className="flex-1 w-full border-0 bg-slate-100"
        title={`${documentType} — ${moNumber}`}
      />

      {/* Handle de resize no canto inferior direito */}
      <div
        className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize"
        style={{ background: 'transparent' }}
        onMouseDown={e => {
          e.stopPropagation();
          const startX = e.clientX, startY = e.clientY;
          const startW = size.w, startH = size.h;
          function onMove(ev: MouseEvent) {
            setSize({
              w: Math.max(320, startW + ev.clientX - startX),
              h: Math.max(300, startH + ev.clientY - startY),
            });
          }
          function onUp() {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
          }
          window.addEventListener('mousemove', onMove);
          window.addEventListener('mouseup', onUp);
        }}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" className="text-slate-400">
          <path d="M14 14L8 14M14 14L14 8M14 14L6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      </div>
    </div>
  );
}
