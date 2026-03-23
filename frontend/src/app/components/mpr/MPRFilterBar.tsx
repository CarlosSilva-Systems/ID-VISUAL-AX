import React, { useState, useEffect } from 'react';
import { Calendar, Filter } from 'lucide-react';
import { format, subDays } from 'date-fns';

export interface MPRFilters {
  startDate: string;
  endDate: string;
}

interface MPRFilterBarProps {
  onFilterChange: (filters: MPRFilters) => void;
  initialDaysBack?: number;
}

export function MPRFilterBar({ onFilterChange, initialDaysBack = 30 }: MPRFilterBarProps) {
  // Start with local YYYY-MM-DD for the input fields
  const [startDate, setStartDate] = useState(format(subDays(new Date(), initialDaysBack), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));

  // Automatically trigger the initial fetch
  useEffect(() => {
    handleApply();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleApply = () => {
    if (!startDate || !endDate) return;

    // Converte para ISO-8601 respeitando o contrato de fuso horário UTC 'Z'
    // Como os inputs "date" devolvem YYYY-MM-DD em hora local GMT, precisamos garantir que cubra 00:00:00 da start e 23:59:59 da end.
    const startStr = `${startDate}T00:00:00Z`;
    const endStr = `${endDate}T23:59:59Z`;

    onFilterChange({ 
      startDate: startStr, 
      endDate: endStr 
    });
  };

  return (
    <div className="bg-white p-4 rounded-lg shadow flex flex-wrap gap-4 items-end mb-6 border border-gray-100">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Data Inicial</label>
        <div className="relative">
          <Calendar className="absolute left-2 top-2 h-4 w-4 text-gray-400" />
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="pl-8 pr-3 py-1.5 border rounded-md text-sm focus:ring-blue-500 focus:border-blue-500 outline-none w-40"
          />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Data Final</label>
        <div className="relative">
          <Calendar className="absolute left-2 top-2 h-4 w-4 text-gray-400" />
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="pl-8 pr-3 py-1.5 border rounded-md text-sm focus:ring-blue-500 focus:border-blue-500 outline-none w-40"
          />
        </div>
      </div>
      <button 
        onClick={handleApply}
        className="flex items-center gap-2 bg-blue-600 text-white px-4 py-1.5 rounded-md hover:bg-blue-700 text-sm font-medium transition-colors"
      >
        <Filter className="h-4 w-4" />
        Aplicar Filtros
      </button>
    </div>
  );
}
