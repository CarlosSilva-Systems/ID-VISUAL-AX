import React, { useState } from 'react';
import { Toaster, toast } from 'sonner';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Dashboard } from './components/Dashboard';
import { Solicitacoes } from './components/Solicitacoes';
import { MPRAnalyticsDashboard } from './pages/mpr/MPRAnalyticsDashboard';
import { VisaoProducao } from './components/VisaoProducao';
import { Configuracoes } from './components/Configuracoes';
import { Padroes5S } from './components/Padroes5S';
import { ActiveBatch } from '../components/ActiveBatch';
import { MyReports } from './pages/reports/MyReports';
import { DynamicDashboard } from './pages/reports/DynamicDashboard';
import { Login } from './components/Login';
import { OTAProgressDashboard } from './components/OTAProgressDashboard';

import { AndonGrid } from './components/AndonGrid';
import { AndonTV } from './components/AndonTV';
import { AndonPendenciasPage } from './components/AndonPendenciasPage';
import { AndonOEEDashboard } from './components/AndonOEEDashboard';
import { AndonWorkcenterDetail } from './components/AndonWorkcenterDetail';
import { DevicesPage } from './components/DevicesPage';
import { Fabrication, User } from './types';
import { api } from '../services/api';
import { pollingManager } from '../services/pollingManager';

import { DataProvider } from './contexts/DataContext';

function AppContent() {
  const navigate = useNavigate();
  // currentBatchItems is deprecated in favor of URL-based UUIDs


  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<User | null>(null);

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

  // Gerenciar lifecycle do polling baseado em autenticação
  React.useEffect(() => {
    if (isAuthenticated) {
      pollingManager.start();

      // Escutar mudanças de banco de dados
      const handleDbChange = () => {
        console.log('[App] Database changed, restarting polling');
        pollingManager.restart();
      };
      window.addEventListener('database-changed', handleDbChange);

      return () => {
        pollingManager.stop();
        window.removeEventListener('database-changed', handleDbChange);
      };
    }
  }, [isAuthenticated]);

  const handleLoginSuccess = (meData: any) => {
    setIsAuthenticated(true);
    setCurrentUser({
      ...meData,
      username: meData.user // Mapeamento para interface unificada
    });
  };

  const handleCreateBatch = async (itemsOrId: Fabrication[] | string) => {
    if (typeof itemsOrId === 'string') {
      navigate(`/id-visual/batch/${itemsOrId}`);
    } else {
      // If items are passed, we need to save the batch first (Manual requests flow)
      try {
        const ids = itemsOrId.map(i => parseInt(i.id));
        const res = await api.createBatch(ids);
        navigate(`/id-visual/batch/${res.batch_id}`);
      } catch (err: any) {
        toast.error(`Erro ao criar lote: ${err.message}`);
      }
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
          <Layout user={currentUser}>
            <Routes>
              <Route path="/" element={<Navigate to="/id-visual/dashboard" replace />} />
              <Route path="/id-visual/dashboard" element={<Dashboard onCreateBatch={handleCreateBatch} />} />
              <Route path="/id-visual/solicitacoes" element={<Solicitacoes onCreateBatch={handleCreateBatch} />} />
              <Route path="/id-visual/producao" element={<VisaoProducao />} />
              <Route path="/andon/painel" element={<AndonGrid username={currentUser?.username || ''} />} />
              <Route path="/andon/pendencias" element={<AndonPendenciasPage currentUser={currentUser?.username || ''} />} />
              <Route path="/andon/dashboard" element={<AndonOEEDashboard />} />
              <Route path="/andon/dashboard/:wcId" element={<AndonWorkcenterDetail currentUser={currentUser?.username || ''} />} />
              <Route path="/andon/devices" element={<DevicesPage />} />
              <Route path="/relatorios" element={<MPRAnalyticsDashboard />} />
              <Route path="/relatorios/meus" element={<MyReports />} />
              <Route path="/relatorios/visualizar/:reportId" element={<DynamicDashboard />} />
              <Route path="/templates" element={<Padroes5S />} />

              <Route path="/admin" element={<Configuracoes user={currentUser} />} />
              <Route path="/admin/ota-progress" element={
                <OTAProgressDashboard onClose={() => navigate('/admin')} />
              } />
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
