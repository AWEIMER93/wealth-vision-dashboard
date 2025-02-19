
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { message } = await req.json();
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get user from auth header
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError) throw userError;

    // Get user's portfolio data
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
    
    // Create a message that includes the portfolio context
    const portfolioContext = `
Current Portfolio Overview:
Total Holdings: $${portfolio.total_holding?.toLocaleString() ?? '0'}
Total Profit: $${portfolio.total_profit?.toLocaleString() ?? '0'}
Active Stocks: ${portfolio.active_stocks ?? 0}

Stock Holdings:
${portfolio.stocks?.map(stock => 
  `${stock.symbol}: ${stock.units} units at $${stock.current_price?.toLocaleString() ?? '0'} (${stock.price_change > 0 ? '+' : ''}${stock.price_change}%)`
).join('\n')}

User Question: ${message}

Please analyze this portfolio data and provide specific, data-driven advice. When discussing stocks, reference the actual numbers from the portfolio.`;

    // Call OpenAI with the specialized model and system prompt
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
            content: `You are a professional investment and portfolio management AI assistant. Your expertise includes:
            - Stock market analysis
            - Portfolio performance evaluation
            - Investment strategy recommendations
            - Risk assessment
            - Market trends and patterns
            
            When responding:
            1. Always reference specific data from the user's portfolio
            2. Provide clear, actionable insights
            3. Explain your reasoning using portfolio metrics
            4. Be direct and professional
            5. If discussing a stock, always mention its current price and performance
            6. Include relevant market context when appropriate
            
            You have access to real-time portfolio data which will be provided with each message.`
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
