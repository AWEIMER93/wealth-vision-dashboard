
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
    const buyMatch = message.match(/buy\s+(\d+)\s+shares?\s+(?:of\s+)?([A-Za-z]+)/i)
    const sellMatch = message.match(/sell\s+(\d+)\s+shares?\s+(?:of\s+)?([A-Za-z]+)/i)

    let reply = ''

    if (buyMatch || sellMatch) {
      const match = buyMatch || sellMatch
      const type = buyMatch ? 'buy' : 'sell'
      const shares = parseInt(match![1])
      const symbol = match![2].toUpperCase()

      // Get current stock price and verify it exists
      const { data: stockData, error: stockError } = await fetch(
        `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${Deno.env.get('FINNHUB_API_KEY')}`
      ).then(res => res.json())

      if (stockError || !stockData?.c) {
        reply = `I couldn't find the stock ${symbol}. Please verify the stock symbol and try again.`
      } else {
        const price = stockData.c
        const totalAmount = shares * price
        reply = `Great! Let me help you with that trade. Here's what you're looking to do:\n\n` +
          `${type.toUpperCase()} ${shares} shares of ${symbol} at $${price.toLocaleString()} per share\n` +
          `Total transaction value: $${totalAmount.toLocaleString()}\n\n` +
          `Please enter your PIN to confirm this trade.`
      }
    } else if (message.toLowerCase().includes('portfolio summary') || message.toLowerCase().includes('my portfolio')) {
      const totalValue = portfolio.total_holding || 0
      const totalProfit = portfolio.total_profit || 0
      const profitPrefix = totalProfit > 0 ? '+' : ''
      
      const stocksSummary = portfolio.stocks
        ?.map(stock => {
          const value = stock.shares * (stock.current_price || 0)
          const changePrefix = stock.price_change && stock.price_change > 0 ? '+' : ''
          return `${stock.name} (${stock.symbol})\n` +
            `   ${stock.shares} shares at $${stock.current_price?.toLocaleString()} per share\n` +
            `   Total value: $${value.toLocaleString()}\n` +
            `   Today's change: ${changePrefix}${stock.price_change}%`
        })
        .join('\n\n')

      reply = `📊 Here's your portfolio overview:\n\n` +
        `Total Portfolio Value: $${totalValue.toLocaleString()}\n` +
        `Today's Change: ${profitPrefix}${totalProfit}%\n` +
        `Number of Positions: ${portfolio.active_stocks}\n\n` +
        `Your Positions:\n\n${stocksSummary}`
    } else if (message.toLowerCase().includes('trade') || message.toLowerCase().includes('buy') || message.toLowerCase().includes('sell')) {
      reply = "I can help you trade any US stock! Just tell me what you want to do using natural language.\n\n" +
        "For example:\n" +
        "- \"Buy 10 shares of AAPL\"\n" +
        "- \"Sell 5 shares of TSLA\"\n\n" +
        "You can use any valid US stock symbol."
    } else {
      reply = "👋 I'm your portfolio assistant! I can help you with:\n\n" +
        "📊 Portfolio Summary - View your holdings and positions\n" +
        "📈 Market Overview - Check market performance\n" +
        "💰 Trading - Buy or sell any US stock\n" +
        "📱 Performance Analysis - Track your investment performance\n\n" +
        "Just let me know what you'd like to know about!"
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
        reply: "I apologize, but I ran into an issue. Could you please try that again?" 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    )
  }
})
