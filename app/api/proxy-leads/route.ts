import { NextResponse } from 'next/server';

// Cache forte por 5 minutos para evitar rate limit e timeout
export const revalidate = 300;

export async function GET(request: Request) {
  const API_KEY = process.env.IMOVIEW_API_KEY;
  const BASE_URL = 'https://api.imoview.com.br';

  if (!API_KEY) {
    return NextResponse.json(
      { error: 'API Key não configurada no servidor (IMOVIEW_API_KEY)' },
      { status: 500 }
    );
  }

  // Helper function para buscar leads com paginação segura e otimizada
  const fetchAllLeadsByPurpose = async (finalidade: number) => {
    // finalidade: 1-Aluguel, 2-Venda
    const allLeads: any[] = [];
    let currentPage = 1;
    const recordsPerPage = 50;
    const maxPages = 8; // Limite de segurança: máximo 8 páginas (400 leads)
    let hasMoreLeads = true;

    // Calcular data de 30 dias atrás para filtro
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const dataInicio = thirtyDaysAgo.toLocaleDateString('pt-BR').replace(/\//g, '-'); // Formato DD-MM-YYYY

    while (hasMoreLeads && currentPage <= maxPages) {
      const params = new URLSearchParams({
        numeroPagina: currentPage.toString(),
        numeroRegistros: recordsPerPage.toString(),
        finalidade: finalidade.toString(),
        situacao: '0', // 0 para todos
        data_inicio: dataInicio // Apenas últimos 30 dias
      });

      try {
        console.log(`Buscando página ${currentPage}/${maxPages} para finalidade ${finalidade} (últimos 30 dias)...`);
        
        const res = await fetch(`${BASE_URL}/Atendimento/RetornarAtendimentos?${params.toString()}`, {
          headers: {
            'chave': API_KEY,
            'Content-Type': 'application/json'
          },
          // Timeout reduzido para 10 segundos
          signal: AbortSignal.timeout(10000)
        });

        if (!res.ok) {
          const txt = await res.text();
          console.error(`Erro Imoview (Finalidade ${finalidade}, Página ${currentPage}): ${res.status} - ${txt}`);
          
          // Graceful degradation: se der erro, parar mas retornar o que já conseguiu
          if (res.status === 429) {
            console.log('Rate limit detectado, parando busca para evitar bloqueio. Retornando leads acumulados.');
          } else if (res.status >= 500) {
            console.log('Erro servidor detectado, parando busca. Retornando leads acumulados.');
          }
          break; // Parar busca mas manter os leads já coletados
        }
        
        const data = await res.json();
        const extractList = (data: any) => {
          if (!data) return [];
          if (Array.isArray(data)) return data;
          if (Array.isArray(data.lista)) return data.lista;
          if (Array.isArray(data.atendimentos)) return data.atendimentos;
          if (Array.isArray(data.resultado)) return data.resultado;
          return [];
        };

        const pageLeads = extractList(data);
        
        if (pageLeads.length === 0) {
          console.log(`Página ${currentPage} vazia, finalizando busca para finalidade ${finalidade}`);
          hasMoreLeads = false;
        } else {
          console.log(`Página ${currentPage}: ${pageLeads.length} leads encontrados`);
          allLeads.push(...pageLeads);
          
          // Se retornou menos que o limite, pode ser que acabou ou atingiu o filtro de data
          if (pageLeads.length < recordsPerPage) {
            console.log(`Página com menos registros que o limite (${pageLeads.length} < ${recordsPerPage}), finalizando busca.`);
            hasMoreLeads = false;
          } else {
            currentPage++;
            // Delay menor entre requisições para melhor performance
            await new Promise(resolve => setTimeout(resolve, 300));
          }
        }
      } catch (e) {
        console.error(`Exception buscando página ${currentPage} da finalidade ${finalidade}:`, e);
        
        // Graceful degradation: manter leads já coletados em caso de erro
        if (e instanceof Error && e.name === 'AbortError') {
          console.log('Timeout na requisição, parando busca. Retornando leads acumulados.');
        } else {
          console.log('Erro inesperado, parando busca. Retornando leads acumulados.');
        }
        break; // Parar mas não perder os dados já coletados
      }
    }

    if (currentPage > maxPages) {
      console.log(`Limite máximo de páginas (${maxPages}) atingido para finalidade ${finalidade}.`);
    }
    
    console.log(`Finalidade ${finalidade}: Total de ${allLeads.length} leads coletados (últimos 30 dias)`);
    return allLeads;
  };

  try {
    console.log('Iniciando busca otimizada de leads do Imoview (últimos 30 dias)...');
    
    let aluguelData: any[] = [];
    let vendaData: any[] = [];

    // Graceful degradation: buscar cada finalidade separadamente
    try {
      aluguelData = await fetchAllLeadsByPurpose(1);
    } catch (error) {
      console.error('Falha ao buscar leads de aluguel, continuando com venda:', error);
      aluguelData = []; // Garantir array vazio em caso de falha
    }

    try {
      vendaData = await fetchAllLeadsByPurpose(2);
    } catch (error) {
      console.error('Falha ao buscar leads de venda, continuando com aluguel:', error);
      vendaData = []; // Garantir array vazio em caso de falha
    }

    console.log(`Busca concluída: ${aluguelData.length} leads de aluguel, ${vendaData.length} leads de venda`);

    // Combinar listas - sempre teremos um array válido
    const rawLeads = [...aluguelData, ...vendaData];
    
    // Se não conseguiu nenhum lead, retornar array vazio mas não erro
    if (rawLeads.length === 0) {
      console.log('Nenhum lead encontrado nos últimos 30 dias, retornando array vazio.');
      return NextResponse.json({ leads: [] });
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
    const mappedLeads = rawLeads.map((item: any) => {
      // Debug: mostrar estrutura do primeiro lead para identificar campos corretos
      if (rawLeads.indexOf(item) === 0) {
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
