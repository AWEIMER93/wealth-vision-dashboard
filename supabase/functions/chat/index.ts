import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.21.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const FINNHUB_API_KEY = Deno.env.get('FINNHUB_API_KEY');

// Helper functions for formatting
const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount);
};

const formatPercent = (value: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'percent',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value / 100);
};

// Sector to symbol mappings
const sectorSymbols: { [key: string]: string[] } = {
  'technology': ['AAPL', 'MSFT', 'GOOG', 'NVDA', 'AMD'],
  'electric vehicles': ['TSLA', 'RIVN', 'LCID', 'NIO'],
  'finance': ['JPM', 'BAC', 'GS', 'MS', 'V'],
  'healthcare': ['JNJ', 'PFE', 'UNH', 'ABBV', 'MRK'],
  'retail': ['AMZN', 'WMT', 'TGT', 'COST', 'HD'],
  'energy': ['XOM', 'CVX', 'COP', 'SLB', 'EOG'],
  'telecommunications': ['T', 'VZ', 'TMUS', 'CMCSA'],
  'aerospace': ['BA', 'LMT', 'RTX', 'NOC', 'GD']
};

// Risk levels to P/E ratio ranges
const riskLevels: { [key: string]: { maxPE: number, description: string } } = {
  'conservative': { maxPE: 15, description: 'stable, established companies with consistent dividends' },
  'moderate': { maxPE: 25, description: 'growing companies with reasonable valuations' },
  'aggressive': { maxPE: 50, description: 'high-growth companies with higher volatility' },
  'speculative': { maxPE: 100, description: 'emerging companies with high potential but significant risk' }
};

async function getStockRecommendations(sector: string, riskLevel: string) {
  const symbols = sectorSymbols[sector.toLowerCase()] || [];
  const stockData = [];

  for (const symbol of symbols) {
    try {
      // Get company profile
      const profileResponse = await fetch(
        `https://finnhub.io/api/v1/stock/profile2?symbol=${symbol}&token=${FINNHUB_API_KEY}`
      );
      const profile = await profileResponse.json();

      // Get quote
      const quoteResponse = await fetch(
        `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${FINNHUB_API_KEY}`
      );
      const quote = await quoteResponse.json();

      // Get basic financials (including P/E ratio)
      const metricsResponse = await fetch(
        `https://finnhub.io/api/v1/stock/metric?symbol=${symbol}&metric=all&token=${FINNHUB_API_KEY}`
      );
      const metrics = await metricsResponse.json();

      if (profile && quote && metrics) {
        stockData.push({
          symbol,
          name: profile.name,
          price: quote.c,
          change: quote.dp,
          pe: metrics.metric?.peNormalizedAnnual || 0,
          marketCap: profile.marketCapitalization,
        });
      }
    } catch (error) {
      console.error(`Error fetching data for ${symbol}:`, error);
    }
  }

  // Filter based on risk level
  const { maxPE } = riskLevels[riskLevel.toLowerCase()] || riskLevels.moderate;
  return stockData
    .filter(stock => stock.pe > 0 && stock.pe <= maxPE)
    .sort((a, b) => b.change - a.change)
    .slice(0, 5);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { message, userId } = await req.json();
    if (!message || !userId) throw new Error('Message and userId are required');

    // Handle sector and risk preference questions
    if (message.toLowerCase().includes('invest') || message.toLowerCase().includes('recommend')) {
      return new Response(
        JSON.stringify({
          reply: "I'd be happy to help you find some investment opportunities. What sector interests you? We can look at: Technology, Electric Vehicles, Finance, Healthcare, Retail, Energy, Telecommunications, or Aerospace."
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if message contains a sector
    const sectorMatch = Object.keys(sectorSymbols).find(sector => 
      message.toLowerCase().includes(sector.toLowerCase())
    );

    if (sectorMatch && !message.toLowerCase().includes('risk')) {
      return new Response(
        JSON.stringify({
          reply: `Great choice! The ${sectorMatch} sector has many opportunities. What's your risk tolerance? We can look at:\n\n` +
                `1. Conservative: ${riskLevels.conservative.description}\n` +
                `2. Moderate: ${riskLevels.moderate.description}\n` +
                `3. Aggressive: ${riskLevels.aggressive.description}\n` +
                `4. Speculative: ${riskLevels.speculative.description}`
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // If we have both sector and risk level, provide recommendations
    const riskMatch = Object.keys(riskLevels).find(risk =>
      message.toLowerCase().includes(risk.toLowerCase())
    );

    if (sectorMatch && riskMatch) {
      const recommendations = await getStockRecommendations(sectorMatch, riskMatch);
      
      if (recommendations.length === 0) {
        return new Response(
          JSON.stringify({
            reply: `I couldn't find any ${riskMatch} stocks in the ${sectorMatch} sector that match your criteria right now. Would you like to try a different sector or risk level?`
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const recommendationText = `Here are the top performing ${riskMatch} stocks in the ${sectorMatch} sector:\n\n` +
        recommendations.map(stock => 
          `${stock.symbol} (${stock.name}):\n` +
          `Price: ${formatCurrency(stock.price)}\n` +
          `Daily Change: ${formatPercent(stock.change)}\n` +
          `Market Cap: ${formatCurrency(stock.marketCap * 1000000)}\n`
        ).join('\n') +
        `\nTo invest in any of these stocks, just tell me how many shares you'd like to buy. For example: "buy 10 shares of AAPL"`;

      return new Response(
        JSON.stringify({ reply: recommendationText }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    const { data: user } = await supabaseClient.auth.getUser();

    if (!user) {
        return new Response(
            JSON.stringify({ reply: "You must be logged in to use this service." }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

    // Simple portfolio analysis
    if (message.toLowerCase().includes('portfolio')) {
        const { data: portfolio, error } = await supabaseClient
            .from('portfolios')
            .select(`*, stocks(*)`)
            .eq('user_id', userId)
            .single();

        if (error) {
            console.error('Error fetching portfolio:', error);
            return new Response(
                JSON.stringify({ reply: "Sorry, I couldn't retrieve your portfolio." }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        if (!portfolio || !portfolio.stocks || portfolio.stocks.length === 0) {
            return new Response(
                JSON.stringify({ reply: "Your portfolio is currently empty." }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        const totalHoldings = portfolio.stocks.reduce((acc, stock) => acc + (stock.current_price * stock.shares), 0);
        const stockList = portfolio.stocks.map(stock => `${stock.symbol} (${stock.shares} shares)`).join(', ');

        return new Response(
            JSON.stringify({ reply: `Your portfolio includes: ${stockList}. Total value: ${formatCurrency(totalHoldings)}` }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

    // Trade execution (example: "buy 5 shares of AAPL")
    const tradeMatch = message.match(/(buy|sell)\s+(\d+)\s+shares?\s+of\s+([A-Za-z]+)/i);
    if (tradeMatch) {
        const type = tradeMatch[1].toUpperCase();
        const shares = parseInt(tradeMatch[2]);
        const symbol = tradeMatch[3].toUpperCase();

        try {
            // Basic validation - ensure the user has enough funds or shares
            // In a real application, you'd also check if the stock symbol is valid and the market is open
            if (isNaN(shares) || shares <= 0) {
                throw new Error('Invalid number of shares.');
            }

            // Placeholder for trade execution logic
            const tradeConfirmation = `Executing ${type} order for ${shares} shares of ${symbol}. This is a simulation.`;
            return new Response(
                JSON.stringify({ reply: tradeConfirmation }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        } catch (error) {
            console.error('Trade error:', error);
            return new Response(
                JSON.stringify({ reply: `Failed to execute trade: ${error.message}` }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }
    }

    // OpenAI fallback
    const openAIResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
        },
        body: JSON.stringify({
            model: 'gpt-3.5-turbo',
            messages: [{ role: 'user', content: message }],
        }),
    });

    const openAIData = await openAIResponse.json();
    const reply = openAIData.choices[0].message.content;

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
