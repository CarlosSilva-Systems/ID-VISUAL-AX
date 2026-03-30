import { useState, useEffect } from 'react';
import api from '@/services/api';

type ConnectionStatus = 'production' | 'test' | 'disconnected';

interface Database {
  name: string;
  type: 'production' | 'test';
  selectable: boolean;
  is_active: boolean;
}

export function ConnectionBadge() {
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [dbName, setDbName] = useState<string>('');

  useEffect(() => {
    checkConnection();
    
    // Listen for database changes
    const handleDbChange = () => {
      console.log('[ConnectionBadge] Database changed, refreshing...');
      checkConnection();
    };
    
    window.addEventListener('database-changed', handleDbChange);
    
    return () => {
      window.removeEventListener('database-changed', handleDbChange);
    };
  }, []);

  const checkConnection = async () => {
    try {
      const response = await api.get('/odoo/databases');
      const databases: Database[] = response.data;
      const active = databases.find((db) => db.is_active);
      
      if (active) {
        setDbName(active.name);
        setStatus(active.type);
      } else {
        setStatus('disconnected');
        setDbName('');
      }
    } catch (err) {
      console.error('[ConnectionBadge] Failed to check connection:', err);
      setStatus('disconnected');
      setDbName('');
    }
  };

  const getStatusConfig = () => {
    switch (status) {
      case 'production':
        return {
          icon: '🟢',
          text: 'ODOO CONECTADO',
          bgColor: 'bg-emerald-50',
          textColor: 'text-emerald-700',
          borderColor: 'border-emerald-200',
          dotColor: '#10b981'
        };
      case 'test':
        return {
          icon: '🟡',
          text: 'ODOO CONECTADO',
          bgColor: 'bg-amber-50',
          textColor: 'text-amber-700',
          borderColor: 'border-amber-200',
          dotColor: '#f59e0b'
        };
      default:
        return {
          icon: '🔴',
          text: 'ODOO DESCONECTADO',
          bgColor: 'bg-red-50',
          textColor: 'text-red-700',
          borderColor: 'border-red-200',
          dotColor: '#ef4444'
        };
    }
  };

  const config = getStatusConfig();

  return (
    <div 
      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border ${config.bgColor} ${config.textColor} ${config.borderColor}`}
      title={dbName ? `Conectado ao banco: ${dbName}` : 'Sem conexão com Odoo'}
    >
      <div 
        className="w-2 h-2 rounded-full animate-pulse" 
        style={{ backgroundColor: config.dotColor }} 
      />
      <span className="text-[11px] font-bold uppercase tracking-wider">
        {config.text}
      </span>
      {dbName && status !== 'disconnected' && (
        <span className="text-[10px] opacity-70">
          ({dbName})
        </span>
      )}
    </div>
  );
}
