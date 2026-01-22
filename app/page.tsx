'use client';

import React, { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import {
  LayoutDashboard,
  Users,
  Calendar,
  TrendingUp,
  MessageCircle,
  AlertCircle,
  Clock,
  Phone,
  Filter,
  RefreshCcw,
  FileText,
  ArrowUpRight
} from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  Legend
} from 'recharts';
 

// --- Types ---

interface Lead {
  id: string | number;
  nome: string;
  telefone: string;
  email?: string;
  status: string;
  time?: string; // Team/Queue
  data_entrada: string; // ISO Date
  primeira_interacao?: string; // ISO Date
  origem?: string;
  tem_atendimento?: boolean;
}

interface RawLead {
  id?: string | number;
  nome?: string;
  name?: string;
  telefone?: string;
  phone?: string;
  celular?: string;
  email?: string;
  status?: string;
  time?: string;
  team?: string;
  fila?: string;
  data_entrada?: string;
  created_at?: string;
  primeira_interacao?: string;
  first_interaction?: string;
  origem?: string;
}

interface KPI {
  totalLeads: number;
  agendamentos: number; // Placeholder logic
  conversao: string; // Placeholder logic
  atendimento: number;
}

// --- Mock Data Fallback (ONLY for initial structure dev, replaced by API error in prod) ---
// User requested NO Mock Data if API fails. 
// So we start with empty state and show error if fetch fails.

export default function Dashboard() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [leadsAll, setLeadsAll] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTeam, setSelectedTeam] = useState<string>('Todos');
  const [dataMode, setDataMode] = useState<'atendimentos' | 'geral'>('atendimentos');

  // Fetch Data
  const fetchLeads = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/proxy-leads');
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || `Erro ${res.status}`);
      }
      const data = await res.json();
      
      // Adapt API response to Lead interface
      // Assuming API returns { data: Lead[] } or Lead[]
      // We need to map real API fields to our interface.
      // Since we don't have the real API response, we'll assume a flat array or a 'leads' property.
      const rawLeads = Array.isArray(data) ? data : (data.leads || data.data || []);
      
      // Normalize data
      const normalizedLeads: Lead[] = (rawLeads as RawLead[]).map(l => ({
        id: l.id ?? Math.random().toString(),
        nome: l.nome ?? l.name ?? 'Sem Nome',
        telefone: l.telefone ?? l.phone ?? l.celular ?? '',
        email: l.email ?? '',
        status: l.status ?? 'Novo',
        time: l.time ?? l.team ?? l.fila ?? 'Geral',
        data_entrada: l.data_entrada ?? l.created_at ?? new Date().toISOString(),
        primeira_interacao: l.primeira_interacao ?? l.first_interaction ?? undefined,
        origem: l.origem ?? 'Site'
      }));

      setLeads(normalizedLeads);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message || 'Falha ao carregar leads');
      } else if (typeof err === 'string') {
        setError(err || 'Falha ao carregar leads');
      } else {
        setError('Falha ao carregar leads');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLeads();
  }, []);
 
  const fetchLeadsAll = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/proxy-leads-all');
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || `Erro ${res.status}`);
      }
      const data = await res.json();
      const rawLeads = Array.isArray(data) ? data : (data.leads || data.data || []);
      const normalizedLeads: Lead[] = (rawLeads as RawLead[]).map(l => ({
        id: l.id ?? Math.random().toString(),
        nome: l.nome ?? l.name ?? 'Sem Nome',
        telefone: l.telefone ?? l.phone ?? l.celular ?? '',
        email: l.email ?? '',
        status: l.status ?? 'Novo',
        time: l.time ?? l.team ?? l.fila ?? 'Geral',
        data_entrada: l.data_entrada ?? l.created_at ?? new Date().toISOString(),
        primeira_interacao: l.primeira_interacao ?? l.first_interaction ?? undefined,
        origem: l.origem ?? 'Site',
        tem_atendimento: (l as any).tem_atendimento === true
      }));
      setLeadsAll(normalizedLeads);
    } catch (err: unknown) {
      if (err instanceof Error) setError(err.message || 'Falha ao carregar leads');
      else if (typeof err === 'string') setError(err || 'Falha ao carregar leads');
      else setError('Falha ao carregar leads');
    } finally {
      setLoading(false);
    }
  };

  // --- Process Data ---

  const currentLeads = dataMode === 'geral' ? leadsAll : leads;

  const teams = useMemo(() => {
    const allTeams = new Set(currentLeads.map(l => l.time || 'Geral'));
    return ['Todos', ...Array.from(allTeams)];
  }, [currentLeads]);

  const filteredLeads = useMemo(() => {
    if (selectedTeam === 'Todos') return currentLeads;
    return currentLeads.filter(l => l.time === selectedTeam);
  }, [currentLeads, selectedTeam]);

  // KPIs
  const kpis = useMemo(() => {
    const total = filteredLeads.length;
    const agendamentos = filteredLeads.filter(l => l.status.toLowerCase().includes('visita')).length;
    const atendimento = filteredLeads.filter(l => ['em atendimento', 'contato feito'].includes(l.status.toLowerCase())).length;
    const pendentes = filteredLeads.filter(l => !l.primeira_interacao).length;
    const conversao = total > 0 ? ((agendamentos / total) * 100).toFixed(1) + '%' : '0%';

    return { totalLeads: total, agendamentos, conversao, atendimento, pendentes };
  }, [filteredLeads]);

  // Charts Data
  const leadsByHour = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredLeads.forEach(l => {
      const hour = new Date(l.data_entrada).getHours();
      const label = `${hour}:00`;
      counts[label] = (counts[label] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([hour, count]) => ({ hour, leads: count }))
      .sort((a, b) => parseInt(a.hour) - parseInt(b.hour));
  }, [filteredLeads]);

  const statusDistribution = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredLeads.forEach(l => {
      counts[l.status] = (counts[l.status] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [filteredLeads]);

  const leadsByTeam = useMemo(() => {
    const counts: Record<string, number> = {};
    leads.forEach(l => { // Use all leads for comparison
      const team = l.time || 'Geral';
      counts[team] = (counts[team] || 0) + 1;
    });
    return Object.entries(counts).map(([name, leads]) => ({ name, leads }));
  }, [leads]);

  // SLA Calculation
  const getSLAInfo = (entry: string, firstInteraction?: string) => {
    const entryTime = new Date(entry).getTime();
    const endTime = firstInteraction ? new Date(firstInteraction).getTime() : new Date().getTime();
    const diffMs = endTime - entryTime;
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMinutes / 60);

    // Regra: > 2 horas = Atrasado
    const isLate = diffHours >= 2;

    let label = '';
    if (firstInteraction) {
      if (diffMinutes < 60) label = `Atendido em ${diffMinutes}min`;
      else label = `Atendido em ${diffHours}h ${diffMinutes % 60}min`;
    } else {
      if (diffMinutes < 60) label = `Esperando há ${diffMinutes}min`;
      else label = `Esperando há ${diffHours}h ${diffMinutes % 60}min`;
    }

    return { isLate, label, status: isLate ? 'Atrasado' : 'No Prazo' };
  };

  const formatPhoneNumber = (phone: string) => {
    if (!phone) return '--';
    // Se já vier formatado (ex: (11) ...), retorna como está
    if (phone.includes('(') && phone.includes(')')) return phone;
    
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length < 10) return phone;
    
    if (cleaned.length === 11) {
      return `(${cleaned.slice(0, 2)}) ${cleaned.slice(2, 7)}-${cleaned.slice(7)}`;
    }
    return `(${cleaned.slice(0, 2)}) ${cleaned.slice(2, 6)}-${cleaned.slice(6)}`;
  };

  const COLORS = ['#3d2e28', '#c89968', '#684e3a', '#AA7B4F', '#E0BFA5'];

  // --- UI Components ---

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FAF9F6] flex items-center justify-center">
        <div className="h-12 w-12 rounded-full border-2 border-[#c89968]/30 border-t-[#c89968] animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#FAF9F6] flex items-center justify-center p-4">
        <div className="bg-white/90 backdrop-blur p-8 rounded-2xl shadow-sm border border-[#c89968]/30 max-w-lg w-full">
          <div className="flex items-center gap-3 mb-4 text-[#3d2e28]">
            <AlertCircle size={32} />
            <h2 className="text-2xl font-semibold tracking-wide">Erro de Conexão</h2>
          </div>
          <p className="text-sm text-[#684e3a] mb-6 leading-relaxed">{error}</p>
          <button 
            onClick={fetchLeads}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#3d2e28] text-[#FAF9F6] text-sm font-medium tracking-wide hover:bg-[#684e3a] transition-colors"
          >
            <RefreshCcw size={18} />
            Tentar Novamente
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAF9F6] text-[#3d2e28] font-sans">
      <header
        className="sticky top-0 z-50 backdrop-blur bg-[#FAF9F6]/80 border-b border-[#c89968]/20"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-full bg-[#3d2e28] flex items-center justify-center">
              <LayoutDashboard className="h-5 w-5 text-[#c89968]" />
            </div>
            <div className="flex flex-col">
              <h1 className="text-lg sm:text-xl font-semibold tracking-[0.16em] uppercase text-[#3d2e28]">
                Monitoramento de Leads Donna
              </h1>
              <span className="text-[11px] tracking-[0.22em] uppercase text-[#684e3a]">
                Painel Operacional em Tempo Real
              </span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-2 text-xs font-medium tracking-wide text-[#684e3a]">
              <Clock size={16} />
              {new Date().toLocaleDateString('pt-BR')}
            </div>
            <Link
              href="/relatorios"
              className="hidden sm:inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-[#c89968]/30 text-xs font-medium tracking-wide text-[#3d2e28] hover:bg-[#c89968]/10 transition-colors"
              title="Relatórios"
            >
              <FileText size={16} />
              Relatórios
            </Link>
            <button
              onClick={fetchLeads}
              className="inline-flex items-center justify-center h-9 w-9 rounded-full border border-[#c89968]/40 hover:bg-[#c89968]/15 text-[#3d2e28] transition-colors"
              title="Atualizar"
            >
              <RefreshCcw size={16} />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        <div className="flex items-center gap-4 overflow-x-auto pb-2">
          <div className="flex items-center gap-2 text-xs sm:text-sm tracking-wide uppercase text-[#684e3a] mr-2">
            <Filter size={16} />
            <span className="font-medium">Filtrar por Time</span>
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <button
              onClick={() => { setDataMode('atendimentos'); }}
              className={`px-3 py-1.5 rounded-full text-xs font-medium tracking-wide transition-all ${
                dataMode === 'atendimentos'
                  ? 'bg-[#c89968] text-[#FAF9F6]'
                  : 'bg-white/90 text-[#3d2e28] border border-[#684e3a]/30 hover:border-[#c89968]'
              }`}
            >
              Atendimentos
            </button>
            <button
              onClick={() => { setDataMode('geral'); if (leadsAll.length === 0) fetchLeadsAll(); }}
              className={`px-3 py-1.5 rounded-full text-xs font-medium tracking-wide transition-all ${
                dataMode === 'geral'
                  ? 'bg-[#c89968] text-[#FAF9F6]'
                  : 'bg-white/90 text-[#3d2e28] border border-[#684e3a]/30 hover:border-[#c89968]'
              }`}
            >
              Leads gerais
            </button>
          </div>
          {teams.map(team => (
            <button
              key={team}
              onClick={() => setSelectedTeam(team)}
              className={`px-4 py-1.5 rounded-full text-xs sm:text-sm font-medium tracking-wide transition-all ${
                selectedTeam === team
                  ? 'bg-[#c89968] text-[#FAF9F6] shadow-sm'
                  : 'bg-white/90 text-[#3d2e28] border border-[#684e3a]/30 hover:border-[#c89968]'
              }`}
            >
              {team}
            </button>
          ))}
        </div>

        <section>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
            <KpiCard
              title="Total Leads Hoje"
              value={kpis.totalLeads}
              icon={<Users className="h-5 w-5 text-[#c89968]" />}
            />
            <KpiCard
              title="Visitas Agendadas"
              value={kpis.agendamentos}
              icon={<Calendar className="h-5 w-5 text-[#c89968]" />}
            />
            <KpiCard
              title="Taxa de Conversão"
              value={kpis.conversao}
              icon={<TrendingUp className="h-5 w-5 text-[#c89968]" />}
            />
            <KpiCard
              title="Em Atendimento"
              value={kpis.atendimento}
              icon={<MessageCircle className="h-5 w-5 text-[#c89968]" />}
            />
            <KpiCard
              title="Pendentes (Sem Atendimento)"
              value={kpis.pendentes}
              icon={<Clock className="h-5 w-5 text-[#c89968]" />}
            />
          </div>
        </section>

        <section>
          {filteredLeads.length > 0 ? (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="bg-white/90 backdrop-blur rounded-2xl border border-[#684e3a]/20 lg:col-span-2 p-6">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-sm sm:text-base font-semibold tracking-wide text-[#3d2e28] uppercase">
                    Volume de Leads por Hora
                  </h3>
                  <TrendingUp size={18} className="text-[#c89968]" />
                </div>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={leadsByHour}>
                      <XAxis
                        dataKey="hour"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: '#684e3a', fontSize: 11 }}
                      />
                      <YAxis
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: '#684e3a', fontSize: 11 }}
                      />
                      <Tooltip
                        contentStyle={{
                          borderRadius: 12,
                          border: '1px solid rgba(200,153,104,0.3)',
                          backgroundColor: '#FAF9F6'
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="leads"
                        stroke="#c89968"
                        strokeWidth={3}
                        dot={{ r: 4, fill: '#FAF9F6', strokeWidth: 2, stroke: '#c89968' }}
                        activeDot={{ r: 6 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="bg-white/90 backdrop-blur rounded-2xl border border-[#684e3a]/20 p-6">
                <h3 className="text-sm sm:text-base font-semibold tracking-wide text-[#3d2e28] uppercase mb-6">
                  Distribuição de Status
                </h3>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={statusDistribution}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={4}
                        dataKey="value"
                      >
                        {statusDistribution.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          borderRadius: 12,
                          border: '1px solid rgba(200,153,104,0.3)',
                          backgroundColor: '#FAF9F6'
                        }}
                      />
                      <Legend
                        verticalAlign="bottom"
                        height={32}
                        formatter={(value: string) => (
                          <span style={{ color: '#684e3a', fontSize: 11, textTransform: 'uppercase' }}>
                            {value}
                          </span>
                        )}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white/90 backdrop-blur rounded-2xl border border-[#684e3a]/20 p-12 text-center">
              <p className="text-sm sm:text-base font-medium tracking-wide text-[#c89968]">
                Nenhum dado encontrado
              </p>
            </div>
          )}
        </section>

        <section>
          <div className="bg-white/90 backdrop-blur rounded-2xl border border-[#684e3a]/20 overflow-hidden">
            <div className="p-6 border-b border-[#684e3a]/15 flex justify-between items-center">
              <div>
                <h3 className="text-sm sm:text-base font-semibold tracking-wide text-[#3d2e28] uppercase">
                  Detalhamento de Leads
                </h3>
                <p className="text-xs text-[#684e3a] mt-1 tracking-wide">
                  Monitoramento individual com SLA em tempo real
                </p>
              </div>
              <span className="text-xs sm:text-sm text-[#684e3a] font-medium">
                {filteredLeads.length} registros
              </span>
            </div>
            {filteredLeads.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-[#3d2e28]">
                  <thead className="bg-[#FAF9F6] text-[11px] uppercase font-semibold tracking-[0.18em] text-[#684e3a]">
                    <tr>
                      <th className="px-6 py-4">Data</th>
                      <th className="px-6 py-4">Nome</th>
                      <th className="px-6 py-4">Contato</th>
                      <th className="px-6 py-4">Email</th>
                      <th className="px-6 py-4">Status</th>
                      <th className="px-6 py-4">Time</th>
                      <th className="px-6 py-4">SLA (Espera)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#684e3a]/10">
                    {filteredLeads.map(lead => {
                      const { isLate, label, status } = getSLAInfo(
                        lead.data_entrada,
                        lead.primeira_interacao
                      );

                      return (
                        <tr
                          key={lead.id}
                          className="hover:bg-[#c89968]/5 transition-colors"
                        >
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm font-semibold text-[#3d2e28]">
                              {new Date(lead.data_entrada).toLocaleDateString('pt-BR')}
                            </div>
                            <div className="text-xs text-[#684e3a]">
                              {new Date(lead.data_entrada).toLocaleTimeString('pt-BR', {
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </div>
                          </td>
                          <td className="px-6 py-4 font-medium text-[#3d2e28]">{lead.nome}</td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex flex-col items-start">
                              <div className="flex items-center gap-1.5 text-[#3d2e28] font-medium">
                                <Phone size={14} className="text-[#684e3a]" />
                                <span>{formatPhoneNumber(lead.telefone)}</span>
                              </div>
                              <CopyAction value={lead.telefone} />
                            </div>
                          </td>
                          <td className="px-6 py-4 max-w-[220px]">
                            <div className="flex flex-col items-start">
                              <span
                                className="text-sm text-[#684e3a] truncate w-full"
                                title={lead.email}
                              >
                                {lead.email || '--'}
                              </span>
                              {lead.email && <CopyAction value={lead.email} />}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span
                              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold tracking-wide ${
                                lead.status.toLowerCase() === 'novo'
                                  ? 'bg-[#c89968]/15 text-[#3d2e28]'
                                  : lead.status.toLowerCase().includes('visita')
                                  ? 'bg-[#3d2e28]/10 text-[#3d2e28]'
                                  : 'bg-[#684e3a]/10 text-[#684e3a]'
                              }`}
                            >
                              {lead.status}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-sm text-[#3d2e28]">
                            {lead.time || '-'}
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              {isLate ? (
                                <AlertCircle size={16} className="text-[#b3261e]" />
                              ) : (
                                <Clock size={16} className="text-[#3d2e28]" />
                              )}
                              <div className="flex flex-col">
                                <span
                                  className={
                                    isLate
                                      ? 'text-[#b3261e] font-semibold'
                                      : 'text-[#3d2e28] font-semibold'
                                  }
                                >
                                  {label}
                                </span>
                                <span className="text-[11px] text-[#684e3a]">{status}</span>
                              </div>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-12 text-center">
                <p className="text-sm sm:text-base font-medium tracking-wide text-[#c89968]">
                  Nenhum dado encontrado
                </p>
              </div>
            )}
          </div>
        </section>

        <section>
          <div className="bg-white/90 backdrop-blur rounded-2xl border border-[#684e3a]/20 overflow-hidden">
            <div className="p-6 border-b border-[#684e3a]/15 flex justify-between items-center">
              <div>
                <h3 className="text-sm sm:text-base font-semibold tracking-wide text-[#3d2e28] uppercase">
                  Leads Pendentes
                </h3>
                <p className="text-xs text-[#684e3a] mt-1 tracking-wide">
                  Chegaram no sistema e ainda não iniciaram atendimento
                </p>
              </div>
              <span className="text-xs sm:text-sm text-[#684e3a] font-medium">
                {filteredLeads.filter(l => !l.primeira_interacao).length} registros
              </span>
            </div>
            {filteredLeads.filter(l => !l.primeira_interacao).length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-[#3d2e28]">
                  <thead className="bg-[#FAF9F6] text-[11px] uppercase font-semibold tracking-[0.18em] text-[#684e3a]">
                    <tr>
                      <th className="px-6 py-4">Data</th>
                      <th className="px-6 py-4">Nome</th>
                      <th className="px-6 py-4">Contato</th>
                      <th className="px-6 py-4">Email</th>
                      <th className="px-6 py-4">Status</th>
                      <th className="px-6 py-4">Time</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#684e3a]/10">
                    {filteredLeads.filter(l => !l.primeira_interacao).map(lead => (
                      <tr key={lead.id} className="hover:bg-[#c89968]/5 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-semibold text-[#3d2e28]">
                            {new Date(lead.data_entrada).toLocaleDateString('pt-BR')}
                          </div>
                          <div className="text-xs text-[#684e3a]">
                            {new Date(lead.data_entrada).toLocaleTimeString('pt-BR', {
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </div>
                        </td>
                        <td className="px-6 py-4 font-medium text-[#3d2e28]">{lead.nome}</td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex flex-col items-start">
                            <div className="flex items-center gap-1.5 text-[#3d2e28] font-medium">
                              <Phone size={14} className="text-[#684e3a]" />
                              <span>{formatPhoneNumber(lead.telefone)}</span>
                            </div>
                            <CopyAction value={lead.telefone} />
                          </div>
                        </td>
                        <td className="px-6 py-4 max-w-[220px]">
                          <div className="flex flex-col items-start">
                            <span className="text-sm text-[#684e3a] truncate w-full" title={lead.email}>
                              {lead.email || '--'}
                            </span>
                            {lead.email && <CopyAction value={lead.email} />}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold tracking-wide bg-[#c89968]/15 text-[#3d2e28]">
                            {lead.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-[#3d2e28]">
                          {lead.time || '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-12 text-center">
                <p className="text-sm sm:text-base font-medium tracking-wide text-[#c89968]">
                  Nenhum dado encontrado
                </p>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

function KpiCard({ title, value, icon }: { title: string, value: string | number, icon: React.ReactNode }) {
  return (
    <div className="bg-white/95 p-6 rounded-2xl border border-[#684e3a]/20 flex items-start justify-between transition-all duration-200 hover:-translate-y-0.5 hover:border-[#c89968] hover:shadow-md">
      <div>
        <p className="text-xs font-medium tracking-wide text-[#684e3a] mb-1 uppercase">{title}</p>
        <h4 className="text-2xl font-semibold text-[#3d2e28]">{value}</h4>
      </div>
      <div className="p-3 rounded-full bg-[#FAF9F6] border border-[#684e3a]/20">
        {icon}
      </div>
    </div>
  );
}

function CopyAction({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (!value) return;
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!value) return null;

  return (
    <button 
      onClick={handleCopy}
      className="flex items-center gap-1 mt-1 group transition-colors outline-none"
    >
      <span className={`text-[11px] font-medium uppercase tracking-wider transition-colors ${
        copied ? 'text-[#3d2e28]' : 'text-[#684e3a] group-hover:text-[#c89968]'
      }`}>
        {copied ? 'Copiado!' : 'Copiar'}
      </span>
      {!copied && (
        <ArrowUpRight 
          size={12} 
          className="text-[#684e3a]/60 group-hover:text-[#c89968] transition-colors" 
        />
      )}
    </button>
  );
}
