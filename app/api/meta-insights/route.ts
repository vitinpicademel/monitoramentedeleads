import { NextRequest, NextResponse } from 'next/server';

interface AdAccount {
  name: string;
  id: string;
}

interface MetaCampaign {
  campaign_name: string;
  spend: string;
  impressions: number;
  clicks: number;
  leads: number;
  resultados: number;
  ctr: string;
  cpc: string;
  cpl: string;
  status: string;
  start_time: string;
  stop_time?: string;
  updated_time?: string;
  teamName: string;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const datePreset = searchParams.get('date_preset') || 'last_30d';
    
    const accessToken = process.env.META_ACCESS_TOKEN;
    const adAccountsEnv = process.env.META_AD_ACCOUNTS;

    if (!accessToken) {
      return NextResponse.json(
        { error: 'META_ACCESS_TOKEN não configurado' },
        { status: 500 }
      );
    }

    if (!adAccountsEnv) {
      return NextResponse.json(
        { error: 'META_AD_ACCOUNTS não configurado' },
        { status: 500 }
      );
    }

    let adAccounts: AdAccount[];
    try {
      adAccounts = JSON.parse(adAccountsEnv);
    } catch (error) {
      return NextResponse.json(
        { error: 'META_AD_ACCOUNTS não é um JSON válido' },
        { status: 500 }
      );
    }

    if (!Array.isArray(adAccounts) || adAccounts.length === 0) {
      return NextResponse.json(
        { error: 'META_AD_ACCOUNTS deve ser um array com pelo menos uma conta' },
        { status: 500 }
      );
    }

// Fazer requisições simultâneas para todas as contas buscando campanhas individuais
    const accountPromises = adAccounts.map(async (account) => {
      const endpoint = `https://graph.facebook.com/v19.0/act_${account.id}/campaigns?fields=name,status,start_time,stop_time,updated_time,insights.date_preset(${datePreset}){spend,impressions,clicks,actions}&access_token=${accessToken}`;
      
      try {
        const response = await fetch(endpoint);
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(`Erro na conta ${account.name}: ${errorData.error?.message || `HTTP ${response.status}`}`);
        }

        const data = await response.json();
        
        const isConversionAction = (actionType: string) => {
          const normalized = String(actionType || '').toLowerCase();
          if (!normalized) return false;
          if (normalized.includes('lead')) return true;
          if (normalized.includes('contact')) return true;
          if (normalized.includes('messaging_conversation_started')) return true;
          return false;
        };

        // Processar os dados e injetar teamName
        const processedData = data.data?.map((campaign: any) => {
          const insights = campaign.insights?.data?.[0] || {};
          const actions = Array.isArray(insights.actions) ? insights.actions : [];
          const leads = actions.find((action: any) => action.action_type === 'lead')?.value || 0;
          const resultados = actions.reduce((sum: number, action: any) => {
            if (!isConversionAction(action?.action_type)) return sum;
            const value = Number(action?.value) || 0;
            return sum + value;
          }, 0);
          const ctr = insights.impressions > 0 ? ((insights.clicks / insights.impressions) * 100).toFixed(2) : '0.00';
          const cpc = insights.clicks > 0 ? (insights.spend / insights.clicks).toFixed(2) : '0.00';
          const cpl = leads > 0 ? (insights.spend / leads).toFixed(2) : '0.00';

          return {
            campaign_name: campaign.name,
            spend: parseFloat(insights.spend || 0).toFixed(2),
            impressions: insights.impressions || 0,
            clicks: insights.clicks || 0,
            leads: leads,
            resultados: resultados,
            ctr: ctr,
            cpc: cpc,
            cpl: cpl,
            status: campaign.status || 'UNKNOWN',
            start_time: campaign.start_time,
            stop_time: campaign.stop_time,
            updated_time: campaign.updated_time,
            teamName: account.name
          };
        }) || [];

        return processedData;
      } catch (error) {
        console.error(`Erro ao buscar dados da conta ${account.name}:`, error);
        return []; // Retornar array vazio em caso de erro para não quebrar o Promise.all
      }
    });

    // Aguardar todas as requisições
    const allResults = await Promise.all(accountPromises);
    
    // Juntar todos os resultados em um único array
    const mergedData = allResults.flat();

    // Calcular totais globais
    const totals = mergedData.reduce((acc: any, campaign: MetaCampaign) => {
      acc.totalSpend += Number(campaign.spend);
      acc.totalImpressions += Number(campaign.impressions);
      acc.totalClicks += Number(campaign.clicks);
      acc.totalLeads += Number(campaign.leads);
      return acc;
    }, {
      totalSpend: 0,
      totalImpressions: 0,
      totalClicks: 0,
      totalLeads: 0
    });

    const avgCpc = totals.totalClicks > 0 ? (totals.totalSpend / totals.totalClicks).toFixed(2) : '0.00';
    const avgCpl = totals.totalLeads > 0 ? (totals.totalSpend / totals.totalLeads).toFixed(2) : '0.00';
    
    return NextResponse.json({
      success: true,
      data: mergedData,
      summary: {
        totalSpend: totals.totalSpend.toFixed(2),
        totalImpressions: totals.totalImpressions,
        totalClicks: totals.totalClicks,
        totalLeads: totals.totalLeads,
        avgCpc: avgCpc,
        avgCpl: avgCpl
      }
    });

  } catch (error) {
    console.error('Erro na API Meta Insights:', error);
    return NextResponse.json(
      { 
        error: 'Erro interno do servidor',
        details: error instanceof Error ? error.message : 'Erro desconhecido'
      },
      { status: 500 }
    );
  }
}
