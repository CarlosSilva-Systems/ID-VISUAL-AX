/**
 * Floating Document Viewer
 * 
 * Visualizador flutuante de documentos PDF com funcionalidades:
 * - Draggable (arrastável)
 * - Resizable (redimensionável)
 * - Always-on-top (z-index alto)
 * - Minimize/Maximize
 * - Pin (impede fechamento acidental)
 * - Zoom controls
 * - Multi-page navigation
 * - Persistent position/size (localStorage)
 */

import React, { useState, useEffect, useRef } from 'react';
import Draggable from 'react-draggable';
import { ResizableBox } from 'react-resizable';
import { Document, Page, pdfjs } from 'react-pdf';
import {
  X,
  Minimize2,
  Maximize2,
  Pin,
  PinOff,
  ZoomIn,
  ZoomOut,
  ChevronLeft,
  ChevronRight,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import 'react-pdf/dist/esm/Page/AnnotationLayer.css';
import 'react-pdf/dist/esm/Page/TextLayer.css';
import 'react-resizable/css/styles.css';

// Configurar worker do PDF.js
pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

const API_URL = (import.meta as any).env.VITE_API_URL || '/api/v1';

interface FloatingDocViewerProps {
  moId: string;
  moNumber: string;
  documentType: 'diagrama' | 'legenda';
  onClose: () => void;
}

interface ViewerState {
  position: { x: number; y: number };
  size: { width: number; height: number };
  isMinimized: boolean;
  isPinned: boolean;
  zoom: number;
  currentPage: number;
  totalPages: number;
}

const STORAGE_KEY = 'floating-viewer-state';
const DEFAULT_SIZE = { width: 600, height: 800 };
const MIN_SIZE = { width: 300, height: 400 };
const MAX_SIZE_PERCENT = 0.8; // 80% da viewport

export function FloatingDocViewer({ moId, moNumber, documentType, onClose }: FloatingDocViewerProps) {
  const [state, setState] = useState<ViewerState>(() => {
    // Restaurar estado do localStorage
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return {
          ...parsed,
          currentPage: 1, // Sempre começa na página 1
          totalPages: 0,
          isMinimized: false, // Sempre abre maximizado
        };
      } catch {
        // Ignorar erro de parse
      }
    }

    // Estado padrão
    return {
      position: { x: window.innerWidth - 650, y: 50 },
      size: DEFAULT_SIZE,
      isMinimized: false,
      isPinned: false,
      zoom: 1.0,
      currentPage: 1,
      totalPages: 0,
    };
  });

  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const nodeRef = useRef<HTMLDivElement>(null);

  // Carregar documento
  useEffect(() => {
    loadDocument();
  }, [moId, documentType]);

  // Salvar estado no localStorage
  useEffect(() => {
    const stateToSave = {
      position: state.position,
      size: state.size,
      isPinned: state.isPinned,
      zoom: state.zoom,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stateToSave));
  }, [state.position, state.size, state.isPinned, state.zoom]);

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && !state.isPinned) {
        onClose();
      }
      if (e.ctrlKey && e.key === '+') {
        e.preventDefault();
        handleZoomIn();
      }
      if (e.ctrlKey && e.key === '-') {
        e.preventDefault();
        handleZoomOut();
      }
      if (e.key === 'ArrowLeft' && state.currentPage > 1) {
        handlePrevPage();
      }
      if (e.key === 'ArrowRight' && state.currentPage < state.totalPages) {
        handleNextPage();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [state.isPinned, state.currentPage, state.totalPages, state.zoom]);

  async function loadDocument() {
    setLoading(true);
    setError(null);

    try {
      const token = localStorage.getItem('id_visual_token');
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const endpoint = documentType === 'diagrama' ? 'diagrama' : 'legenda';
      const res = await fetch(`${API_URL}/odoo/${moId}/${endpoint}`, { headers });

      if (!res.ok) {
        throw new Error(`Erro ${res.status}: ${res.statusText}`);
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      setPdfUrl(url);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao carregar documento';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  function handleDocumentLoadSuccess({ numPages }: { numPages: number }) {
    setState(prev => ({ ...prev, totalPages: numPages }));
  }

  function handleToggleMinimize() {
    setState(prev => ({ ...prev, isMinimized: !prev.isMinimized }));
  }

  function handleTogglePin() {
    setState(prev => ({ ...prev, isPinned: !prev.isPinned }));
    toast.info(state.isPinned ? 'Viewer desfixado' : 'Viewer fixado');
  }

  function handleZoomIn() {
    setState(prev => ({ ...prev, zoom: Math.min(prev.zoom + 0.25, 3.0) }));
  }

  function handleZoomOut() {
    setState(prev => ({ ...prev, zoom: Math.max(prev.zoom - 0.25, 0.5) }));
  }

  function handlePrevPage() {
    setState(prev => ({ ...prev, currentPage: Math.max(prev.currentPage - 1, 1) }));
  }

  function handleNextPage() {
    setState(prev => ({ ...prev, currentPage: Math.min(prev.currentPage + 1, prev.totalPages) }));
  }

  function handleDrag(_e: any, data: { x: number; y: number }) {
    setState(prev => ({ ...prev, position: { x: data.x, y: data.y } }));
  }

  function handleResize(_e: any, { size }: { size: { width: number; height: number } }) {
    setState(prev => ({ ...prev, size }));
  }

  function handleClose() {
    if (state.isPinned) {
      toast.warning('Viewer está fixado. Desafixe para fechar.');
      return;
    }
    onClose();
  }

  // Calcular tamanho máximo baseado na viewport
  const maxWidth = Math.floor(window.innerWidth * MAX_SIZE_PERCENT);
  const maxHeight = Math.floor(window.innerHeight * MAX_SIZE_PERCENT);

  // Minimizado: apenas barra de título
  if (state.isMinimized) {
    return (
      <Draggable
        nodeRef={nodeRef}
        handle=".drag-handle"
        position={state.position}
        onStop={handleDrag}
        bounds="parent"
      >
        <div
          ref={nodeRef}
          className="fixed bottom-4 right-4 bg-white rounded-lg shadow-2xl border-2 border-blue-600 z-[9999]"
          style={{ width: '300px' }}
        >
          <div className="drag-handle flex items-center justify-between p-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-t-lg cursor-move">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <span className="text-xs font-bold truncate">{moNumber}</span>
              <span className="text-[10px] opacity-75">({documentType})</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={handleToggleMinimize}
                className="p-1 hover:bg-white/20 rounded transition-colors"
                title="Restaurar"
              >
                <Maximize2 size={14} />
              </button>
              <button
                onClick={handleClose}
                className="p-1 hover:bg-white/20 rounded transition-colors"
                title="Fechar"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        </div>
      </Draggable>
    );
  }

  // Viewer completo
  return (
    <Draggable
      nodeRef={nodeRef}
      handle=".drag-handle"
      position={state.position}
      onStop={handleDrag}
      bounds="parent"
    >
      <div ref={nodeRef} className="fixed z-[9999]" style={{ width: state.size.width, height: state.size.height }}>
        <ResizableBox
          width={state.size.width}
          height={state.size.height}
          minConstraints={[MIN_SIZE.width, MIN_SIZE.height]}
          maxConstraints={[maxWidth, maxHeight]}
          onResize={handleResize}
          resizeHandles={['se', 'sw', 'ne', 'nw', 's', 'e', 'w', 'n']}
          className="bg-white rounded-lg shadow-2xl border-2 border-blue-600 flex flex-col overflow-hidden"
        >
          {/* Barra de título */}
          <div className="drag-handle flex items-center justify-between p-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white cursor-move shrink-0">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <span className="text-sm font-bold truncate">{moNumber}</span>
              <span className="text-xs opacity-75">({documentType})</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={handleTogglePin}
                className={`p-1.5 rounded transition-colors ${
                  state.isPinned ? 'bg-yellow-500 text-white' : 'hover:bg-white/20'
                }`}
                title={state.isPinned ? 'Desafixar' : 'Fixar'}
              >
                {state.isPinned ? <Pin size={14} /> : <PinOff size={14} />}
              </button>
              <button
                onClick={handleToggleMinimize}
                className="p-1.5 hover:bg-white/20 rounded transition-colors"
                title="Minimizar"
              >
                <Minimize2 size={14} />
              </button>
              <button
                onClick={handleClose}
                className="p-1.5 hover:bg-white/20 rounded transition-colors"
                title="Fechar (Esc)"
              >
                <X size={14} />
              </button>
            </div>
          </div>

          {/* Conteúdo do PDF */}
          <div className="flex-1 overflow-auto bg-slate-100 relative">
            {loading && (
              <div className="absolute inset-0 flex items-center justify-center bg-white/90">
                <div className="text-center">
                  <Loader2 size={32} className="animate-spin text-blue-600 mx-auto mb-2" />
                  <p className="text-sm text-slate-600">Carregando documento...</p>
                </div>
              </div>
            )}

            {error && (
              <div className="absolute inset-0 flex items-center justify-center bg-white p-6">
                <div className="text-center max-w-sm">
                  <AlertCircle size={48} className="text-red-500 mx-auto mb-3" />
                  <p className="text-sm font-bold text-slate-800 mb-2">Erro ao carregar documento</p>
                  <p className="text-xs text-slate-600 mb-4">{error}</p>
                  <button
                    onClick={loadDocument}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700 transition-colors"
                  >
                    Tentar Novamente
                  </button>
                </div>
              </div>
            )}

            {pdfUrl && !error && (
              <div className="flex items-center justify-center p-4">
                <Document
                  file={pdfUrl}
                  onLoadSuccess={handleDocumentLoadSuccess}
                  loading={<Loader2 size={24} className="animate-spin text-blue-600" />}
                  error={<p className="text-sm text-red-600">Erro ao renderizar PDF</p>}
                >
                  <Page
                    pageNumber={state.currentPage}
                    scale={state.zoom}
                    loading={<Loader2 size={24} className="animate-spin text-blue-600" />}
                  />
                </Document>
              </div>
            )}
          </div>

          {/* Barra de controles */}
          <div className="flex items-center justify-between p-2 bg-slate-50 border-t border-slate-200 shrink-0">
            {/* Zoom */}
            <div className="flex items-center gap-1">
              <button
                onClick={handleZoomOut}
                disabled={state.zoom <= 0.5}
                className="p-1.5 hover:bg-slate-200 rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                title="Zoom Out (Ctrl+-)"
              >
                <ZoomOut size={14} />
              </button>
              <span className="text-xs font-bold text-slate-600 min-w-[50px] text-center">
                {Math.round(state.zoom * 100)}%
              </span>
              <button
                onClick={handleZoomIn}
                disabled={state.zoom >= 3.0}
                className="p-1.5 hover:bg-slate-200 rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                title="Zoom In (Ctrl++)"
              >
                <ZoomIn size={14} />
              </button>
            </div>

            {/* Navegação de páginas */}
            {state.totalPages > 1 && (
              <div className="flex items-center gap-1">
                <button
                  onClick={handlePrevPage}
                  disabled={state.currentPage <= 1}
                  className="p-1.5 hover:bg-slate-200 rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  title="Página Anterior (←)"
                >
                  <ChevronLeft size={14} />
                </button>
                <span className="text-xs font-bold text-slate-600 min-w-[60px] text-center">
                  {state.currentPage} / {state.totalPages}
                </span>
                <button
                  onClick={handleNextPage}
                  disabled={state.currentPage >= state.totalPages}
                  className="p-1.5 hover:bg-slate-200 rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  title="Próxima Página (→)"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            )}
          </div>
        </ResizableBox>
      </div>
    </Draggable>
  );
}
