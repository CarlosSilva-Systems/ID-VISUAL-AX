import React, { useState } from 'react';
import { Toaster } from 'sonner';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Dashboard } from './components/Dashboard';
import { Solicitacoes } from './components/Solicitacoes';
import { Fabricacoes } from './components/Fabricacoes';
import { VisaoProducao } from './components/VisaoProducao';
import { Configuracoes } from './components/Configuracoes';
import { LoteDoDia } from './components/LoteDoDia';
import { ActiveBatch } from '../components/ActiveBatch';
import { Padroes5S } from './components/Padroes5S';
import { Login } from './components/Login';
import { AndonGrid } from './components/AndonGrid';
import { AndonTV } from './components/AndonTV';
import { Fabrication } from './types';
import { api } from '../services/api';

import { DataProvider } from './contexts/DataContext';

function AppContent() {
  const navigate = useNavigate();
  const [currentBatchItems, setCurrentBatchItems] = useState<Fabrication[]>([]);

  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [username, setUsername] = useState('');

  React.useEffect(() => {
    const checkAuth = async () => {
      const token = localStorage.getItem('id_visual_token');
      if (!token) {
        setAuthLoading(false);
        return;
      }
      try {
        const me = await api.getMe();
        handleLoginSuccess(me);
      } catch (e) {
        console.error('Sessão inválida', e);
        localStorage.removeItem('id_visual_token');
      } finally {
        setAuthLoading(false);
      }
    };
    checkAuth();
  }, []);

  const handleLoginSuccess = (meData: any) => {
    setIsAuthenticated(true);
    setIsAdmin(meData.is_admin);
    setUsername(meData.user);
  };

  const handleCreateBatch = async (items: Fabrication[] | string) => {
    if (Array.isArray(items)) {
      // For new batch from selection
      setCurrentBatchItems(items);
      navigate('/id-visual/batch/new');
    } else {
      // For existing batch by ID
      navigate(`/id-visual/batch/${items}`);
    }
  };

  if (authLoading) {
    return <div className="h-screen flex items-center justify-center text-slate-500 font-medium">Carregando ID Visual...</div>;
  }

  if (!isAuthenticated) {
    return (
      <>
        <Toaster position="top-right" richColors />
        <Login onLoginSuccess={handleLoginSuccess} />
      </>
    );
  }

  return (
    <>
      <Toaster position="top-right" richColors />
      <Routes>
        <Route path="/andon-tv" element={<AndonTV />} />
        <Route path="/*" element={
          <Layout isAdmin={isAdmin} username={username}>
            <Routes>
              <Route path="/" element={<Navigate to="/id-visual/dashboard" replace />} />
              <Route path="/id-visual/dashboard" element={<Dashboard onCreateBatch={handleCreateBatch} />} />
              <Route path="/id-visual/solicitacoes" element={<Solicitacoes onCreateBatch={handleCreateBatch} />} />
              <Route path="/id-visual/producao" element={<VisaoProducao />} />
              <Route path="/andon/painel" element={<AndonGrid username={username} />} />
              <Route path="/mrp" element={<Fabricacoes />} />
              <Route path="/templates" element={<Padroes5S />} />
              {isAdmin && <Route path="/admin" element={<Configuracoes />} />}
              <Route path="/id-visual/batch/:batchId" element={
                <ActiveBatch
                  onBack={() => navigate('/id-visual/dashboard')}
                />
              } />
              <Route path="*" element={<Navigate to="/id-visual/dashboard" replace />} />
            </Routes>
          </Layout>
        } />
      </Routes>
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <DataProvider>
        <AppContent />
      </DataProvider>
    </BrowserRouter>
  );
}
