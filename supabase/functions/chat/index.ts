
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import "https://deno.land/x/xhr@0.1.0/mod.ts";

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
    const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openAIApiKey) {
      throw new Error('OpenAI API key not configured');
    }

    // Parse request
    const { message } = await req.json();
    if (!message) {
      throw new Error('Message is required');
    }

    console.log('Processing message:', message);

    // Call OpenAI API
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
            content: `You are a helpful portfolio management assistant. You help users:
            1. Understand their portfolio performance
            2. Make informed investment decisions
            3. Track market trends
            4. Execute trades
            5. Analyze stock metrics
            
            Keep responses concise and focused on financial topics. When discussing stocks, 
            always include relevant metrics like price, market cap, and volume when available.`,
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

    console.log('Sending reply:', reply);

    return new Response(
      JSON.stringify({ reply }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
