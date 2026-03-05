import { NextRequest, NextResponse } from 'next/server';

export async function GET() {
  try {
    const accessToken = process.env.META_ACCESS_TOKEN;
    const adAccountId = process.env.META_AD_ACCOUNT_ID;

    if (!accessToken) {
      return NextResponse.json(
        { error: 'META_ACCESS_TOKEN não configurado' },
        { status: 500 }
      );
    }

    if (!adAccountId || adAccountId === '[COLOQUE_SEU_ID_AQUI]') {
      return NextResponse.json(
        { error: 'META_AD_ACCOUNT_ID não configurado. Por favor, insira seu ID de conta de anúncio no .env.local' },
        { status: 500 }
      );
    }

    const endpoint = `https://graph.facebook.com/v19.0/act_${adAccountId}/insights?fields=campaign_name,spend,impressions,clicks,actions&date_preset=maximum&access_token=${accessToken}`;

    const response = await fetch(endpoint);
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return NextResponse.json(
        { 
          error: 'Erro ao buscar dados do Meta Ads',
          details: errorData.error?.message || `HTTP ${response.status}`
        },
        { status: response.status }
      );
    }

    const data = await response.json();
    
    // Processar os dados para extrair leads e calcular métricas
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
        cpl: cpl
      };
    }) || [];

    // Calcular totais globais
    const totals = processedData.reduce((acc: any, campaign: any) => {
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
      data: processedData,
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
