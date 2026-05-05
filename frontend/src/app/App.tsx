import React, { useState } from 'react';
import { Toaster, toast } from 'sonner';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Dashboard } from './components/Dashboard';
import { Solicitacoes } from './components/Solicitacoes';
import { IDVisualAnalytics } from './components/IDVisualAnalytics';
import { VisaoProducao } from './components/VisaoProducao';
import { Configuracoes } from './components/Configuracoes';
import { Padroes5S } from './components/Padroes5S';
import { ActiveBatch } from '../components/ActiveBatch';
import { Login } from './components/Login';
import { OTAProgressDashboard } from './components/OTAProgressDashboard';

import { AndonGrid } from './components/AndonGrid';
import { AndonTV } from './components/AndonTV';
import { AndonPendenciasPage } from './components/AndonPendenciasPage';
import { AndonOEEDashboard } from './components/AndonOEEDashboard';
import { AndonWorkcenterDetail } from './components/AndonWorkcenterDetail';
import { DevicesPage } from './components/DevicesPage';
import { MPRAnalyticsDashboard } from './pages/mpr/MPRAnalyticsDashboard';
import { MyReports } from './pages/reports/MyReports';
import { DynamicDashboard } from './pages/reports/DynamicDashboard';
import { Fabrication, User } from './types';
import { api } from '../services/api';
import { pollingManager } from '../services/pollingManager';
import { canAccessRoute } from '../lib/rbac';

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

    const ProtectedRoute = ({ path, children }: { path: string, children: React.ReactNode }) => {
      // Allow dynamic paths via base match in some cases, but canAccessRoute expects the raw path
      if (!canAccessRoute(currentUser, path)) {
        const fallback = currentUser?.role === 'producao' ? '/id-visual/producao' : '/id-visual/dashboard';
        return <Navigate to={fallback} replace />;
      }
      return <>{children}</>;
    };

    return (
      <>
        <Toaster position="top-right" richColors />
        <Routes>
          <Route path="/andon-tv" element={
            <ProtectedRoute path="/andon-tv"><AndonTV /></ProtectedRoute>
          } />
          <Route path="/*" element={
            <Layout user={currentUser}>
              <Routes>
                <Route path="/" element={<Navigate to="/id-visual/dashboard" replace />} />
                <Route path="/id-visual/dashboard" element={
                  <ProtectedRoute path="/id-visual/dashboard"><Dashboard onCreateBatch={handleCreateBatch} /></ProtectedRoute>
                } />
                <Route path="/id-visual/solicitacoes" element={
                  <ProtectedRoute path="/id-visual/solicitacoes"><Solicitacoes onCreateBatch={handleCreateBatch} /></ProtectedRoute>
                } />
                <Route path="/id-visual/producao" element={
                  <ProtectedRoute path="/id-visual/producao"><VisaoProducao /></ProtectedRoute>
                } />
                <Route path="/id-visual/analytics" element={
                  <ProtectedRoute path="/id-visual/analytics"><IDVisualAnalytics /></ProtectedRoute>
                } />
                <Route path="/andon/painel" element={
                  <ProtectedRoute path="/andon/painel"><AndonGrid username={currentUser?.username || ''} /></ProtectedRoute>
                } />
                <Route path="/andon/pendencias" element={
                  <ProtectedRoute path="/andon/pendencias"><AndonPendenciasPage currentUser={currentUser?.username || ''} /></ProtectedRoute>
                } />
                <Route path="/andon/dashboard" element={
                  <ProtectedRoute path="/andon/dashboard"><AndonOEEDashboard /></ProtectedRoute>
                } />
                <Route path="/andon/dashboard/:wcId" element={
                  <ProtectedRoute path="/andon/dashboard"><AndonWorkcenterDetail currentUser={currentUser?.username || ''} /></ProtectedRoute>
                } />
                <Route path="/andon/devices" element={
                  <ProtectedRoute path="/andon/devices"><DevicesPage /></ProtectedRoute>
                } />
                <Route path="/templates" element={
                  <ProtectedRoute path="/templates"><Padroes5S /></ProtectedRoute>
                } />
                <Route path="/mpr/analytics" element={
                  <ProtectedRoute path="/mpr/analytics"><MPRAnalyticsDashboard /></ProtectedRoute>
                } />
                <Route path="/relatorios" element={
                  <ProtectedRoute path="/relatorios"><MyReports /></ProtectedRoute>
                } />
                <Route path="/relatorios/visualizar/:id" element={
                  <ProtectedRoute path="/relatorios"><DynamicDashboard /></ProtectedRoute>
                } />
  
                <Route path="/admin" element={
                  <ProtectedRoute path="/admin"><Configuracoes user={currentUser} /></ProtectedRoute>
                } />
                <Route path="/admin/ota-progress" element={
                  <ProtectedRoute path="/admin"><OTAProgressDashboard onClose={() => navigate('/admin')} /></ProtectedRoute>
                } />
                <Route path="/id-visual/batch/:batchId" element={
                  <ProtectedRoute path="/id-visual/batch">
                    <ActiveBatch onBack={() => navigate('/id-visual/dashboard')} />
                  </ProtectedRoute>
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
