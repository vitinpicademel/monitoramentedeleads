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

  // Helper function para buscar leads com paginação completa
  const fetchAllLeadsByPurpose = async (finalidade: number) => {
    // finalidade: 1-Aluguel, 2-Venda
    const allLeads: any[] = [];
    let currentPage = 1;
    const recordsPerPage = 50; // Aumentando para 50 para reduzir requisições
    let hasMoreLeads = true;

    while (hasMoreLeads) {
      const params = new URLSearchParams({
        numeroPagina: currentPage.toString(),
        numeroRegistros: recordsPerPage.toString(),
        finalidade: finalidade.toString(),
        situacao: '0' // 0 para todos
      });

      try {
        console.log(`Buscando página ${currentPage} para finalidade ${finalidade}...`);
        
        const res = await fetch(`${BASE_URL}/Atendimento/RetornarAtendimentos?${params.toString()}`, {
          headers: {
            'chave': API_KEY,
            'Content-Type': 'application/json'
          },
          // Timeout de 15 segundos por requisição
          signal: AbortSignal.timeout(15000)
        });

        if (!res.ok) {
          const txt = await res.text();
          console.error(`Erro Imoview (Finalidade ${finalidade}, Página ${currentPage}): ${res.status} - ${txt}`);
          // Se der erro de rate limit, esperar e tentar novamente
          if (res.status === 429) {
            console.log('Rate limit detectado, aguardando 2 segundos...');
            await new Promise(resolve => setTimeout(resolve, 2000));
            continue; // Tentar a mesma página novamente
          }
          break; // Se for outro erro, parar
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
          
          // Se retornou menos que o limite, acabaram os leads
          if (pageLeads.length < recordsPerPage) {
            hasMoreLeads = false;
          } else {
            currentPage++;
            // Pequeno delay entre requisições para evitar rate limit
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        }
      } catch (e) {
        console.error(`Exception buscando página ${currentPage} da finalidade ${finalidade}:`, e);
        if (e instanceof Error && e.name === 'AbortError') {
          console.log('Timeout na requisição, tentando novamente...');
          await new Promise(resolve => setTimeout(resolve, 1000));
          continue; // Tentar novamente
        }
        break; // Se for outro erro, parar
      }
    }

    console.log(`Finalidade ${finalidade}: Total de ${allLeads.length} leads coletados`);
    return allLeads;
  };

  try {
    console.log('Iniciando busca completa de leads do Imoview...');
    const [aluguelData, vendaData] = await Promise.all([
      fetchAllLeadsByPurpose(1),
      fetchAllLeadsByPurpose(2)
    ]);

    console.log(`Busca concluída: ${aluguelData.length} leads de aluguel, ${vendaData.length} leads de venda`);

    // Combinar listas
    const rawLeads = [...aluguelData, ...vendaData];

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
