
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

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    let reply = ''

    // Portfolio Summary
    if (message.toLowerCase().includes('portfolio summary')) {
      const { data: portfolio } = await supabase
        .from('portfolios')
        .select(`*, stocks (*)`)
        .eq('user_id', userId)
        .single()

      if (!portfolio) {
        reply = "You don't have any portfolio data yet. Start by making your first trade!"
      } else {
        const totalValue = portfolio.total_holding || 0
        const totalProfit = portfolio.total_profit || 0
        
        reply = "Portfolio Summary\n\n" +
               `Total Value: $${totalValue.toLocaleString()}\n` +
               `Total Return: ${totalProfit > 0 ? '+' : ''}${totalProfit}%\n\n` +
               "Your Holdings:\n"

        if (portfolio.stocks && portfolio.stocks.length > 0) {
          portfolio.stocks.forEach((stock: any) => {
            reply += `\n${stock.name} (${stock.symbol})\n` +
                    `Shares: ${stock.shares}\n` +
                    `Current Price: $${stock.current_price.toLocaleString()}\n` +
                    `Value: $${(stock.shares * stock.current_price).toLocaleString()}\n`
          })
        } else {
          reply += "\nNo stocks in portfolio yet."
        }
      }
    }
    
    // Market Overview
    else if (message.toLowerCase().includes('market overview')) {
      const { data: stocks } = await supabase
        .from('stocks')
        .select('*')
        .order('symbol')

      if (!stocks || stocks.length === 0) {
        reply = "No market data available at the moment."
      } else {
        reply = "Market Overview\n\n"
        stocks.forEach(stock => {
          reply += `${stock.name} (${stock.symbol})\n` +
                  `Price: $${stock.current_price.toLocaleString()}\n` +
                  `Change: ${stock.price_change > 0 ? '+' : ''}${stock.price_change}%\n` +
                  `Volume: ${stock.volume.toLocaleString()}\n\n`
        })
      }
    }
    
    // Execute Trade
    else if (message.toLowerCase().includes('execute trade')) {
      reply = "To execute a trade, type:\n\n" +
             "BUY [shares] [symbol]   or   SELL [shares] [symbol]\n\n" +
             "Example:\n" +
             "BUY 10 AAPL   or   SELL 5 TSLA\n\n" +
             "Available Symbols:\n" +
             "AAPL - Apple\n" +
             "TSLA - Tesla\n" +
             "MSFT - Microsoft\n" +
             "GOOG - Google\n" +
             "NVDA - NVIDIA"
    }
    
    // Process Trade
    else if (message.match(/^(buy|sell)\s+\d+\s+[A-Za-z]+$/i)) {
      const [action, shares, symbol] = message.split(/\s+/)
      const upperSymbol = symbol.toUpperCase()

      const { data: stock } = await supabase
        .from('stocks')
        .select('*')
        .eq('symbol', upperSymbol)
        .single()

      if (!stock) {
        reply = "Invalid symbol. Available stocks:\n" +
               "AAPL - Apple\n" +
               "TSLA - Tesla\n" +
               "MSFT - Microsoft\n" +
               "GOOG - Google\n" +
               "NVDA - NVIDIA"
      } else {
        const total = parseInt(shares) * stock.current_price
        reply = "Trade Preview\n\n" +
               `${action.toUpperCase()} ${shares} ${upperSymbol}\n` +
               `Price: $${stock.current_price.toLocaleString()}/share\n` +
               `Total: $${total.toLocaleString()}\n\n` +
               "Enter PIN to confirm trade"
      }
    }
    
    // Performance Analysis
    else if (message.toLowerCase().includes('performance')) {
      const { data: portfolio } = await supabase
        .from('portfolios')
        .select(`*, stocks (*), transactions (*)`)
        .eq('user_id', userId)
        .single()

      if (!portfolio) {
        reply = "No portfolio data available for analysis."
      } else {
        const totalValue = portfolio.total_holding || 0
        const totalProfit = portfolio.total_profit || 0
        
        reply = "Performance Analysis\n\n" +
               `Overall Return: ${totalProfit > 0 ? '+' : ''}${totalProfit}%\n` +
               `Total Value: $${totalValue.toLocaleString()}\n\n` +
               "Recent Transactions:\n"

        if (portfolio.transactions && portfolio.transactions.length > 0) {
          portfolio.transactions
            .slice(0, 5)
            .forEach((tx: any) => {
              reply += `\n${tx.type} ${tx.shares} ${tx.symbol}\n` +
                      `Price: $${tx.price_per_unit.toLocaleString()}\n` +
                      `Total: $${tx.total_amount.toLocaleString()}\n`
            })
        } else {
          reply += "\nNo transactions yet."
        }
      }
    }
    
    // Default Welcome Message
    else {
      reply = "Hello! 👋 How can I help you today?\n\n" +
             "You can ask me about:\n\n" +
             "1. Portfolio Summary - View your holdings\n" +
             "2. Market Overview - Check stock prices\n" +
             "3. Execute Trade - Buy or sell stocks\n" +
             "4. Performance Analysis - Review your returns"
    }

    return new Response(
      JSON.stringify({ reply }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )

  } catch (error) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
