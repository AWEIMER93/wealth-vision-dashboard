
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Check for OpenAI API key
    const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openAIApiKey) {
      throw new Error('OpenAI API key not configured');
    }

    // Parse request body
    const bodyText = await req.text();
    if (!bodyText) {
      throw new Error('Request body is empty');
    }

    let body;
    try {
      body = JSON.parse(bodyText);
      console.log('Received request body:', body);
    } catch (error) {
      console.error('JSON parse error:', error);
      throw new Error('Invalid JSON in request body');
    }

    const { message } = body;
    if (!message) {
      throw new Error('Message is required');
    }

    // Get authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    console.log('Making OpenAI API request...');
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
            content: 'You are a helpful portfolio management assistant. Help users manage their stock portfolio and execute trades. Keep responses concise and focused on financial topics.',
          },
          { role: 'user', content: message },
        ],
      }),
    });

    console.log('OpenAI API response status:', completion.status);
    if (!completion.ok) {
      const errorText = await completion.text();
      console.error('OpenAI API error:', errorText);
      throw new Error('Failed to get response from OpenAI');
    }

    const json = await completion.json();
    console.log('OpenAI API response:', json);

    const reply = json.choices[0].message.content;

    return new Response(
      JSON.stringify({ reply }),
      { 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        } 
      }
    );
  } catch (error) {
    console.error('Error in portfolio-chat:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message,
        details: error.stack 
      }),
      { 
        status: 500,
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        },
      }
    );
  }
});
