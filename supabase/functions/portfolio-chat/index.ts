
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Parse trade commands like "buy 10 AAPL" or "sell 5 TSLA"
const parseTradeCommand = (message: string) => {
  const parts = message.toLowerCase().split(' ');
  if (parts.length !== 3) return null;

  const [action, unitsStr, symbol] = parts;
  const units = parseInt(unitsStr);

  if ((action !== 'buy' && action !== 'sell') || isNaN(units)) {
    return null;
  }

  return {
    type: action.toUpperCase(),
    units,
    symbol: symbol.toUpperCase()
  };
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { message } = await req.json();
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('No authorization header');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError) throw userError;

    // Check if message is a trade command
    const tradeCommand = parseTradeCommand(message);
    if (tradeCommand) {
      // Get user's portfolio
      const { data: portfolio, error: portfolioError } = await supabase
        .from('portfolios')
        .select('id')
        .eq('user_id', user?.id)
        .single();
      
      if (portfolioError) throw portfolioError;

      // Get stock details
      const { data: stock, error: stockError } = await supabase
        .from('stocks')
        .select('*')
        .eq('symbol', tradeCommand.symbol)
        .eq('portfolio_id', portfolio.id)
        .single();

      if (stockError && tradeCommand.type === 'SELL') {
        return new Response(
          JSON.stringify({ 
            reply: `You don't own any ${tradeCommand.symbol} shares to sell.`
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (tradeCommand.type === 'SELL' && stock.units < tradeCommand.units) {
        return new Response(
          JSON.stringify({ 
            reply: `You only have ${stock.units} shares of ${tradeCommand.symbol} to sell.`
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Execute trade
      const { data: transaction, error: transactionError } = await supabase
        .from('transactions')
        .insert([{
          portfolio_id: portfolio.id,
          stock_id: stock?.id,
          type: tradeCommand.type,
          units: tradeCommand.units,
          price_per_unit: stock?.current_price || 0,
          total_amount: (stock?.current_price || 0) * tradeCommand.units
        }])
        .select()
        .single();

      if (transactionError) throw transactionError;

      // Update stock units
      const newUnits = tradeCommand.type === 'BUY' 
        ? (stock?.units || 0) + tradeCommand.units
        : stock.units - tradeCommand.units;

      if (stock) {
        await supabase
          .from('stocks')
          .update({ units: newUnits })
          .eq('id', stock.id);
      } else if (tradeCommand.type === 'BUY') {
        await supabase
          .from('stocks')
          .insert([{
            portfolio_id: portfolio.id,
            symbol: tradeCommand.symbol,
            name: tradeCommand.symbol,
            units: tradeCommand.units,
            current_price: 0
          }]);
      }

      return new Response(
        JSON.stringify({ 
          reply: `Successfully ${tradeCommand.type === 'BUY' ? 'bought' : 'sold'} ${tradeCommand.units} shares of ${tradeCommand.symbol}!`
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // If not a trade command, proceed with regular chat
    const { data: portfolio, error: portfolioError } = await supabase
      .from('portfolios')
      .select(`
        *,
        stocks (*)
      `)
      .eq('user_id', user?.id)
      .single();
    
    if (portfolioError) throw portfolioError;

    const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
    
    const portfolioContext = `Portfolio: $${portfolio.total_holding?.toLocaleString() ?? '0'} total value, ${portfolio.active_stocks ?? 0} stocks.
Holdings: ${portfolio.stocks?.map(stock => 
  `${stock.symbol} (${stock.units} @ $${stock.current_price?.toLocaleString() ?? '0'}, ${stock.price_change > 0 ? '+' : ''}${stock.price_change}%)`
).join(', ')}

You can execute trades by saying "buy X SYMBOL" or "sell X SYMBOL" (e.g., "buy 10 AAPL" or "sell 5 TSLA").

Question: ${message}`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
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
            content: `You are a friendly investment assistant. Keep responses brief and conversational. Mention that users can execute trades by typing "buy X SYMBOL" or "sell X SYMBOL".

Guidelines:
- Keep responses under 3 sentences
- Use casual, friendly language
- Reference specific portfolio data naturally
- Remind users they can trade using simple commands
- Be encouraging but honest`
          },
          {
            role: 'user',
            content: portfolioContext
          }
        ],
        temperature: 0.7,
      }),
    });

    const data = await response.json();
    const reply = data.choices[0].message.content;

    return new Response(
      JSON.stringify({ reply }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }
});
