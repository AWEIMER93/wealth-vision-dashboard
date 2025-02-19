
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
  console.log(`Getting recommendations for sector: ${sector}, risk level: ${riskLevel}`);
  
  if (!FINNHUB_API_KEY) {
    console.error('Finnhub API key is not set');
    throw new Error('Finnhub API key is not configured');
  }

  const symbols = sectorSymbols[sector.toLowerCase()] || [];
  console.log(`Found symbols for sector: ${symbols.join(', ')}`);
  
  const stockData = [];

  for (const symbol of symbols) {
    try {
      console.log(`Fetching data for ${symbol}...`);
      
      // Get company profile
      const profileResponse = await fetch(
        `https://finnhub.io/api/v1/stock/profile2?symbol=${symbol}&token=${FINNHUB_API_KEY}`
      );
      const profile = await profileResponse.json();
      console.log(`Profile data for ${symbol}:`, profile);

      // Get quote
      const quoteResponse = await fetch(
        `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${FINNHUB_API_KEY}`
      );
      const quote = await quoteResponse.json();
      console.log(`Quote data for ${symbol}:`, quote);

      // Get basic financials (including P/E ratio)
      const metricsResponse = await fetch(
        `https://finnhub.io/api/v1/stock/metric?symbol=${symbol}&metric=all&token=${FINNHUB_API_KEY}`
      );
      const metrics = await metricsResponse.json();
      console.log(`Metrics data for ${symbol}:`, metrics);

      if (profile && quote && metrics?.metric) {
        stockData.push({
          symbol,
          name: profile.name || symbol,
          price: quote.c || 0,
          change: quote.dp || 0,
          pe: metrics.metric?.peNormalizedAnnual || metrics.metric?.pe || 0,
          marketCap: profile.marketCapitalization || 0,
        });
        console.log(`Added stock data for ${symbol}:`, stockData[stockData.length - 1]);
      } else {
        console.log(`Skipping ${symbol} due to incomplete data`);
      }
    } catch (error) {
      console.error(`Error fetching data for ${symbol}:`, error);
    }
  }

  console.log(`Total stocks collected: ${stockData.length}`);
  
  // Filter based on risk level
  const { maxPE } = riskLevels[riskLevel.toLowerCase()] || riskLevels.moderate;
  console.log(`Filtering stocks with maxPE: ${maxPE}`);
  
  const filteredStocks = stockData
    .filter(stock => stock.pe > 0 && stock.pe <= maxPE)
    .sort((a, b) => b.change - a.change)
    .slice(0, 5);

  console.log(`Filtered and sorted stocks:`, filteredStocks);
  return filteredStocks;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { message, userId } = await req.json();
    console.log('Received message:', message);
    
    if (!message || !userId) throw new Error('Message and userId are required');

    // Handle sector and risk preference questions
    if (message.toLowerCase().includes('invest') || message.toLowerCase().includes('recommend')) {
      console.log('Handling investment recommendation request');
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
    
    console.log('Sector match:', sectorMatch);

    if (sectorMatch && !message.toLowerCase().includes('risk')) {
      console.log('Handling sector selection, asking for risk preference');
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
    
    console.log('Risk match:', riskMatch);

    if (sectorMatch && riskMatch) {
      console.log('Getting stock recommendations for:', sectorMatch, riskMatch);
      const recommendations = await getStockRecommendations(sectorMatch, riskMatch);
      
      console.log('Received recommendations:', recommendations);
      
      if (!recommendations || recommendations.length === 0) {
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

      console.log('Sending recommendation response:', recommendationText);
      
      return new Response(
        JSON.stringify({ reply: recommendationText }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Handle portfolio analysis
    if (message.toLowerCase().includes('portfolio')) {
      console.log('Handling portfolio analysis request');
      const supabaseClient = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_ANON_KEY') ?? ''
      );

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

      const totalHoldings = portfolio.stocks.reduce((acc, stock) => 
        acc + (stock.current_price * stock.shares), 0);
      const stockList = portfolio.stocks
        .map(stock => `${stock.symbol} (${stock.shares} shares at ${formatCurrency(stock.current_price)} per share)`)
        .join('\n');

      return new Response(
        JSON.stringify({ 
          reply: `Your Portfolio Summary:\n\nTotal Value: ${formatCurrency(totalHoldings)}\n\nHoldings:\n${stockList}` 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Default response
    return new Response(
      JSON.stringify({ 
        reply: "I'm here to help with your investment needs. You can ask me about your portfolio, get stock recommendations, or execute trades." 
      }),
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
