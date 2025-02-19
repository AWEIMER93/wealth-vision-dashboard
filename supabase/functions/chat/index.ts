
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.21.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper function to format currency
const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount);
};

// Helper function to format large numbers
const formatNumber = (num: number): string => {
  return new Intl.NumberFormat('en-US').format(num);
};

// Helper function to get market news
async function getMarketNews() {
  const FINNHUB_API_KEY = Deno.env.get('FINNHUB_API_KEY');
  const response = await fetch(`https://finnhub.io/api/v1/news?category=general&token=${FINNHUB_API_KEY}`);
  const data = await response.json();
  return data.slice(0, 5); // Get latest 5 news items
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { message, userId } = await req.json();
    
    if (!message) throw new Error('Message is required');
    if (!userId) throw new Error('User ID is required');

    // Check if user is asking for market news
    if (message.toLowerCase().includes('market news') || 
        message.toLowerCase().includes('news') || 
        message.toLowerCase().includes("what's happening in the market")) {
      const news = await getMarketNews();
      let newsResponse = "Here's the latest market news I found:\n\n";
      
      news.forEach((item: any, index: number) => {
        newsResponse += `${index + 1}. ${item.headline}\n`;
        if (item.summary) {
          newsResponse += `   ${item.summary}\n\n`;
        }
      });
      
      return new Response(
        JSON.stringify({ reply: newsResponse }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Process trade requests with more natural language
    const buyMatch = message.match(/buy\s+(\d+)\s+shares?\s+of\s+([A-Za-z]+)/i);
    const sellMatch = message.match(/sell\s+(\d+)\s+shares?\s+of\s+([A-Za-z]+)/i);
    
    if (buyMatch || sellMatch) {
      const match = buyMatch || sellMatch;
      const action = buyMatch ? 'buy' : 'sell';
      const shares = parseInt(match![1]);
      const symbol = match![2].toUpperCase();

      const supabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      );

      const { data: stock } = await supabase
        .from('stocks')
        .select('current_price, name')
        .eq('symbol', symbol)
        .single();

      if (stock) {
        const totalAmount = stock.current_price * shares;
        const formattedPrice = formatCurrency(stock.current_price);
        const formattedTotal = formatCurrency(totalAmount);

        return new Response(
          JSON.stringify({
            reply: `I'll help you ${action} ${shares} shares of ${symbol} (${stock.name}). The current market price is ${formattedPrice} per share, which means your total would be ${formattedTotal}. If you'd like to proceed with this trade, please enter your PIN: 1234`
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Call OpenAI for other queries
    const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openAIApiKey) throw new Error('OpenAI API key not configured');

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
            content: `You are a friendly and helpful investment assistant. Keep your responses conversational and natural.
            Always format numbers properly:
            - Use commas for thousands (e.g., 1,000)
            - Format currency with $ and commas (e.g., $1,000.00)
            - Use % for percentages (e.g., 10.5%)
            Be concise but friendly. Use natural language and avoid robotic responses.`
          },
          { role: 'user', content: message }
        ],
      }),
    });

    const data = await completion.json();
    const reply = data.choices[0].message.content;

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
