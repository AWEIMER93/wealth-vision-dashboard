import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PIN = "1234";

const parseTradeCommand = (message) => {
  const buyRegex = /buy (\d+) (.+)/i;
  const sellRegex = /sell (\d+) (.+)/i;
  const buyMatch = message.match(buyRegex);
  const sellMatch = message.match(sellRegex);

  if (buyMatch) {
    return {
      type: 'BUY',
      units: parseInt(buyMatch[1], 10),
      symbol: buyMatch[2].toUpperCase(),
    };
  }

  if (sellMatch) {
    return {
      type: 'SELL',
      units: parseInt(sellMatch[1], 10),
      symbol: sellMatch[2].toUpperCase(),
    };
  }

  return null;
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
    if (!user?.id) throw new Error('User not authenticated');

    // Handle PIN verification and pending trade
    if (pin && pendingTrade) {
      console.log('Processing trade with PIN:', { pin, pendingTrade, userId: user.id });
      
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

      // Get or create user's portfolio
      let portfolio;
      const { data: existingPortfolio, error: portfolioError } = await supabase
        .from('portfolios')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (portfolioError) throw portfolioError;

      if (!existingPortfolio) {
        const { data: newPortfolio, error: createError } = await supabase
          .from('portfolios')
          .insert([{ user_id: user.id, total_holding: 0, active_stocks: 0 }])
          .select()
          .single();
        
        if (createError) throw createError;
        portfolio = newPortfolio;
      } else {
        portfolio = existingPortfolio;
      }
      
      console.log('Using portfolio:', portfolio);

      // Get stock details
      const { data: stock, error: stockError } = await supabase
        .from('stocks')
        .select('*')
        .eq('symbol', pendingTrade.symbol)
        .eq('portfolio_id', portfolio.id)
        .maybeSingle();

      console.log('Current stock state:', stock);

      const currentPrice = stock?.current_price || 100;
      const totalAmount = currentPrice * pendingTrade.units;

      if (pendingTrade.type === 'SELL' && (!stock || stock.units < pendingTrade.units)) {
        return new Response(
          JSON.stringify({ 
            reply: `You don't have enough ${pendingTrade.symbol} shares to sell.`
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Start a transaction block
      // First create the transaction record
      console.log('Creating transaction record...');
      const { data: transaction, error: transactionError } = await supabase
        .from('transactions')
        .insert([{
          portfolio_id: portfolio.id,
          stock_id: stock?.id,
          type: pendingTrade.type,
          units: pendingTrade.units,
          price_per_unit: currentPrice,
          total_amount: totalAmount,
          status: 'COMPLETED'
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
        console.log('Updating existing stock...');
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
        
        console.log('Stock updated, new units:', newUnits);
      } else if (pendingTrade.type === 'BUY') {
        console.log('Creating new stock...');
        const { error: insertError } = await supabase
          .from('stocks')
          .insert([{
            portfolio_id: portfolio.id,
            symbol: pendingTrade.symbol,
            name: pendingTrade.symbol,
            units: pendingTrade.units,
            current_price: currentPrice,
            price_change: 0,
            market_cap: 0,
            volume: 0,
            updated_at: new Date().toISOString()
          }]);

        if (insertError) {
          console.error('Stock insert error:', insertError);
          throw insertError;
        }
      }

      // Recalculate portfolio totals
      console.log('Updating portfolio totals...');
      const { data: updatedStocks } = await supabase
        .from('stocks')
        .select('*')
        .eq('portfolio_id', portfolio.id);

      console.log('Updated stocks:', updatedStocks);

      const totalHolding = updatedStocks?.reduce((sum, s) => 
        sum + (s.current_price || 0) * s.units, 0) || 0;

      const { error: portfolioUpdateError } = await supabase
        .from('portfolios')
        .update({
          total_holding: totalHolding,
          active_stocks: updatedStocks?.length || 0,
          updated_at: new Date().toISOString()
        })
        .eq('id', portfolio.id);

      if (portfolioUpdateError) {
        console.error('Portfolio update error:', portfolioUpdateError);
        throw portfolioUpdateError;
      }

      console.log('Portfolio updated with new totals:', { totalHolding, activeStocks: updatedStocks?.length });

      return new Response(
        JSON.stringify({ 
          reply: `Trade executed successfully: ${pendingTrade.type.toLowerCase()}ed ${pendingTrade.units} shares of ${pendingTrade.symbol} at $${currentPrice} per share.\nTotal amount: $${totalAmount}`
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Regular chat functionality
    const reply = `You said: ${message}`;
    return new Response(
      JSON.stringify({ reply }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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
