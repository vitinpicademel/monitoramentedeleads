import { NextResponse } from 'next/server';

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

  try {
    console.log('Testando endpoint /App_DetalhesAtendimentos para extrair campo campanha...');
    
    // Primeiro, buscar alguns atendimentos para ter IDs
    const atendimentosRes = await fetch(`${BASE_URL}/Atendimento/RetornarAtendimentos?numeroPagina=1&numeroRegistros=5&finalidade=1&situacao=0`, {
      headers: {
        'chave': API_KEY,
        'Content-Type': 'application/json'
      },
      signal: AbortSignal.timeout(8000)
    });

    if (!atendimentosRes.ok) {
      const txt = await atendimentosRes.text();
      throw new Error(`Erro ao buscar atendimentos: ${atendimentosRes.status} - ${txt}`);
    }

    const atendimentosData = await atendimentosRes.json();
    console.log('Atendimentos recebidos:', JSON.stringify(atendimentosData, null, 2));

    // Extrair lista de atendimentos
    const extractList = (data: any) => {
      if (!data) return [];
      if (Array.isArray(data)) return data;
      if (Array.isArray(data.lista)) return data.lista;
      if (Array.isArray(data.atendimentos)) return data.atendimentos;
      if (Array.isArray(data.resultado)) return data.resultado;
      return [];
    };

    const atendimentos = extractList(atendimentosData);
    
    if (atendimentos.length === 0) {
      return NextResponse.json(
        { error: 'Nenhum atendimento encontrado para testar detalhes' },
        { status: 404 }
      );
    }

    // Para cada atendimento, buscar detalhes para extrair campo campanha
    const detalhesPromises = atendimentos.slice(0, 3).map(async (atendimento: any) => {
      const codigo = atendimento.codigo;
      
      if (!codigo) {
        return { error: 'Atendimento sem código', atendimento };
      }

      console.log(`Buscando detalhes do atendimento ${codigo}...`);
      
      const detalhesRes = await fetch(`${BASE_URL}/App_DetalhesAtendimentos/${codigo}`, {
        headers: {
          'chave': API_KEY,
          'Content-Type': 'application/json'
        },
        signal: AbortSignal.timeout(8000)
      });

      if (!detalhesRes.ok) {
        const txt = await detalhesRes.text();
        console.error(`Erro ao buscar detalhes do atendimento ${codigo}: ${detalhesRes.status} - ${txt}`);
        return { 
          error: `Erro ${detalhesRes.status}: ${txt}`, 
          codigo,
          atendimentoOriginal: atendimento 
        };
      }

      const detalhesData = await detalhesRes.json();
      console.log(`Detalhes do atendimento ${codigo}:`, JSON.stringify(detalhesData, null, 2));
      
      return {
        codigo,
        atendimentoOriginal: atendimento,
        detalhes: detalhesData,
        campoCampanha: detalhesData?.campanha || 'CAMPO_NAO_ENCONTRADO'
      };
    });

    const resultados = await Promise.all(detalhesPromises);
    
    // Extrair todas as campanhas encontradas
    const campanhasEncontradas = resultados
      .filter(r => r.campoCampanha && r.campoCampanha !== 'CAMPO_NAO_ENCONTRADO')
      .map(r => r.campoCampanha);

    const campanhasUnicas = [...new Set(campanhasEncontradas)];

    console.log('Campanhas encontradas:', campanhasUnicas);

    return NextResponse.json({
      sucesso: true,
      mensagem: 'Teste do endpoint App_DetalhesAtendimentos concluído',
      totalAtendimentosTestados: resultados.length,
      campanhasEncontradas: campanhasUnicas,
      quantidadeCampanhas: campanhasUnicas.length,
      detalhesCompletos: resultados,
      resumo: {
        endpointTestado: '/App_DetalhesAtendimentos/{codigo}',
        campoExtraido: 'campanha',
        status: campanhasUnicas.length > 0 ? 'CAMPO_ENCONTRADO' : 'CAMPO_NAO_ENCONTRADO'
      }
    });

  } catch (error) {
    console.error('Erro completo no teste do App_DetalhesAtendimentos:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    return NextResponse.json(
      { 
        error: `Falha no teste do App_DetalhesAtendimentos: ${errorMessage}`,
        details: error instanceof Error ? error.stack : 'Sem detalhes'
      },
      { status: 500 }
    );
  }
}
