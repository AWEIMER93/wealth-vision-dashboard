
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

interface StockQuote {
  c: number;  // Current price
  d: number;  // Change
  dp: number; // Percent change
  h: number;  // High price of the day
  l: number;  // Low price of the day
  o: number;  // Open price of the day
  pc: number; // Previous close price
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get Finnhub API key
    const finnhubKey = Deno.env.get('FINNHUB_API_KEY')!;

    // Get all stocks from our database
    const { data: stocks, error: stocksError } = await supabase
      .from('stocks')
      .select('id, symbol');

    if (stocksError) throw stocksError;

    // Update each stock's price
    for (const stock of stocks) {
      const response = await fetch(
        `https://finnhub.io/api/v1/quote?symbol=${stock.symbol}&token=${finnhubKey}`
      );
      
      if (!response.ok) {
        console.error(`Failed to fetch data for ${stock.symbol}`);
        continue;
      }

      const quote: StockQuote = await response.json();

      // Update stock in database
      const { error: updateError } = await supabase
        .from('stocks')
        .update({
          current_price: quote.c,
          price_change: quote.dp,
          market_cap: null, // Finnhub free tier doesn't provide market cap
          volume: null, // Finnhub free tier doesn't provide volume
          updated_at: new Date().toISOString()
        })
        .eq('id', stock.id);

      if (updateError) {
        console.error(`Failed to update ${stock.symbol}:`, updateError);
      }
    }

    return new Response(
      JSON.stringify({ message: 'Stock prices updated successfully' }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
