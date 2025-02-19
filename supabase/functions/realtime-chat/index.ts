
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.21.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    const ELEVEN_LABS_API_KEY = Deno.env.get('ELEVEN_LABS_API_KEY');
    
    if (!OPENAI_API_KEY || !ELEVEN_LABS_API_KEY) {
      throw new Error('Required API keys not set');
    }

    // Get user data from request
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get user's JWT token
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      throw new Error('Invalid user token');
    }

    // Fetch user's portfolio data
    const { data: portfolio, error: portfolioError } = await supabase
      .from('portfolios')
      .select(`
        *,
        stocks (*)
      `)
      .eq('user_id', user.id)
      .single();

    if (portfolioError) {
      throw portfolioError;
    }

    // Format portfolio data for the AI
    const portfolioContext = portfolio ? {
      total_holding: portfolio.total_holding,
      total_profit: portfolio.total_profit,
      active_stocks: portfolio.active_stocks,
      stocks: portfolio.stocks.map((stock: any) => ({
        symbol: stock.symbol,
        name: stock.name,
        shares: stock.shares,
        current_price: stock.current_price,
        price_change: stock.price_change,
      }))
    } : null;

    // Request an ephemeral token from OpenAI
    const response = await fetch("https://api.openai.com/v1/realtime/sessions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-realtime-preview-2024-12-17",
        voice: "alloy",
        instructions: `You are a highly knowledgeable and conversational portfolio advisor. 
          Here is the user's current portfolio data: ${JSON.stringify(portfolioContext)}.
          Use this data to provide personalized advice and real-time insights.
          You help users manage their investments by providing real-time advice, executing trades, 
          and offering insights about market conditions. Always be professional but friendly, 
          and make sure to confirm important actions like trades before executing them. 
          If a user wants to execute a trade, always ask for confirmation and use a PIN for security.
          When discussing numerical values, always format them appropriately (e.g., $1,234.56 for currency, 12.34% for percentages).
          Remember to reference their actual holdings when discussing their portfolio.`
      }),
    });

    const openAIData = await response.json();
    console.log("Session created:", openAIData);

    // Add ElevenLabs voice ID to response
    const responseData = {
      ...openAIData,
      voice_id: "EXAVITQu4vr4xnSDxMaL", // Sarah's voice ID from ElevenLabs
      eleven_labs_key: ELEVEN_LABS_API_KEY,
    };

    return new Response(JSON.stringify(responseData), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
