import { NextResponse } from 'next/server';

type UnknownObj = Record<string, unknown>;

const getStr = (obj: UnknownObj, key: string): string => {
  const v = obj[key];
  return typeof v === 'string' ? v : '';
};

const getNumOrStr = (obj: UnknownObj, key: string): string | number | undefined => {
  const v = obj[key];
  if (typeof v === 'string' || typeof v === 'number') return v;
  return undefined;
};

const parseDate = (input: string | undefined): string | null => {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (/^\d{4}-\d{2}-\d{2}T/.test(trimmed)) return trimmed;
  const parts = trimmed.split(' ');
  const datePart = parts[0] || '';
  const timePart = parts[1] || '00:00';
  const dmY = datePart.split('/');
  if (dmY.length === 3) {
    const [d, m, y] = dmY;
    const [hh, mm] = timePart.split(':');
    return `${y}-${m}-${d}T${hh || '00'}:${mm || '00'}:00`;
  }
  return null;
};

const extractList = (data: unknown): UnknownObj[] => {
  if (!data) return [];
  if (Array.isArray(data)) return data as UnknownObj[];
  const obj = data as UnknownObj;
  const candidates = ['lista', 'leads', 'atendimentos', 'items', 'resultado', 'data'];
  for (const key of candidates) {
    const v = obj[key];
    if (Array.isArray(v)) return v as UnknownObj[];
  }
  return [];
};

export async function GET() {
  const API_KEY = process.env.IMOVIEW_API_KEY;
  const BASE_URL = 'https://api.imoview.com.br';

  if (!API_KEY) {
    return NextResponse.json(
      { error: 'API Key não configurada no servidor (IMOVIEW_API_KEY)' },
      { status: 500 }
    );
  }

  const headers = {
    chave: API_KEY,
    'Content-Type': 'application/json'
  } as const;

  const fetchAtendimentos = async (finalidade: number): Promise<UnknownObj[]> => {
    const params = new URLSearchParams({
      numeroPagina: '1',
      numeroRegistros: '50',
      finalidade: finalidade.toString(),
      situacao: '0'
    });
    try {
      const res = await fetch(`${BASE_URL}/Atendimento/RetornarAtendimentos?${params.toString()}`, { headers });
      if (!res.ok) return [];
      const data = await res.json();
      return extractList(data);
    } catch {
      return [];
    }
  };

  const fetchLeadsBrutos = async (): Promise<UnknownObj[]> => {
    const candidates = [
      `${BASE_URL}/Lead/RetornarLeads`,
      `${BASE_URL}/Leads/RetornarLeads`,
      `${BASE_URL}/Portal/RetornarLeads`
    ];
    for (const url of candidates) {
      try {
        const res = await fetch(url, { headers });
        if (!res.ok) continue;
        const data = await res.json();
        const list = extractList(data);
        if (list.length > 0) return list;
      } catch {
        continue;
      }
    }
    return [];
  };

  const [atAluguel, atVenda, brutos] = await Promise.all([
    fetchAtendimentos(1),
    fetchAtendimentos(2),
    fetchLeadsBrutos()
  ]);

  const mapAtendimento = (item: UnknownObj) => {
    const id = getNumOrStr(item, 'codigo') ?? Math.random().toString();
    const leadObj = (item['lead'] as UnknownObj) || {};
    const nome = getStr(leadObj, 'nome') || getStr(item, 'nome') || 'Sem Nome';
    const telefone =
      getStr(leadObj, 'telefone1') ||
      getStr(leadObj, 'celular') ||
      getStr(item, 'telefone') ||
      '';
    const email = getStr(leadObj, 'email') || getStr(item, 'email') || '';
    const status = getStr(item, 'situacao') || 'Novo';
    const time = getStr(item, 'unidadenome') || 'Geral';
    const entrada =
      parseDate(getStr(item, 'datahoraentradalead')) ||
      parseDate(getStr(item, 'data_entrada')) ||
      new Date().toISOString();
    const primeira =
      parseDate(getStr(item, 'datahoraultimainteracao')) ||
      parseDate(getStr(item, 'primeira_interacao')) ||
      null;
    const origem = getStr(item, 'midia') || 'Site';
    return {
      id,
      nome,
      telefone,
      email,
      status,
      time,
      data_entrada: entrada,
      primeira_interacao: primeira || undefined,
      origem,
      tem_atendimento: true
    };
  };

  const mapBruto = (item: UnknownObj) => {
    const id = getNumOrStr(item, 'id') ?? getNumOrStr(item, 'codigo') ?? Math.random().toString();
    const nome =
      getStr(item, 'nome') ||
      getStr(item, 'lead_nome') ||
      'Sem Nome';
    const telefone =
      getStr(item, 'telefone1') ||
      getStr(item, 'celular') ||
      getStr(item, 'telefone') ||
      getStr(item, 'phone') ||
      '';
    const email = getStr(item, 'email') || '';
    const status = getStr(item, 'status') || 'Novo';
    const time = getStr(item, 'unidadenome') || getStr(item, 'time') || 'Geral';
    const entrada =
      parseDate(getStr(item, 'data_criacao')) ||
      parseDate(getStr(item, 'datahoraentradalead')) ||
      new Date().toISOString();
    const origem = getStr(item, 'origem') || 'Site';
    return {
      id,
      nome,
      telefone,
      email,
      status,
      time,
      data_entrada: entrada,
      primeira_interacao: undefined,
      origem,
      tem_atendimento: false
    };
  };

  const atendimentos = [...atAluguel, ...atVenda].map(mapAtendimento);
  const leadsBrutos = brutos.map(mapBruto);

  const all = [...leadsBrutos, ...atendimentos].sort(
    (a, b) => new Date(b.data_entrada).getTime() - new Date(a.data_entrada).getTime()
  );

  return NextResponse.json({ leads: all });
}
