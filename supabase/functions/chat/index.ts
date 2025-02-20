
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.21.0'
import "https://deno.land/x/xhr@0.1.0/mod.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { message, userId, context } = await req.json()

    if (!message) {
      throw new Error('Message is required')
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Get user's portfolio data
    const { data: portfolio, error: portfolioError } = await supabase
      .from('portfolios')
      .select(`
        *,
        stocks (*)
      `)
      .eq('user_id', userId)
      .single()

    if (portfolioError) {
      console.error('Portfolio fetch error:', portfolioError)
      throw new Error('Failed to fetch portfolio data')
    }

    // Create the AI context
    const portfolioContext = portfolio ? `
      Your user's portfolio total value is $${portfolio.total_holding?.toLocaleString()}.
      Their active stocks are:
      ${portfolio.stocks?.map(stock => 
        `${stock.symbol}: ${stock.shares} shares at $${stock.current_price} (${stock.price_change}% change)`
      ).join('\n')}
    ` : 'The user does not have any stocks in their portfolio yet.'

    // Construct the response based on the message and context
    let reply = ''

    if (message.toLowerCase().includes('portfolio summary')) {
      reply = `Here's your portfolio summary:\n${portfolioContext}`
    } else if (message.toLowerCase().includes('market overview')) {
      reply = "Based on today's market data:\n" + 
        portfolio.stocks?.map(stock => 
          `${stock.symbol} is trading at $${stock.current_price} (${stock.price_change}% today)`
        ).join('\n')
    } else if (message.toLowerCase().includes('execute trade')) {
      reply = "To execute a trade, please specify:\n" +
        "1. Action (buy/sell)\n" +
        "2. Number of shares\n" +
        "3. Stock symbol\n\n" +
        "For example: 'buy 10 shares of AAPL'\n\n" +
        "You'll need to confirm with your PIN (1234 for testing)."
    } else if (message.toLowerCase().includes('performance')) {
      const totalProfit = portfolio.total_profit || 0
      reply = `Your portfolio performance:\n` +
        `Total Value: $${portfolio.total_holding?.toLocaleString()}\n` +
        `Today's Change: ${totalProfit > 0 ? '+' : ''}${totalProfit.toFixed(2)}%`
    } else {
      reply = "I can help you with:\n" +
        "- Portfolio Summary\n" +
        "- Market Overview\n" +
        "- Execute Trade\n" +
        "- Performance Analysis\n\n" +
        "What would you like to know?"
    }

    return new Response(
      JSON.stringify({ reply }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    )

  } catch (error) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({ 
        error: error.message,
        reply: "I'm sorry, I encountered an error. Please try again." 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 // Return 200 even for errors to prevent client side errors
      }
    )
  }
})
