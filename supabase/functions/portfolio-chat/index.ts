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
    const { message, pin, tradeCommand: pendingTrade } = await req.json();
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('No authorization header');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError) throw userError;

    // Handle PIN verification and pending trade
    if (pin && pendingTrade) {
      console.log('Processing trade with PIN:', { pin, pendingTrade });
      
      if (pin !== PIN) {
        return new Response(
          JSON.stringify({ 
            reply: "Incorrect PIN. Please try again.",
            awaitingPin: true,
            tradeCommand: pendingTrade
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Get user's portfolio
      const { data: portfolio, error: portfolioError } = await supabase
        .from('portfolios')
        .select('id')
        .eq('user_id', user?.id)
        .single();
      
      if (portfolioError) throw portfolioError;
      
      console.log('Found portfolio:', portfolio);

      // Get stock details
      const { data: stock, error: stockError } = await supabase
        .from('stocks')
        .select('*')
        .eq('symbol', pendingTrade.symbol)
        .eq('portfolio_id', portfolio.id)
        .maybeSingle();

      const currentPrice = stock?.current_price || 100; // Mock price if stock doesn't exist
      const totalAmount = currentPrice * pendingTrade.units;

      if (pendingTrade.type === 'SELL' && (!stock || stock.units < pendingTrade.units)) {
        return new Response(
          JSON.stringify({ 
            reply: `You don't have enough ${pendingTrade.symbol} shares to sell.`
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Execute trade
      console.log('Executing trade transaction');
      const { data: transaction, error: transactionError } = await supabase
        .from('transactions')
        .insert([{
          portfolio_id: portfolio.id,
          stock_id: stock?.id,
          type: pendingTrade.type,
          units: pendingTrade.units,
          price_per_unit: currentPrice,
          total_amount: totalAmount
        }])
        .select()
        .single();

      if (transactionError) {
        console.error('Transaction error:', transactionError);
        throw transactionError;
      }
      
      console.log('Transaction created:', transaction);

      // Update or create stock
      if (stock) {
        console.log('Updating existing stock');
        const newUnits = pendingTrade.type === 'BUY' 
          ? stock.units + pendingTrade.units
          : stock.units - pendingTrade.units;

        const { error: updateError } = await supabase
          .from('stocks')
          .update({ 
            units: newUnits,
            updated_at: new Date().toISOString()
          })
          .eq('id', stock.id);

        if (updateError) {
          console.error('Stock update error:', updateError);
          throw updateError;
        }
      } else if (pendingTrade.type === 'BUY') {
        console.log('Creating new stock');
        const { error: insertError } = await supabase
          .from('stocks')
          .insert([{
            portfolio_id: portfolio.id,
            symbol: pendingTrade.symbol,
            name: pendingTrade.symbol,
            units: pendingTrade.units,
            current_price: currentPrice,
            updated_at: new Date().toISOString()
          }]);

        if (insertError) {
          console.error('Stock insert error:', insertError);
          throw insertError;
        }
      }

      // Update portfolio totals
      console.log('Updating portfolio totals');
      const { data: updatedStocks } = await supabase
        .from('stocks')
        .select('*')
        .eq('portfolio_id', portfolio.id);

      const totalHolding = updatedStocks?.reduce((sum, stock) => 
        sum + (stock.current_price || 0) * stock.units, 0) || 0;

      const { error: portfolioUpdateError } = await supabase
        .from('portfolios')
        .update({
          total_holding: totalHolding,
          active_stocks: updatedStocks?.length || 0,
        })
        .eq('id', portfolio.id);

      if (portfolioUpdateError) {
        console.error('Portfolio update error:', portfolioUpdateError);
        throw portfolioUpdateError;
      }

      return new Response(
        JSON.stringify({ 
          reply: `Trade executed successfully: ${pendingTrade.type.toLowerCase()}ed ${pendingTrade.units} shares of ${pendingTrade.symbol} at $${currentPrice} per share.\nTotal amount: $${totalAmount}`
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

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

      return new Response(
        JSON.stringify({ 
          reply: `Would you like to ${tradeCommand.type.toLowerCase()} ${tradeCommand.units} shares of ${tradeCommand.symbol} at $${currentPrice} per share?\nTotal amount: $${totalAmount}\n\nPlease enter your PIN to confirm this trade.`,
          awaitingPin: true,
          tradeCommand
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Regular chat functionality
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

You can execute trades using natural language, for example:
- "Buy 5 shares of Apple"
- "Sell 3 shares of Tesla"

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
            content: `You are a friendly investment assistant for ${user.email?.split('@')[0]}. Keep responses brief and conversational.

Guidelines:
- Use first name in greetings
- Keep responses under 3 sentences
- Use casual, friendly language
- Reference specific portfolio data naturally
- Mention trade execution using natural language`
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
    console.error('Error in portfolio-chat:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }
});
