
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { symbol } = await req.json();

    if (!symbol) {
      return new Response(
        JSON.stringify({ error: 'Stock symbol is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const FINNHUB_API_KEY = Deno.env.get('FINNHUB_API_KEY');
    
    if (!FINNHUB_API_KEY) {
      throw new Error('Finnhub API key not configured');
    }

    // First, search for the symbol to validate it exists
    const searchResponse = await fetch(
      `https://finnhub.io/api/v1/search?q=${symbol}&token=${FINNHUB_API_KEY}`
    );
    const searchData = await searchResponse.json();

    // Find exact symbol match from US exchanges (NYSE, NASDAQ)
    const exactMatch = searchData.result?.find(
      (item: any) => 
        item.symbol === symbol && 
        item.type === 'Common Stock' && 
        ['NYSE', 'NASDAQ'].includes(item.exchange)
    );

    if (!exactMatch) {
      return new Response(
        JSON.stringify({ 
          error: `Could not find stock ${symbol} on NYSE or NASDAQ exchanges.`
        }),
        { 
          status: 404, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Get quote data
    const quoteResponse = await fetch(
      `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${FINNHUB_API_KEY}`
    );
    const quoteData = await quoteResponse.json();

    // Get company profile data
    const profileResponse = await fetch(
      `https://finnhub.io/api/v1/stock/profile2?symbol=${symbol}&token=${FINNHUB_API_KEY}`
    );
    const profileData = await profileResponse.json();

    if (!quoteData.c) {
      throw new Error(`Could not get current price for ${symbol}`);
    }

    const stockData = {
      symbol: symbol,
      name: profileData.name || exactMatch.description || symbol,
      price: quoteData.c,
      percentChange: ((quoteData.c - quoteData.pc) / quoteData.pc) * 100,
      marketCap: profileData.marketCapitalization,
      volume: quoteData.v || 0,
      high: quoteData.h,
      low: quoteData.l,
      open: quoteData.o,
      previousClose: quoteData.pc,
      exchange: exactMatch.exchange
    };

    return new Response(
      JSON.stringify(stockData),
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
