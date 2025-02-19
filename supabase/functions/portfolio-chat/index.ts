
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TradeCommand {
  type: 'BUY' | 'SELL';
  units: number;
  symbol: string;
}

function parseTradeCommand(message: string): TradeCommand | null {
  const buyMatch = message.match(/buy (\d+) shares? of ([A-Z]+)/i);
  const sellMatch = message.match(/sell (\d+) shares? of ([A-Z]+)/i);
  
  const match = buyMatch || sellMatch;
  if (!match) return null;
  
  return {
    type: buyMatch ? 'BUY' : 'SELL',
    units: parseInt(match[1]),
    symbol: match[2].toUpperCase(),
  };
}

serve(async (req) => {
  // Handle CORS preflight request
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Check if request body exists and is not empty
    const bodyText = await req.text();
    if (!bodyText) {
      throw new Error('Request body is empty');
    }

    // Parse the body text into JSON
    let body;
    try {
      body = JSON.parse(bodyText);
    } catch (error) {
      console.error('JSON parse error:', error);
      throw new Error('Invalid JSON in request body');
    }

    const { message, pin, tradeCommand: pendingTrade } = body;

    if (!message) {
      throw new Error('Message is required');
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: { headers: { Authorization: authHeader } },
      }
    );

    const {
      data: { user },
      error: userError,
    } = await supabaseClient.auth.getUser();

    if (userError || !user) {
      throw new Error('Invalid user');
    }

    // Handle trade commands and PIN verification
    if (message.toLowerCase().includes('sell') || message.toLowerCase().includes('buy')) {
      const tradeCommand = parseTradeCommand(message);
      if (tradeCommand) {
        // Get current stock price and holdings
        const { data: portfolio } = await supabaseClient
          .from('portfolios')
          .select(`
            id,
            stocks (
              id,
              symbol,
              units,
              current_price
            )
          `)
          .eq('user_id', user.id)
          .single();

        const stock = portfolio?.stocks?.find(s => s.symbol === tradeCommand.symbol);
        const currentPrice = stock?.current_price || 100; // Default price if not found
        const totalAmount = currentPrice * tradeCommand.units;

        // For sell orders, verify sufficient holdings
        if (tradeCommand.type === 'SELL') {
          if (!stock || stock.units < tradeCommand.units) {
            return new Response(
              JSON.stringify({ 
                reply: `You don't have enough ${tradeCommand.symbol} shares to sell. Current holdings: ${stock?.units || 0} shares.`
              }),
              { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
        }

        // If PIN is provided, execute the trade
        if (pin && pendingTrade) {
          // Verify PIN (you should implement proper PIN verification)
          if (pin !== '1234') { // Replace with actual PIN verification
            return new Response(
              JSON.stringify({ reply: 'Invalid PIN. Trade cancelled.' }),
              { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }

          // Execute trade
          if (pendingTrade.type === 'SELL') {
            if (!stock || stock.units < pendingTrade.units) {
              return new Response(
                JSON.stringify({ reply: 'Insufficient shares for this trade.' }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
              );
            }

            // Update stock holdings
            await supabaseClient
              .from('stocks')
              .update({ units: stock.units - pendingTrade.units })
              .eq('id', stock.id);
          } else {
            if (stock) {
              // Update existing stock
              await supabaseClient
                .from('stocks')
                .update({ units: stock.units + pendingTrade.units })
                .eq('id', stock.id);
            } else {
              // Add new stock
              await supabaseClient
                .from('stocks')
                .insert({
                  portfolio_id: portfolio.id,
                  symbol: pendingTrade.symbol,
                  name: pendingTrade.symbol,
                  units: pendingTrade.units,
                  current_price: currentPrice,
                });
            }
          }

          // Record transaction
          await supabaseClient
            .from('transactions')
            .insert({
              portfolio_id: portfolio.id,
              stock_id: stock?.id,
              type: pendingTrade.type,
              units: pendingTrade.units,
              price_per_unit: currentPrice,
              total_amount: totalAmount,
              status: 'completed',
            });

          return new Response(
            JSON.stringify({
              reply: `Trade executed successfully:\n` +
                    `${pendingTrade.type === 'BUY' ? 'Bought' : 'Sold'} ${pendingTrade.units} shares of ${pendingTrade.symbol}\n` +
                    `Price: $${currentPrice} per share\n` +
                    `Total: $${totalAmount}`
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Request PIN verification with trade details
        return new Response(
          JSON.stringify({
            reply: `Please confirm your ${tradeCommand.type.toLowerCase()} order:\n` +
                  `- ${tradeCommand.units} shares of ${tradeCommand.symbol}\n` +
                  `- Price: $${currentPrice} per share\n` +
                  `- Total: $${totalAmount}\n\n` +
                  `Enter your PIN to confirm this trade.`,
            awaitingPin: true,
            tradeCommand
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Handle regular chat messages
    const completion = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are a helpful portfolio management assistant. Help users manage their stock portfolio and execute trades.',
          },
          { role: 'user', content: message },
        ],
      }),
    });

    const json = await completion.json();
    const reply = json.choices[0].message.content;

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
