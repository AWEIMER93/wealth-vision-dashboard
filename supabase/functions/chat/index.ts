
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.21.0'
import "https://deno.land/x/xhr@0.1.0/mod.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
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

    // Check for trade execution pattern
    const buyMatch = message.match(/buy\s+(\d+)\s+shares?\s+of\s+([A-Za-z]+)/i)
    const sellMatch = message.match(/sell\s+(\d+)\s+shares?\s+of\s+([A-Za-z]+)/i)

    let reply = ''

    if (buyMatch || sellMatch) {
      const match = buyMatch || sellMatch
      const type = buyMatch ? 'buy' : 'sell'
      const shares = parseInt(match![1])
      const symbol = match![2].toUpperCase()

      // Check if stock exists and get current price
      const { data: stockData } = await supabase
        .from('stocks')
        .select('current_price, name')
        .eq('symbol', symbol)
        .single()

      if (!stockData) {
        reply = `I couldn't find the stock ${symbol}. Please check the symbol and try again.`
      } else {
        const totalAmount = shares * stockData.current_price
        reply = `Please confirm your order:\n\n` +
          `${type.toUpperCase()} ${shares} shares of ${symbol}\n` +
          `Price per share: $${stockData.current_price}\n` +
          `Total amount: $${totalAmount}\n\n` +
          `To confirm this trade, please enter your PIN (1234 for testing).`
      }
    } else if (message.toLowerCase().includes('portfolio summary')) {
      reply = `Here's your portfolio summary:\n` +
        `Total Value: $${portfolio.total_holding?.toLocaleString()}\n` +
        `Active Stocks: ${portfolio.active_stocks}\n\n` +
        `Your holdings:\n` +
        portfolio.stocks?.map(stock => 
          `${stock.symbol}: ${stock.shares} shares at $${stock.current_price} (${stock.price_change}% change)`
        ).join('\n')
    } else if (message.toLowerCase().includes('market overview')) {
      reply = "Based on today's market data:\n" + 
        portfolio.stocks?.map(stock => 
          `${stock.symbol} is trading at $${stock.current_price} (${stock.price_change}% today)`
        ).join('\n')
    } else if (message.toLowerCase().includes('execute trade')) {
      reply = "To execute a trade, type your order like this:\n" +
        "'buy 10 shares of AAPL' or 'sell 5 shares of TSLA'\n\n" +
        "Available stocks: AAPL, TSLA, MSFT, GOOG, NVDA\n\n" +
        "After submitting your order, you'll need to confirm with your PIN."
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
        status: 200 
      }
    )
  }
})
