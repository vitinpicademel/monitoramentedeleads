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
  ctr: string;
  cpc: string;
  cpl: string;
  teamName: string;
}

export async function GET() {
  try {
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

    // Fazer requisições simultâneas para todas as contas
    const accountPromises = adAccounts.map(async (account) => {
      const endpoint = `https://graph.facebook.com/v19.0/act_${account.id}/insights?fields=campaign_name,spend,impressions,clicks,actions&date_preset=maximum&access_token=${accessToken}`;

      try {
        const response = await fetch(endpoint);
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(`Erro na conta ${account.name}: ${errorData.error?.message || `HTTP ${response.status}`}`);
        }

        const data = await response.json();
        
        // Processar os dados e injetar teamName
        const processedData = data.data?.map((campaign: any) => {
          const leads = campaign.actions?.find((action: any) => action.action_type === 'lead')?.value || 0;
          const ctr = campaign.impressions > 0 ? ((campaign.clicks / campaign.impressions) * 100).toFixed(2) : '0.00';
          const cpc = campaign.clicks > 0 ? (campaign.spend / campaign.clicks).toFixed(2) : '0.00';
          const cpl = leads > 0 ? (campaign.spend / leads).toFixed(2) : '0.00';

          return {
            campaign_name: campaign.campaign_name,
            spend: parseFloat(campaign.spend).toFixed(2),
            impressions: campaign.impressions,
            clicks: campaign.clicks,
            leads: leads,
            ctr: ctr,
            cpc: cpc,
            cpl: cpl,
            teamName: account.name // Injetar o nome da conta
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
      acc.totalSpend += parseFloat(campaign.spend);
      acc.totalImpressions += campaign.impressions;
      acc.totalClicks += campaign.clicks;
      acc.totalLeads += campaign.leads;
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
