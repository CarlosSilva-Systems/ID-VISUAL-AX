/**
 * Hook para gerenciar estado global do Floating Document Viewer.
 * 
 * Permite abrir/fechar o viewer de qualquer lugar da aplicação,
 * mantendo estado persistente e sincronizado.
 */

import { useState, useCallback } from 'react';

interface FloatingViewerState {
  isOpen: boolean;
  moId: string | null;
  moNumber: string | null;
  documentType: 'diagrama' | 'legenda';
}

const initialState: FloatingViewerState = {
  isOpen: false,
  moId: null,
  moNumber: null,
  documentType: 'diagrama',
};

export function useFloatingViewer() {
  const [state, setState] = useState<FloatingViewerState>(initialState);

  const open = useCallback((moId: string, moNumber: string, documentType: 'diagrama' | 'legenda' = 'diagrama') => {
    setState({
      isOpen: true,
      moId,
      moNumber,
      documentType,
    });
  }, []);

  const close = useCallback(() => {
    setState(initialState);
  }, []);

  const toggle = useCallback((moId: string, moNumber: string, documentType: 'diagrama' | 'legenda' = 'diagrama') => {
    setState(prev => {
      if (prev.isOpen && prev.moId === moId && prev.documentType === documentType) {
        return initialState;
      }
      return {
        isOpen: true,
        moId,
        moNumber,
        documentType,
      };
    });
  }, []);

  return {
    ...state,
    open,
    close,
    toggle,
  };
}
