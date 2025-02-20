import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.21.0'
import "https://deno.land/x/xhr@0.1.0/mod.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const stockMappings: { [key: string]: string } = {
  'APPLE': 'AAPL',
  'TESLA': 'TSLA',
  'MICROSOFT': 'MSFT',
  'GOOGLE': 'GOOG',
  'NVIDIA': 'NVDA',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { message, userId, context } = await req.json()

    if (!message) {
      throw new Error('Message is required')
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    const { data: portfolio, error: portfolioError } = await supabase
      .from('portfolios')
      .select(`*, stocks (*)`)
      .eq('user_id', userId)
      .single()

    if (portfolioError) {
      console.error('Portfolio fetch error:', portfolioError)
      throw new Error('Failed to fetch portfolio data')
    }

    const buyMatch = message.match(/buy\s+(\d+)\s+shares?\s+(?:of\s+)?([A-Za-z]+)/i)
    const sellMatch = message.match(/sell\s+(\d+)\s+shares?\s+(?:of\s+)?([A-Za-z]+)/i)

    let reply = ''

    if (message.toLowerCase().includes('execute trade')) {
      reply = "I'd be happy to help you execute a trade! Here's how you can do it:\n\n" +
        "Simply tell me what you want to trade using natural language like:\n" +
        "   \"Buy 10 shares of Apple\"\n" +
        "   \"Sell 5 shares of Tesla\"\n\n" +
        "Available stocks:\n" +
        "   • Apple (AAPL)\n" +
        "   • Tesla (TSLA)\n" +
        "   • Microsoft (MSFT)\n" +
        "   • Google (GOOG)\n" +
        "   • NVIDIA (NVDA)"
    } else if (buyMatch || sellMatch) {
      const match = buyMatch || sellMatch
      const type = buyMatch ? 'buy' : 'sell'
      const shares = parseInt(match![1])
      let symbol = match![2].toUpperCase()
      
      if (stockMappings[symbol]) {
        symbol = stockMappings[symbol]
      }

      const { data: stockData } = await supabase
        .from('stocks')
        .select('current_price, name')
        .eq('symbol', symbol)
        .single()

      if (!stockData) {
        reply = "I couldn't find that stock. Here are the available stocks:\n\n" +
          "   • Apple (AAPL)\n" +
          "   • Tesla (TSLA)\n" +
          "   • Microsoft (MSFT)\n" +
          "   • Google (GOOG)\n" +
          "   • NVIDIA (NVDA)\n\n" +
          "Please try again with one of these stocks."
      } else {
        const totalAmount = shares * stockData.current_price
        reply = "📈 Trade Confirmation\n\n" +
          `Order: ${type.toUpperCase()} ${shares} shares of ${symbol}\n` +
          `Price: $${stockData.current_price.toLocaleString()} per share\n` +
          `Total: $${totalAmount.toLocaleString()}\n\n` +
          "Please enter your PIN to confirm this trade."
      }
    } else if (message.toLowerCase().includes('portfolio summary') || message.toLowerCase().includes('my portfolio')) {
      const totalValue = portfolio.total_holding || 0
      const totalProfit = portfolio.total_profit || 0
      const totalInvestment = portfolio.total_investment || 0
      const profitPrefix = totalProfit > 0 ? '+' : ''

      const stocksByValue = [...(portfolio.stocks || [])].sort((a, b) => 
        ((b.current_price || 0) * b.shares) - ((a.current_price || 0) * a.shares)
      )

      const topHoldings = stocksByValue
        .map(stock => {
          const value = stock.shares * (stock.current_price || 0)
          const portfolioPercentage = (value / totalValue * 100).toFixed(1)
          return `${stock.name} (${stock.symbol})\n` +
            `   Value: $${value.toLocaleString()} (${portfolioPercentage}% of portfolio)\n` +
            `   Shares: ${stock.shares.toLocaleString()}\n` +
            `   Average Cost: $${(totalInvestment / stock.shares).toFixed(2)}`
        })
        .join('\n\n')

      reply = `📊 Portfolio Summary\n\n` +
        `Total Portfolio Value: $${totalValue.toLocaleString()}\n` +
        `Total Return: ${profitPrefix}${((totalValue - totalInvestment) / totalInvestment * 100).toFixed(2)}%\n` +
        `Cash Available: $${(totalValue - totalInvestment).toLocaleString()}\n\n` +
        `Holdings by Value:\n\n${topHoldings}`

    } else if (message.toLowerCase().includes('market overview') || message.toLowerCase().includes('market update')) {
      const gainers = portfolio.stocks
        ?.filter(stock => (stock.price_change || 0) > 0)
        .sort((a, b) => (b.price_change || 0) - (a.price_change || 0))

      const losers = portfolio.stocks
        ?.filter(stock => (stock.price_change || 0) < 0)
        .sort((a, b) => (a.price_change || 0) - (b.price_change || 0))

      reply = `📈 Market Overview\n\n` +
        `Top Gainers Today:\n` +
        gainers?.map(stock => 
          `${stock.name} (${stock.symbol}): +${stock.price_change}%\n` +
          `   Volume: ${(stock.volume || 0).toLocaleString()} shares\n` +
          `   Market Cap: $${(stock.market_cap || 0).toLocaleString()}`
        ).join('\n\n') + 
        `\n\nTop Decliners Today:\n` +
        losers?.map(stock => 
          `${stock.name} (${stock.symbol}): ${stock.price_change}%\n` +
          `   Volume: ${(stock.volume || 0).toLocaleString()} shares\n` +
          `   Market Cap: $${(stock.market_cap || 0).toLocaleString()}`
        ).join('\n\n')

    } else if (message.toLowerCase().includes('performance')) {
      const totalValue = portfolio.total_holding || 0
      const totalProfit = portfolio.total_profit || 0
      
      const stockPerformance = portfolio.stocks
        ?.map(stock => {
          const value = stock.shares * (stock.current_price || 0)
          const dayChange = value * (stock.price_change || 0) / 100
          return {
            symbol: stock.symbol,
            name: stock.name,
            dayChange,
            percentChange: stock.price_change || 0,
            contribution: (dayChange / totalValue * 100).toFixed(2)
          }
        })
        .sort((a, b) => b.dayChange - a.dayChange)

      reply = `📊 Performance Analysis\n\n` +
        `Today's Portfolio Change: ${totalProfit > 0 ? '+' : ''}${totalProfit}% ` +
        `($${(totalValue * totalProfit / 100).toLocaleString()})\n\n` +
        `Top Contributors:\n` +
        stockPerformance
          ?.filter(stock => stock.dayChange > 0)
          .map(stock => 
            `${stock.name} (${stock.symbol})\n` +
            `   Day Change: +${stock.percentChange}%\n` +
            `   Dollar Impact: +$${stock.dayChange.toLocaleString()}\n` +
            `   Portfolio Impact: +${stock.contribution}%`
          ).join('\n\n') +
        `\n\nLargest Detractors:\n` +
        stockPerformance
          ?.filter(stock => stock.dayChange < 0)
          .map(stock => 
            `${stock.name} (${stock.symbol})\n` +
            `   Day Change: ${stock.percentChange}%\n` +
            `   Dollar Impact: -$${Math.abs(stock.dayChange).toLocaleString()}\n` +
            `   Portfolio Impact: ${stock.contribution}%`
          ).join('\n\n')

    } else {
      reply = "👋 Hello! I can help you with:\n\n" +
        "   📊 Portfolio Summary\n" +
        "   📈 Market Overview\n" +
        "   💰 Execute Trade\n" +
        "   📱 Performance Analysis\n\n" +
        "What would you like to know about?"
    }

    return new Response(
      JSON.stringify({ reply }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )

  } catch (error) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({ 
        error: error.message,
        reply: "I apologize, but I ran into an issue. Could you please try that again?" 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )
  }
})
