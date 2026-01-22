'use client';

import React, { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { 
  ArrowLeft, 
  Download, 
  Clock, 
  AlertTriangle, 
  Users, 
  CheckCircle, 
  Activity,
  MessageCircle
} from 'lucide-react';

// --- Types (Reused from Dashboard) ---
interface Lead {
  id: string | number;
  nome: string;
  telefone: string;
  email?: string;
  status: string;
  time?: string;
  data_entrada: string;
  primeira_interacao?: string;
  origem?: string;
  _raw?: any;
}

interface TeamStats {
  name: string;
  total: number;
  slasCritical: number;
  agendamentos: number;
  efficiency: string;
}

export default function ReportsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // --- Fetch Data ---
  useEffect(() => {
    const fetchLeads = async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/proxy-leads');
        if (!res.ok) throw new Error('Falha ao carregar leads');
        const data = await res.json();
        
        // Normalização idêntica ao Dashboard
        const rawLeads = Array.isArray(data) ? data : (data.leads || data.data || []);
        
        const parseImoviewDate = (dateStr: string) => {
            if (!dateStr) return null;
            try {
              const [datePart, timePart] = dateStr.split(' ');
              if (!datePart) return null;
              const [day, month, year] = datePart.split('/');
              const [hour, minute] = timePart ? timePart.split(':') : ['00', '00'];
              return `${year}-${month}-${day}T${hour}:${minute}:00`;
            } catch (e) {
              return null;
            }
        };

        const normalizedLeads: Lead[] = rawLeads.map((l: any) => ({
          id: l.id || l.codigo?.toString() || Math.random().toString(),
          nome: l.nome || l.lead?.nome || 'Sem Nome',
          telefone: l.telefone || l.lead?.telefone1 || l.lead?.celular || '',
          email: l.email || l.lead?.email || '',
          status: l.status || l.situacao || 'Novo',
          time: l.time || l.unidadenome || 'Geral',
          data_entrada: l.data_entrada || parseImoviewDate(l.datahoraentradalead) || new Date().toISOString(),
          primeira_interacao: l.primeira_interacao || parseImoviewDate(l.datahoraultimainteracao) || null,
          origem: l.origem || l.midia || 'Site',
          _raw: l
        }));

        setLeads(normalizedLeads);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchLeads();
  }, []);

  // --- Helpers ---
  const getSLAInfo = (entry: string, firstInteraction?: string) => {
    const entryTime = new Date(entry).getTime();
    const endTime = firstInteraction ? new Date(firstInteraction).getTime() : new Date().getTime();
    const diffMs = endTime - entryTime;
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMinutes / 60);

    const isLate = diffHours >= 2;
    
    let label = '';
    if (firstInteraction) {
      if (diffMinutes < 60) label = `Atendido em ${diffMinutes}m`;
      else label = `Atendido em ${diffHours}h ${diffMinutes % 60}m`;
    } else {
      if (diffMinutes < 60) label = `Esperando há ${diffMinutes}m`;
      else label = `Esperando há ${diffHours}h ${diffMinutes % 60}m`;
    }

    return { isLate, label, diffMinutes };
  };

  const formatPhoneNumber = (phone: string) => {
    if (!phone) return '--';
    if (phone.includes('(') && phone.includes(')')) return phone;
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length < 10) return phone;
    if (cleaned.length === 11) {
      return `(${cleaned.slice(0, 2)}) ${cleaned.slice(2, 7)}-${cleaned.slice(7)}`;
    }
    return `(${cleaned.slice(0, 2)}) ${cleaned.slice(2, 6)}-${cleaned.slice(6)}`;
  };

  // --- Data Processing for BI ---
  const teamStats = useMemo(() => {
    const stats: Record<string, TeamStats> = {};

    leads.forEach(lead => {
      const teamName = lead.time || 'Geral';
      if (!stats[teamName]) {
        stats[teamName] = { 
          name: teamName, 
          total: 0, 
          slasCritical: 0, 
          agendamentos: 0, 
          efficiency: '0%' 
        };
      }

      const current = stats[teamName];
      current.total++;

      // Check SLA
      const { isLate } = getSLAInfo(lead.data_entrada, lead.primeira_interacao);
      if (isLate) current.slasCritical++;

      // Check Conversion (Agendamento/Visita)
      if (lead.status.toLowerCase().includes('visita') || lead.status.toLowerCase().includes('agendado')) {
        current.agendamentos++;
      }
    });

    // Calc Efficiency
    Object.values(stats).forEach(stat => {
      stat.efficiency = stat.total > 0 
        ? ((stat.agendamentos / stat.total) * 100).toFixed(1) + '%' 
        : '0.0%';
    });

    return Object.values(stats).sort((a, b) => b.total - a.total);
  }, [leads]);

  // --- CSV Export ---
  const handleExportCSV = () => {
    if (leads.length === 0) return;

    const headers = ['ID', 'Data Entrada', 'Nome', 'Telefone', 'Email', 'Time', 'Status', 'Data Interação', 'SLA Label', 'SLA Crítico'];
    const csvContent = [
      headers.join(','),
      ...leads.map(l => {
        const sla = getSLAInfo(l.data_entrada, l.primeira_interacao);
        return [
          l.id,
          new Date(l.data_entrada).toLocaleString(),
          `"${l.nome}"`, // Escape quotes
          `"${l.telefone}"`,
          l.email,
          `"${l.time}"`,
          l.status,
          l.primeira_interacao ? new Date(l.primeira_interacao).toLocaleString() : '',
          `"${sla.label}"`,
          sla.isLate ? 'SIM' : 'NAO'
        ].join(',');
      })
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `relatorio_leads_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // --- WhatsApp Share ---
  const handleWhatsAppShare = () => {
    // 1. Calculate stats
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    
    // Filter leads from today
    const leadsToday = leads.filter(l => l.data_entrada.startsWith(todayStr));
    const totalLeadsToday = leadsToday.length;

    // Calculate SLA Critical (Total, not just today)
    let totalLate = 0;
    leads.forEach(l => {
       const { isLate } = getSLAInfo(l.data_entrada, l.primeira_interacao);
       if (isLate) totalLate++;
    });
    
    // Group by Team (Today only)
    const teamCountsToday: Record<string, number> = {};
    leadsToday.forEach(l => {
      const teamName = l.time || 'Sem Time';
      teamCountsToday[teamName] = (teamCountsToday[teamName] || 0) + 1;
    });

    // Format Team List
    const teamListStr = Object.entries(teamCountsToday)
      .sort(([, a], [, b]) => b - a)
      .map(([name, count]) => `• ${name}: ${count}`)
      .join('\n');

    // 2. Generate Text
    const todayFormatted = today.toLocaleDateString('pt-BR');
    const text = `📊 *Relatório Donna - ${todayFormatted}*

✅ *Total Hoje:* ${totalLeadsToday} leads

📅 *Entrada por Time:*
${teamListStr || '• Nenhum lead hoje'}

🚨 *Auditoria SLA:* ${totalLate} atrasados (Geral)
🔗 _Sistema Lead Intelligence_`;

    // 3. Copy to Clipboard
    navigator.clipboard.writeText(text);

    // 4. Redirect
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600"></div>
          <p className="text-slate-500 font-medium animate-pulse">Gerando Inteligência...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-lg shadow-xl border-l-4 border-red-500 max-w-lg">
          <h2 className="text-xl font-bold text-red-600 mb-2">Erro no Carregamento</h2>
          <p className="text-slate-600 mb-4">{error}</p>
          <Link href="/" className="text-indigo-600 hover:underline font-medium">Voltar ao Dashboard</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans pb-12">
      
      {/* Seção A: Cabeçalho de Controle */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link 
              href="/" 
              className="p-2 hover:bg-slate-100 rounded-full text-slate-500 transition-colors"
              title="Voltar ao Dashboard"
            >
              <ArrowLeft size={24} />
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-slate-800">Central de Relatórios & Auditoria</h1>
              <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">
                Business Intelligence • {new Date().toLocaleDateString()}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <button 
              onClick={handleWhatsAppShare}
              className="flex items-center gap-2 px-5 py-2.5 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-all shadow-sm hover:shadow-md font-medium"
            >
              <MessageCircle size={18} />
              Resumo WhatsApp
            </button>
            
            <button 
              onClick={handleExportCSV}
              className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-all shadow-sm hover:shadow-md font-medium"
            >
              <Download size={18} />
              Exportar CSV
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-10">
        
        {/* Seção B: Matriz de Performance por Time */}
        <section>
          <h2 className="text-lg font-bold text-slate-700 mb-4 flex items-center gap-2">
            <Activity size={20} className="text-indigo-500" />
            Matriz de Performance por Time
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {teamStats.map((stat) => (
              <div key={stat.name} className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 hover:shadow-md transition-shadow relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                  <Users size={64} />
                </div>
                
                <h3 className="text-lg font-bold text-slate-800 mb-1">{stat.name}</h3>
                <div className="text-xs text-slate-400 font-medium uppercase mb-6">Performance Geral</div>

                <div className="space-y-4 relative z-10">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-slate-500">Volume Total</span>
                    <span className="text-xl font-bold text-slate-800">{stat.total}</span>
                  </div>
                  
                  <div className="flex justify-between items-center p-2 bg-red-50 rounded-lg border border-red-100">
                    <span className="text-sm text-red-700 font-medium flex items-center gap-1.5">
                      <AlertTriangle size={14} />
                      SLA Crítico ({'>'}2h)
                    </span>
                    <span className="text-lg font-bold text-red-700">{stat.slasCritical}</span>
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="text-sm text-slate-500">Eficiência (Visitas)</span>
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-emerald-500 rounded-full" 
                          style={{ width: stat.efficiency }}
                        ></div>
                      </div>
                      <span className="text-sm font-bold text-emerald-600">{stat.efficiency}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Seção C: A "Tabela da Verdade" */}
        <section>
          <h2 className="text-lg font-bold text-slate-700 mb-4 flex items-center gap-2">
            <Clock size={20} className="text-indigo-500" />
            Tabela da Verdade (Auditoria Minuto a Minuto)
          </h2>
          
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-50 text-xs uppercase font-bold text-slate-500 tracking-wider">
                  <tr>
                    <th className="px-6 py-4 border-b border-slate-200">Data Entrada</th>
                    <th className="px-6 py-4 border-b border-slate-200">Lead</th>
                    <th className="px-6 py-4 border-b border-slate-200">Time Responsável</th>
                    <th className="px-6 py-4 border-b border-slate-200">Status Atual</th>
                    <th className="px-6 py-4 border-b border-slate-200">Cronômetro SLA</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {leads.sort((a, b) => new Date(b.data_entrada).getTime() - new Date(a.data_entrada).getTime()).map((lead) => {
                    const sla = getSLAInfo(lead.data_entrada, lead.primeira_interacao);
                    
                    return (
                      <tr key={lead.id} className="hover:bg-slate-50 transition-colors group">
                        <td className="px-6 py-4 text-slate-600 font-mono">
                          {new Date(lead.data_entrada).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                          <span className="text-slate-400 ml-2">
                            {new Date(lead.data_entrada).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="font-bold text-slate-800">{lead.nome}</div>
                          <div className="text-xs text-slate-500 mt-0.5 font-mono">{formatPhoneNumber(lead.telefone)}</div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="inline-flex items-center px-2 py-1 rounded bg-slate-100 text-slate-600 font-medium text-xs">
                            {lead.time}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${
                            lead.status.toLowerCase() === 'novo' ? 'bg-blue-100 text-blue-700' :
                            lead.status.toLowerCase().includes('visita') ? 'bg-emerald-100 text-emerald-700' :
                            'bg-slate-100 text-slate-700'
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${
                              lead.status.toLowerCase() === 'novo' ? 'bg-blue-500' :
                              lead.status.toLowerCase().includes('visita') ? 'bg-emerald-500' :
                              'bg-slate-400'
                            }`}></span>
                            {lead.status}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className={`flex items-center gap-2 font-medium ${
                            sla.isLate ? 'text-red-600' : 'text-emerald-600'
                          }`}>
                            {sla.isLate ? <AlertTriangle size={16} /> : <CheckCircle size={16} />}
                            {sla.label}
                          </div>
                          {sla.isLate && (
                            <div className="text-[10px] font-bold text-red-500 mt-1 uppercase tracking-wide animate-pulse">
                              Atenção Requerida
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </section>

      </main>
    </div>
  );
}