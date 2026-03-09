import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const API_KEY = process.env.IMOVIEW_API_KEY;
  const BASE_URL = 'https://api.imoview.com.br';

  if (!API_KEY) {
    return NextResponse.json(
      { error: 'API Key não configurada no servidor (IMOVIEW_API_KEY)' },
      { status: 500 }
    );
  }

  // Helper function to fetch leads by purpose (finalidade)
  const fetchLeads = async (finalidade: number) => {
    // finalidade: 1-Aluguel, 2-Venda
    // Docs say max 20 records per page.
    const params = new URLSearchParams({
      numeroPagina: '1',
      numeroRegistros: '20', 
      finalidade: finalidade.toString(),
      situacao: '0' // 0 para todos
    });

    try {
      const res = await fetch(`${BASE_URL}/Atendimento/RetornarAtendimentos?${params.toString()}`, {
        headers: {
          'chave': API_KEY, // Header correto identificado no Swagger
          'Content-Type': 'application/json'
        }
      });

      if (!res.ok) {
        const txt = await res.text();
        console.error(`Erro Imoview (Finalidade ${finalidade}): ${res.status} - ${txt}`);
        return [];
      }
      
      const data = await res.json();
      return data;
    } catch (e) {
      console.error(`Exception fetching finalidade ${finalidade}:`, e);
      return [];
    }
  };

  try {
    const [aluguelData, vendaData] = await Promise.all([
      fetchLeads(1),
      fetchLeads(2)
    ]);

    // Combinar listas. A API pode retornar um objeto com a lista dentro.
    // Estrutura provável: { lista: [...], ... } ou array direto.
    const extractList = (data: any) => {
        if (!data) return [];
        if (Array.isArray(data)) return data;
        // Common Imoview patterns:
        if (Array.isArray(data.lista)) return data.lista;
        if (Array.isArray(data.atendimentos)) return data.atendimentos;
        if (Array.isArray(data.resultado)) return data.resultado;
        return [];
    };

    const listaAluguel = extractList(aluguelData);
    const listaVenda = extractList(vendaData);

    const rawLeads = [...listaAluguel, ...listaVenda];

    // Função auxiliar para converter data "DD/MM/YYYY HH:mm" para ISO
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

    // Mapeamento para o formato do Frontend
    const mappedLeads = rawLeads.map((item: any) => ({
      id: item.codigo?.toString() || Math.random().toString(),
      nome: item.lead?.nome || 'Sem Nome',
      telefone: item.lead?.telefone1 || item.lead?.celular || '',
      email: item.lead?.email || '',
      status: item.situacao || 'Novo',
      time: item.unidadenome || 'Geral',
      data_entrada: parseImoviewDate(item.datahoraentradalead) || new Date().toISOString(),
      primeira_interacao: parseImoviewDate(item.datahoraultimainteracao) || null,
      origem: item.midia || 'Site',
      _raw: item
    }));

    // Ordenar por data mais recente
    mappedLeads.sort((a, b) => new Date(b.data_entrada).getTime() - new Date(a.data_entrada).getTime());

    return NextResponse.json({ leads: mappedLeads });

  } catch (error) {
    console.error('Erro no Proxy de Leads:', error);
    return NextResponse.json(
      { error: 'Falha interna ao conectar com a API' },
      { status: 500 }
    );
  }
}
