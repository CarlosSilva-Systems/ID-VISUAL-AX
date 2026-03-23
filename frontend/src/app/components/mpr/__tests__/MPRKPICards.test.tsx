import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MPRKPICards } from '../MPRKPICards';

describe('MPRKPICards', () => {
    it('shows loading skeletons when isLoading is true', () => {
        const { container } = render(<MPRKPICards data={null} config={null} isLoading={true} />);
        const skeletons = container.querySelectorAll('.animate-pulse');
        expect(skelettons.length).toBe(6);
    });

    it('renders data correctly and detects SLA breach', () => {
        const mockData = {
            tempo_medio_concepcao_min: 120,
            tempo_medio_ciclo_completo_min: 3000, // 50h
            tempo_medio_parada_of_min: 0,
            taxa_entrega_no_prazo_pct: 10,
            taxa_aprovacao_primeira_entrega_pct: 80,
            taxa_retrabalho_pct: 20,
            total_ids_solicitadas: 100,
            total_ids_entregues: 50,
            ofs_impactadas: 2
        };
        const mockConfig = {
            sla_atencao_horas: 8,
            sla_critico_horas: 24
        };

        render(<MPRKPICards data={mockData} config={mockConfig} isLoading={false} />);
        
        // Verifica se formatador Min to Hours funcionou (120min = 2.0h)
        expect(screen.getByText('2.0h')).toBeInTheDocument();
        
        // Verifica SLA breach no ciclo completo (3000min = 50.0h, limite é 24h)
        expect(screen.getByText('50.0h')).toBeInTheDocument();
        expect(screen.getByText('SLA Estourado')).toBeInTheDocument();
        
        // Verifica volumetria
        expect(screen.getByText('100')).toBeInTheDocument();
        expect(screen.getByText('50 entregues')).toBeInTheDocument();
    });
});
