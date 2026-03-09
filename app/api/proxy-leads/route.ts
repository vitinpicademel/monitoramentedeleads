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
      numeroRegistros: '50', // 50 registros por página
      finalidade: finalidade.toString(),
      situacao: '0' // 0 para todos
    });

    try {
      console.log(`Buscando página ${page} para finalidade ${finalidade}...`);
      
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
    console.log('Iniciando busca simples de leads (páginas 1, 2, 3)...');
    
    // Buscar páginas 1, 2, 3 para ambas as finalidades simultaneamente
    const promises = [
      fetchPage(1, 1), // Aluguel página 1
      fetchPage(1, 2), // Aluguel página 2  
      fetchPage(1, 3), // Aluguel página 3
      fetchPage(2, 1), // Venda página 1
      fetchPage(2, 2), // Venda página 2
      fetchPage(2, 3), // Venda página 3
    ];

    const results = await Promise.all(promises);
    
    // Combinar todos os resultados
    const allLeads = results.flat();
    console.log(`Total de ${allLeads.length} leads coletados das 6 páginas`);

    // Se não conseguiu nenhum lead, retornar erro para debug
    if (allLeads.length === 0) {
      console.log('Nenhum lead encontrado, retornando erro para debug');
      return NextResponse.json(
        { error: 'Nenhum lead encontrado nas páginas 1-3. Verificar se há dados recentes ou se a API está funcionando.' },
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
        midia: item.midia || item.origem || item.campanha || item.utm_campaign || item.campaign || 'Desconhecida', // Fallback robusto
        origem: item.midia || item.origem || item.campanha || item.utm_campaign || item.campaign || 'Desconhecida', // Manter compatibilidade
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
