
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
    console.log('Received request for symbol:', symbol);

    if (!symbol) {
      console.error('No symbol provided');
      return new Response(
        JSON.stringify({ error: 'Stock symbol is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const FINNHUB_API_KEY = Deno.env.get('FINNHUB_API_KEY');
    if (!FINNHUB_API_KEY) {
      console.error('Finnhub API key not found');
      throw new Error('Finnhub API key not configured');
    }

    const cleanSymbol = symbol.toUpperCase().trim();
    const url = `https://finnhub.io/api/v1/quote?symbol=${cleanSymbol}&token=${FINNHUB_API_KEY}`;
    console.log('Fetching from Finnhub:', url);

    const response = await fetch(url);
    if (!response.ok) {
      console.error('Finnhub API error:', response.status, await response.text());
      throw new Error('Failed to fetch from Finnhub API');
    }

    const data = await response.json();
    console.log('Finnhub response:', data);

    if (data.c === null || data.c === undefined) {
      console.error('No price data available for symbol:', cleanSymbol);
      return new Response(
        JSON.stringify({ error: `No price data available for ${cleanSymbol}` }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const stockData = {
      symbol: cleanSymbol,
      name: cleanSymbol,
      price: data.c,
      percentChange: ((data.c - data.pc) / data.pc) * 100,
      volume: data.v || 0,
      marketCap: 0
    };

    console.log('Returning stock data:', stockData);
    return new Response(
      JSON.stringify(stockData),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Function error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
