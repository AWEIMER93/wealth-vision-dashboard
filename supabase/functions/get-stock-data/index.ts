
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

    const cleanSymbol = symbol.toUpperCase().trim();
    console.log(`Processing request for symbol: ${cleanSymbol}`);

    // Get quote data
    const quoteUrl = `https://finnhub.io/api/v1/quote?symbol=${cleanSymbol}&token=${FINNHUB_API_KEY}`;
    console.log(`Fetching quote from: ${quoteUrl}`);
    
    const quoteResponse = await fetch(quoteUrl);
    const quoteData = await quoteResponse.json();
    console.log('Raw quote data received:', quoteData);

    // Check for valid price data
    if (quoteData.c === null || quoteData.c === undefined || quoteData.c === 0) {
      console.log(`Invalid price data for symbol: ${cleanSymbol}`, quoteData);
      return new Response(
        JSON.stringify({ 
          error: `Could not get valid price data for ${cleanSymbol}. Please verify the stock symbol.`,
          debug: quoteData 
        }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const stockData = {
      symbol: cleanSymbol,
      name: cleanSymbol,
      price: quoteData.c,
      percentChange: quoteData.pc > 0 ? ((quoteData.c - quoteData.pc) / quoteData.pc) * 100 : 0,
      volume: quoteData.v || 0,
      marketCap: 0
    };

    console.log('Processed stock data:', stockData);
    return new Response(
      JSON.stringify(stockData),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error processing request:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Failed to fetch stock data. Please try again.',
        details: error.message
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
