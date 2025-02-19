import { serve } from 'std/server';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface TradeRequest {
  action: 'buy' | 'sell';
  shares: number;
  symbol: string;
}

function processTradeRequest(message: string): TradeRequest | null {
  const buyMatch = message.match(/buy\s+(\d+)\s+shares?\s+of\s+([A-Za-z]+)/i);
  const sellMatch = message.match(/sell\s+(\d+)\s+shares?\s+of\s+([A-Za-z]+)/i);

  if (buyMatch) {
    return {
      action: 'buy',
      shares: parseInt(buyMatch[1]),
      symbol: buyMatch[2].toUpperCase(),
    };
  }

  if (sellMatch) {
    return {
      action: 'sell',
      shares: parseInt(sellMatch[1]),
      symbol: sellMatch[2].toUpperCase(),
    };
  }

  return null;
}

const createSupabaseClient = () => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase URL and Key are required');
  }
  return createClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: false,
    },
  });
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
        // Format numbers with proper currency formatting
        const formattedPrice = new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD',
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        }).format(stock.current_price);
        
        const formattedTotal = new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD',
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        }).format(totalAmount);

        additionalContext = `I'll help you ${tradeRequest.action} ${tradeRequest.shares} shares of ${tradeRequest.symbol}. The current price is ${formattedPrice} per share, for a total of ${formattedTotal}. To confirm this trade, please enter PIN: 1234`;
        skipAI = true;
      }
    }

    let reply = '';
    if (skipAI) {
      reply = additionalContext;
    } else {
      const openai = new OpenAI({ apiKey: openAIApiKey });
      const completion = await openai.chat.completions.create({
        messages: [
          {
            role: 'system',
            content: `You are a personal investment assistant. Your name is Kai. You are helping the user manage their stock portfolio.
            You can provide real-time stock data, portfolio analysis, and execute trades.
            If the user asks to execute a trade, ask them to confirm with a PIN.
            If you are asked about personal information, you should decline to answer.
            You should be friendly, helpful, and concise.`,
          },
          { role: 'user', content: message + ' Also, here is some additional context: ' + additionalContext },
        ],
        model: 'gpt-3.5-turbo',
      });
      reply = completion.choices[0].message.content;
    }

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
