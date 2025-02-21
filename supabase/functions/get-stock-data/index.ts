
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

    // Get quote data
    console.log(`Fetching quote for symbol: ${symbol}`);
    const quoteResponse = await fetch(
      `https://finnhub.io/api/v1/quote?symbol=${symbol.toUpperCase()}&token=${FINNHUB_API_KEY}`
    );
    const quoteData = await quoteResponse.json();
    console.log('Quote data received:', quoteData);

    // If we can't get a price, let the user know
    if (!quoteData.c) {
      console.log(`No price available for symbol: ${symbol}`);
      return new Response(
        JSON.stringify({ error: `No price available for ${symbol}` }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Return just the essential data needed for trading
    const stockData = {
      symbol: symbol.toUpperCase(),
      name: symbol.toUpperCase(), // Just use the symbol as name for simplicity
      price: quoteData.c,
      percentChange: ((quoteData.c - quoteData.pc) / quoteData.pc) * 100,
      volume: quoteData.v || 0,
      marketCap: 0 // Set to 0 as it's not crucial for trading
    };

    console.log('Returning stock data:', stockData);
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
