
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.21.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper function to format currency with commas and decimals
const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount);
};

// Helper function to format percentages
const formatPercent = (value: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'percent',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value / 100);
};

async function getPortfolioAnalysis(userId: string) {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  // Get user's portfolio data
  const { data: portfolio, error: portfolioError } = await supabase
    .from('portfolios')
    .select(`
      *,
      stocks (*)
    `)
    .eq('user_id', userId)
    .single();

  if (portfolioError) throw portfolioError;
  if (!portfolio) return null;

  const totalValue = portfolio.total_holding || 0;
  const totalProfit = portfolio.total_profit || 0;
  
  return {
    totalValue,
    totalProfit,
    activeStocks: portfolio.active_stocks || 0,
    stocks: portfolio.stocks
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { message, userId } = await req.json();
    if (!message || !userId) throw new Error('Message and userId are required');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Handle portfolio analysis requests
    if (message.toLowerCase().includes('portfolio') && 
        (message.toLowerCase().includes('analysis') || 
         message.toLowerCase().includes('overview') || 
         message.toLowerCase().includes('performance'))) {
      const analysis = await getPortfolioAnalysis(userId);
      
      if (!analysis) {
        return new Response(
          JSON.stringify({ 
            reply: "I don't see any portfolio data yet. Would you like to start by making your first investment?" 
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const response = `Here's your current portfolio status:
Total Value: ${formatCurrency(analysis.totalValue)}
Performance: ${formatPercent(analysis.totalProfit)}
Active Stocks: ${analysis.activeStocks}

${analysis.stocks.map((stock: any) => 
  `${stock.symbol}: ${stock.shares} shares at ${formatCurrency(stock.current_price)} per share`
).join('\n')}`;

      return new Response(
        JSON.stringify({ reply: response }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Handle trade requests
    const buyMatch = message.match(/buy\s+(\d+)\s+shares?\s+of\s+([A-Za-z]+)/i);
    const sellMatch = message.match(/sell\s+(\d+)\s+shares?\s+of\s+([A-Za-z]+)/i);
    
    if (buyMatch || sellMatch) {
      const match = buyMatch || sellMatch;
      const action = buyMatch ? 'buy' : 'sell';
      const shares = parseInt(match![1]);
      let symbol = match![2].toUpperCase();

      const stockMappings: { [key: string]: string } = {
        'APPLE': 'AAPL',
        'TESLA': 'TSLA',
        'MICROSOFT': 'MSFT',
        'GOOGLE': 'GOOG',
        'NVIDIA': 'NVDA',
      };
      
      if (stockMappings[symbol]) {
        symbol = stockMappings[symbol];
      }

      const { data: stock } = await supabase
        .from('stocks')
        .select('current_price, name')
        .eq('symbol', symbol)
        .single();

      if (stock) {
        const totalAmount = stock.current_price * shares;
        const formattedPrice = formatCurrency(stock.current_price);
        const formattedTotal = formatCurrency(totalAmount);

        // For sell orders, verify the user has enough shares
        if (action === 'sell') {
          const { data: userStock } = await supabase
            .from('stocks')
            .select('shares')
            .eq('symbol', symbol)
            .eq('portfolio_id', (await supabase
              .from('portfolios')
              .select('id')
              .eq('user_id', userId)
              .single()).data?.id)
            .single();

          if (!userStock || userStock.shares < shares) {
            return new Response(
              JSON.stringify({
                reply: `I can't process that sell order. You currently have ${userStock ? userStock.shares : 0} shares of ${symbol} available.`
              }),
              { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
        }

        return new Response(
          JSON.stringify({
            reply: `Ready to ${action} ${shares} shares of ${symbol} at ${formattedPrice} per share (total: ${formattedTotal}). Please enter your PIN to execute this trade.`
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Process the PIN confirmation
    if (message === '1234') {
      return new Response(
        JSON.stringify({
          reply: "Processing your trade now..."
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Handle market news
    if (message.toLowerCase().includes('market news') || 
        message.toLowerCase().includes('news') || 
        message.toLowerCase().includes("what's happening")) {
      const FINNHUB_API_KEY = Deno.env.get('FINNHUB_API_KEY');
      const response = await fetch(`https://finnhub.io/api/v1/news?category=general&token=${FINNHUB_API_KEY}`);
      const news = await response.json();
      
      let newsResponse = "Here's the latest market news:\n\n";
      news.slice(0, 5).forEach((item: any, index: number) => {
        newsResponse += `${index + 1}. ${item.headline}\n${item.summary}\n\n`;
      });
      
      return new Response(
        JSON.stringify({ reply: newsResponse }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Default to OpenAI for other queries
    const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openAIApiKey) throw new Error('OpenAI API key not configured');

    const completion = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You are a helpful investment assistant with real-time access to the user's portfolio data.
            Format all numbers properly:
            - Currency: $1,234.56
            - Percentages: 12.34%
            - Large numbers: 1,234,567
            Keep responses friendly and conversational.`
          },
          { role: 'user', content: message }
        ],
      }),
    });

    const data = await completion.json();
    const reply = data.choices[0].message.content;

    return new Response(
      JSON.stringify({ reply }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
