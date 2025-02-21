
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

    // Ensure symbol is uppercase and clean any whitespace
    const cleanSymbol = symbol.toUpperCase().trim();
    
    // First fetch the quote data
    const quoteUrl = `https://finnhub.io/api/v1/quote?symbol=${cleanSymbol}&token=${FINNHUB_API_KEY}`;
    const quoteResponse = await fetch(quoteUrl);
    if (!quoteResponse.ok) {
      console.error('Finnhub quote API error:', quoteResponse.status, await quoteResponse.text());
      throw new Error('Failed to fetch quote from Finnhub API');
    }

    const quoteData = await quoteResponse.json();
    console.log('Finnhub quote response:', quoteData);

    // Then fetch company data
    const companyUrl = `https://finnhub.io/api/v1/stock/profile2?symbol=${cleanSymbol}&token=${FINNHUB_API_KEY}`;
    const companyResponse = await fetch(companyUrl);
    if (!companyResponse.ok) {
      console.error('Finnhub company API error:', companyResponse.status, await companyResponse.text());
      throw new Error('Failed to fetch company data from Finnhub API');
    }

    const companyData = await companyResponse.json();
    console.log('Finnhub company response:', companyData);

    // Make sure we have a valid price
    if (quoteData.c === null || quoteData.c === undefined || quoteData.c === 0) {
      console.error('No valid price data available for symbol:', cleanSymbol);
      return new Response(
        JSON.stringify({ error: `No valid price data available for ${cleanSymbol}` }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if we got valid company data
    if (!companyData || Object.keys(companyData).length === 0) {
      console.error('No company data available for symbol:', cleanSymbol);
      return new Response(
        JSON.stringify({ error: `Invalid stock symbol: ${cleanSymbol}` }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const stockData = {
      symbol: cleanSymbol,
      companyName: companyData.name,
      description: companyData.description,
      price: quoteData.c,
      percentChange: ((quoteData.c - quoteData.pc) / quoteData.pc) * 100,
      volume: quoteData.v || 0,
      marketCap: companyData.marketCapitalization || 0,
      logo: companyData.logo || null
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
