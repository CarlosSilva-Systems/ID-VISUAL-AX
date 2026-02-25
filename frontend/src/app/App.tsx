import React, { useState } from 'react';
import { Toaster } from 'sonner';
import { Layout } from './components/Layout';
import { Dashboard } from './components/Dashboard';
import { Solicitacoes } from './components/Solicitacoes';
import { Fabricacoes } from './components/Fabricacoes';
import { VisaoProducao } from './components/VisaoProducao';
import { Configuracoes } from './components/Configuracoes';
import { Padroes5S } from './components/Padroes5S';
import { LoteDoDia } from './components/LoteDoDia';
import { Fabrication } from './types';

export default function App() {
  const [activePage, setActivePage] = useState('dashboard');
  const [currentBatchItems, setCurrentBatchItems] = useState<Fabrication[]>([]);
  const [activeBatchId, setActiveBatchId] = useState<string | null>(null);

  const handleCreateBatch = async (items: Fabrication[] | string) => {
    if (Array.isArray(items)) {
      setCurrentBatchItems(items);
      setActiveBatchId(null);
      setActivePage('batch');
    } else {
      // If it's a batchId string (from Dashboard)
      try {
        const batchId = items;
        setActiveBatchId(batchId);

        // Fetch the batch matrix to populate currentBatchItems
        const api = await import('../services/api').then(m => m.api);
        const matrix = await api.getBatchMatrix(batchId);

        // Map MatrixRow to Fabrication
        const mappedItems: Fabrication[] = matrix.rows.map((row: any) => ({
          id: row.request_id,
          odoo_mo_id: row.odoo_mo_id ? String(row.odoo_mo_id) : undefined,
          mo_number: row.mo_number,
          obra: row.obra_nome || 'Sem Obra',
          status: 'Em Lote', // Default for items in a batch
          priority: 'Normal',
          date_start: row.date_start ? new Date(row.date_start).toLocaleDateString('pt-BR') : '-',
          product_qty: row.quantity,
          sla: row.sla_text || '24h',
          mrp_state: 'Em Produção',
          tasks: [], // LoteDoDia will initialize/manage these
          docs: { diagrama: false, legenda: false }
        }));

        setCurrentBatchItems(mappedItems);
        setActivePage('batch');
      } catch (error) {
        console.error('Failed to load created batch:', error);
      }
    }
  };

  const renderPage = () => {
    switch (activePage) {
      case 'dashboard':
        // The type in Dashboard.tsx says batchId: string, 
        // while Solicitacoes says items: Fabrication[].
        // We'll cast to any or handle both if we want to be clean.
        return <Dashboard onCreateBatch={(id: any) => handleCreateBatch(id)} />;
      case 'requests':
        return <Solicitacoes onCreateBatch={handleCreateBatch} />;
      case 'mrp':
        return <Fabricacoes />;
      case 'production':
        return <VisaoProducao />;
      case 'templates':
        return <Padroes5S />;
      case 'admin':
        return <Configuracoes />;
      case 'batch':
        return <LoteDoDia initialFabrications={currentBatchItems} batchId={activeBatchId} onBack={() => setActivePage('dashboard')} />;
      default:
        return <Dashboard onCreateBatch={(id: any) => handleCreateBatch(id)} />;
    }
  };

  return (
    <>
      <Toaster position="top-right" richColors />
      <Layout activePage={activePage} setActivePage={setActivePage}>
        {renderPage()}
      </Layout>
    </>
  );
}
