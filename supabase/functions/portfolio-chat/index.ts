
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PIN = "1234"; // Mock PIN for all users

// Parse trade commands in natural language
const parseTradeCommand = (message: string) => {
  const lowerMessage = message.toLowerCase();
  
  // Match patterns like "buy 5 AAPL" or "buy 5 shares of apple"
  const buyMatch = lowerMessage.match(/buy\s+(\d+)\s+(shares?\s+of\s+)?([a-zA-Z]+)/i);
  const sellMatch = lowerMessage.match(/sell\s+(\d+)\s+(shares?\s+of\s+)?([a-zA-Z]+)/i);
  
  if (!buyMatch && !sellMatch) return null;
  
  const match = buyMatch || sellMatch;
  const type = buyMatch ? 'BUY' : 'SELL';
  const units = parseInt(match![1]);
  let symbol = match![3].toUpperCase();
  
  // Map common company names to symbols
  const symbolMap: Record<string, string> = {
    'apple': 'AAPL',
    'tesla': 'TSLA',
    'microsoft': 'MSFT',
    'google': 'GOOG',
    'amazon': 'AMZN',
    'meta': 'META',
    'netflix': 'NFLX',
  };

  symbol = symbolMap[symbol.toLowerCase()] || symbol;

  return { type, units, symbol };
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { message, pin } = await req.json();
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

      const currentPrice = stock?.current_price || 100; // Mock price if stock doesn't exist
      const totalAmount = currentPrice * tradeCommand.units;

      // If PIN is not provided, return trade confirmation details
      if (!pin) {
        return new Response(
          JSON.stringify({ 
            reply: `Would you like to ${tradeCommand.type.toLowerCase()} ${tradeCommand.units} shares of ${tradeCommand.symbol} at $${currentPrice} per share?\nTotal amount: $${totalAmount}\n\nPlease confirm by entering PIN code (1234 for testing).`,
            awaitingPin: true,
            tradeCommand
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Verify PIN
      if (pin !== PIN) {
        return new Response(
          JSON.stringify({ 
            reply: "Incorrect PIN. Please try again.",
            error: "Invalid PIN"
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

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
          price_per_unit: currentPrice,
          total_amount: totalAmount
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
            current_price: currentPrice
          }]);
      }

      return new Response(
        JSON.stringify({ 
          reply: `Successfully ${tradeCommand.type.toLowerCase()}ed ${tradeCommand.units} shares of ${tradeCommand.symbol} at $${currentPrice} per share.\nTotal amount: $${totalAmount}`
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

Trading Examples:
- "Buy 5 shares of Apple" or "Buy 5 AAPL"
- "Sell 3 shares of Tesla" or "Sell 3 TSLA"
You'll be asked to confirm the trade and enter PIN code (1234).

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
            content: `You are a friendly investment assistant. Keep responses brief and conversational. Show users how to execute trades using natural language.

Guidelines:
- Keep responses under 3 sentences
- Use casual, friendly language
- Reference specific portfolio data naturally
- Show trading examples using both company names and symbols
- Mention PIN code requirement (1234)`
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
