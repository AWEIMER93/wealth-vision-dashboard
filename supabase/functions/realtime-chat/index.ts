
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.21.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { 
      status: 200,
      headers: corsHeaders 
    });
  }

  try {
    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    
    if (!OPENAI_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'OpenAI API key not configured' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'No authorization header' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseKey);

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid user token' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch user's portfolio data
    const { data: portfolio, error: portfolioError } = await supabase
      .from('portfolios')
      .select(`
        *,
        stocks (
          id,
          symbol,
          name,
          shares,
          current_price,
          price_change,
          market_cap,
          volume
        )
      `)
      .eq('user_id', user.id)
      .single();

    if (portfolioError) {
      console.error('Portfolio fetch error:', portfolioError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch portfolio data' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create portfolio context string
    const portfolioContext = portfolio ? `
      Your user's portfolio total value is $${portfolio.total_holding?.toLocaleString()}.
      Their active stocks are:
      ${portfolio.stocks?.map(stock => 
        `${stock.symbol}: ${stock.shares} shares at $${stock.current_price} (${stock.price_change}% change)`
      ).join('\n')}
    ` : 'The user does not have any stocks in their portfolio yet.';

    console.log('Fetching OpenAI token...');

    const response = await fetch("https://api.openai.com/v1/realtime/sessions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-realtime-preview-2024-12-17",
        voice: "shimmer",
        modalities: ["text", "audio"],
        instructions: `You are a knowledgeable portfolio advisor providing real-time investment advice. Always format currency values properly and provide clear explanations. 

        ${portfolioContext}

        You can execute trades for the user. When they want to trade, ask them to confirm with a 4-digit PIN (1234 for testing).
        
        Available commands:
        1. Execute trades (buy/sell stocks)
        2. View portfolio performance
        3. Get real-time stock information
        4. Analyze market trends
        
        Format all currency values with proper symbols and commas. Format all percentages with % symbol.`,
        
        turn_detection: {
          type: "server_vad",
          threshold: 0.5,
          prefix_padding_ms: 300,
          silence_duration_ms: 1000
        },
        tools: [
          {
            type: "function",
            name: "execute_trade",
            description: "Execute a stock trade (buy/sell)",
            parameters: {
              type: "object",
              properties: {
                action: {
                  type: "string",
                  enum: ["BUY", "SELL"]
                },
                symbol: {
                  type: "string",
                  description: "Stock symbol (e.g., AAPL, TSLA)"
                },
                shares: {
                  type: "number",
                  description: "Number of shares to trade"
                },
                pin: {
                  type: "string",
                  description: "4-digit PIN for confirmation"
                }
              },
              required: ["action", "symbol", "shares", "pin"]
            }
          },
          {
            type: "function",
            name: "get_portfolio_data",
            description: "Get current portfolio data",
            parameters: {
              type: "object",
              properties: {}
            }
          },
          {
            type: "function",
            name: "get_stock_price",
            description: "Get real-time stock price",
            parameters: {
              type: "object",
              properties: {
                symbol: {
                  type: "string",
                  description: "Stock symbol (e.g., AAPL, TSLA)"
                }
              },
              required: ["symbol"]
            }
          }
        ],
        tool_choice: "auto"
      }),
    });

    if (!response.ok) {
      console.error('OpenAI API error:', response.status, await response.text());
      return new Response(
        JSON.stringify({ error: 'Failed to get OpenAI token' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    
    if (!data?.client_secret?.value) {
      return new Response(
        JSON.stringify({ error: 'Invalid response from OpenAI' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Successfully obtained OpenAI token');

    return new Response(
      JSON.stringify(data),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error("Error:", error);
    
    return new Response(
      JSON.stringify({ 
        error: error.message || 'Internal server error',
        timestamp: new Date().toISOString()
      }),
      { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
