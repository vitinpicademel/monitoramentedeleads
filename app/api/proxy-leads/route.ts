import { NextResponse } from 'next/server';

// Forçar dynamic para debug em tempo real - sem cache
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const API_KEY = process.env.IMOVIEW_API_KEY;
  const BASE_URL = 'https://api.imoview.com.br';

  if (!API_KEY) {
    return NextResponse.json(
      { error: 'API Key não configurada no servidor (IMOVIEW_API_KEY)' },
      { status: 500 }
    );
  }

  // Helper function simples para buscar uma página específica
  const fetchPage = async (finalidade: number, page: number) => {
    const params = new URLSearchParams({
      numeroPagina: page.toString(),
      numeroRegistros: '20', // Limite do Imoview: máximo 20 registros por página
      finalidade: finalidade.toString(),
      situacao: '0' // 0 para todos
    });

    try {
      console.log(`Buscando página ${page} para finalidade ${finalidade} (20 registros)...`);
      
      const res = await fetch(`${BASE_URL}/Atendimento/RetornarAtendimentos?${params.toString()}`, {
        headers: {
          'chave': API_KEY,
          'Content-Type': 'application/json'
        },
        // Timeout de 8 segundos
        signal: AbortSignal.timeout(8000)
      });

      if (!res.ok) {
        const txt = await res.text();
        console.error(`Erro Imoview (Finalidade ${finalidade}, Página ${page}): ${res.status} - ${txt}`);
        throw new Error(`Erro ${res.status}: ${txt}`);
      }
      
      const data = await res.json();
      console.log(`Página ${page} (finalidade ${finalidade}): ${JSON.stringify(data).substring(0, 200)}...`);
      
      const extractList = (data: any) => {
        if (!data) return [];
        if (Array.isArray(data)) return data;
        if (Array.isArray(data.lista)) return data.lista;
        if (Array.isArray(data.atendimentos)) return data.atendimentos;
        if (Array.isArray(data.resultado)) return data.resultado;
        return [];
      };

      const pageLeads = extractList(data);
      console.log(`Página ${page} (finalidade ${finalidade}): ${pageLeads.length} leads encontrados`);
      return pageLeads;
      
    } catch (error) {
      console.error(`Exception na página ${page} (finalidade ${finalidade}):`, error);
      throw error; // Propagar erro para debug
    }
  };

  try {
    console.log('Iniciando busca ajustada de leads (páginas 1-10, 20 regs cada)...');
    
    // Buscar páginas 1-10 para ambas as finalidades simultaneamente (20 páginas × 20 = 400 leads máximos)
    const promises = [
      fetchPage(1, 1), fetchPage(1, 2), fetchPage(1, 3), fetchPage(1, 4), fetchPage(1, 5), // Aluguel páginas 1-5
      fetchPage(1, 6), fetchPage(1, 7), fetchPage(1, 8), fetchPage(1, 9), fetchPage(1, 10), // Aluguel páginas 6-10
      fetchPage(2, 1), fetchPage(2, 2), fetchPage(2, 3), fetchPage(2, 4), fetchPage(2, 5), // Venda páginas 1-5
      fetchPage(2, 6), fetchPage(2, 7), fetchPage(2, 8), fetchPage(2, 9), fetchPage(2, 10), // Venda páginas 6-10
    ];

    const results = await Promise.all(promises);
    
    // Combinar todos os resultados
    const allLeads = results.flat();
    console.log(`Total de ${allLeads.length} leads coletados das 20 páginas (respeitando limite de 20/página)`);

    // Se não conseguiu nenhum lead, retornar erro para debug
    if (allLeads.length === 0) {
      console.log('Nenhum lead encontrado, retornando erro para debug');
      return NextResponse.json(
        { error: 'Nenhum lead encontrado nas páginas 1-10. Verificar se há dados recentes ou se a API está funcionando.' },
        { status: 404 }
      );
    }

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
    const mappedLeads = allLeads.map((item: any) => {
      // Debug: mostrar estrutura do primeiro lead para identificar campos corretos
      if (allLeads.indexOf(item) === 0) {
        console.log('Lead 0 Imoview:', JSON.stringify(item, null, 2));
      }
      
      return {
        id: item.codigo?.toString() || Math.random().toString(),
        nome: item.lead?.nome || 'Sem Nome',
        telefone: item.lead?.telefone1 || item.lead?.celular || '',
        email: item.lead?.email || '',
        status: item.situacao || 'Novo',
        time: item.unidadenome || 'Geral',
        data_entrada: parseImoviewDate(item.datahoraentradalead) || new Date().toISOString(),
        primeira_interacao: parseImoviewDate(item.datahoraultimainteracao) || null,
        midia: item.origem || item.midia || item.campanha || item.utm_campaign || item.campaign || 'Desconhecida', // Origem identificada pelo cliente
        origem: item.origem || item.midia || item.campanha || item.utm_campaign || item.campaign || 'Desconhecida', // Manter compatibilidade
        _raw: item
      };
    });

    // Ordenar por data mais recente
    mappedLeads.sort((a: any, b: any) => new Date(b.data_entrada).getTime() - new Date(a.data_entrada).getTime());

    console.log(`Retornando ${mappedLeads.length} leads mapeados para o frontend`);
    return NextResponse.json({ leads: mappedLeads });

  } catch (error) {
    console.error('Erro completo na API do Imoview:', error);
    
    // Retornar erro real para debug no frontend
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    return NextResponse.json(
      { 
        error: `Falha na API do Imoview: ${errorMessage}`,
        details: error instanceof Error ? error.stack : 'Sem detalhes'
      },
      { status: 500 }
    );
  }
}
