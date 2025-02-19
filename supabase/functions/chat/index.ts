import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const createSupabaseClient = () => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  return createClient(supabaseUrl, supabaseKey);
};

const processTradeRequest = (message: string) => {
  const buyMatch = message.match(/buy\s+(\d+)\s+shares?\s+of\s+([A-Za-z]+)/i);
  const sellMatch = message.match(/sell\s+(\d+)\s+shares?\s+of\s+([A-Za-z]+)/i);
  
  if (buyMatch || sellMatch) {
    const match = buyMatch || sellMatch;
    const action = buyMatch ? 'buy' : 'sell';
    const shares = parseInt(match![1]);
    let symbol = match![2].toUpperCase();
    
    const stockMappings: { [key: string]: string } = {
      'APPLE': 'AAPL',
      'TESLA': 'TSLA',
      'MICROSOFT': 'MSFT',
      'GOOGLE': 'GOOG',
      'NVIDIA': 'NVDA',
    };
    
    if (stockMappings[symbol]) {
      symbol = stockMappings[symbol];
    }
    
    return { type: 'trade', action, shares, symbol };
  }
  
  return null;
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openAIApiKey) {
      throw new Error('OpenAI API key not configured');
    }

    const { message, userId } = await req.json();
    if (!message) {
      throw new Error('Message is required');
    }
    if (!userId) {
      throw new Error('User ID is required');
    }

    console.log('Processing message:', message);

    // Process trade request
    const tradeRequest = processTradeRequest(message);
    let additionalContext = '';
    let skipAI = false;
    
    if (tradeRequest) {
      const supabase = createSupabaseClient();
      const { data: stock } = await supabase
        .from('stocks')
        .select('current_price')
        .eq('symbol', tradeRequest.symbol)
        .single();
      
      if (stock) {
        const totalAmount = stock.current_price * tradeRequest.shares;
        additionalContext = `I'll help you ${tradeRequest.action} ${tradeRequest.shares} shares of ${tradeRequest.symbol}. The current price is $${stock.current_price.toFixed(2)} per share, for a total of $${totalAmount.toFixed(2)}. To confirm this trade, please enter PIN: 1234`;
        skipAI = true;
      }
    }

    let reply = '';
    
    if (!skipAI) {
      // Get user's portfolio data
      const supabase = createSupabaseClient();
      const { data: portfolio, error: portfolioError } = await supabase
        .from('portfolios')
        .select(`
          *,
          stocks (*)
        `)
        .eq('user_id', userId)
        .single();

      if (portfolioError) {
        console.error('Portfolio error:', portfolioError);
        throw new Error('Failed to fetch portfolio data');
      }

      // Call OpenAI API with context
      const completion = await fetch('https://api.openai.com/v1/chat/completions', {
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
              content: `You are a friendly and helpful portfolio management assistant named Alex. You help users manage their investments and execute trades in a conversational manner.
              
              Current portfolio context:
              - Total Holdings: $${portfolio.total_holding?.toLocaleString() ?? '0'}
              - Total Profit: ${portfolio.total_profit?.toFixed(2) ?? '0'}%
              - Active Stocks: ${portfolio.active_stocks ?? '0'}
              
              Style guide:
              - Be conversational and friendly, use "I" and refer to the user directly
              - Keep responses concise but natural
              - Format numbers with commas and 2 decimal places
              - For trades, clearly confirm the action and include all relevant details
              - Use everyday language, avoid jargon unless necessary`,
            },
            { role: 'user', content: message },
          ],
        }),
      });

      if (!completion.ok) {
        throw new Error('Failed to get response from OpenAI');
      }

      const data = await completion.json();
      reply = data.choices[0].message.content;
    }

    // Use trade context or AI response
    reply = skipAI ? additionalContext : reply;

    return new Response(
      JSON.stringify({ reply }),
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
