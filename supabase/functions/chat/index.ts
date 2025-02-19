
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import "https://deno.land/x/xhr@0.1.0/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const createSupabaseClient = () => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  return createClient(supabaseUrl, supabaseKey);
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

    console.log('Processing message:', message);

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
      throw portfolioError;
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
            content: `You are a professional portfolio management assistant. You help users manage their investments and execute trades.
            
            Current portfolio context:
            - Total Holdings: $${portfolio.total_holding}
            - Total Profit: ${portfolio.total_profit}%
            - Active Stocks: ${portfolio.active_stocks}
            
            Available actions:
            1. Provide portfolio analysis and insights
            2. Execute buy/sell trades
            3. Show real-time market data
            4. Calculate investment metrics
            
            Format numbers with appropriate commas and decimal places. Keep responses concise and professional.
            When discussing trades, always confirm the action and include relevant metrics.`,
          },
          { role: 'user', content: message },
        ],
      }),
    });

    if (!completion.ok) {
      throw new Error('Failed to get response from OpenAI');
    }

    const data = await completion.json();
    const reply = data.choices[0].message.content;

    // Check if the message indicates a trade action
    if (reply.toLowerCase().includes('execute trade') || 
        reply.toLowerCase().includes('buy shares') || 
        reply.toLowerCase().includes('sell shares')) {
      // Handle trade execution logic here
      // This would involve parsing the reply for trade details
      // and executing the trade through your trading system
      console.log('Trade action detected, processing...');
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
