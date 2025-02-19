
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.21.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    const ELEVEN_LABS_API_KEY = Deno.env.get('ELEVEN_LABS_API_KEY');
    
    if (!OPENAI_API_KEY) {
      console.error('OpenAI API key not set');
      throw new Error('OpenAI API key not set');
    }
    
    if (!ELEVEN_LABS_API_KEY) {
      console.error('ElevenLabs API key not set');
      throw new Error('ElevenLabs API key not set');
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

    // Get user's JWT token and verify
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      console.error('User verification failed:', userError);
      throw new Error('Invalid user token');
    }

    console.log('User verified:', user.id);

    // Request an ephemeral token from OpenAI with enhanced retry logic
    let lastError = null;
    let openAIData = null;

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        console.log(`Attempting to get OpenAI token (attempt ${attempt})`);
        
        const response = await fetch("https://api.openai.com/v1/realtime/sessions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${OPENAI_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "gpt-4o-realtime-preview-2024-12-17",
            voice: null,
            instructions: "You are a knowledgeable portfolio advisor providing real-time investment advice."
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`OpenAI API error (${response.status}):`, errorText);
          throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
        }

        openAIData = await response.json();
        
        if (!openAIData?.client_secret?.value) {
          throw new Error('Invalid response format from OpenAI');
        }

        console.log('Successfully obtained OpenAI token');
        break;
      } catch (error) {
        console.error(`Attempt ${attempt} failed:`, error);
        lastError = error;
        
        if (attempt < 3) {
          const backoffDelay = Math.pow(2, attempt - 1) * 1000; // Exponential backoff
          console.log(`Waiting ${backoffDelay}ms before retry...`);
          await delay(backoffDelay);
        }
      }
    }

    if (!openAIData?.client_secret?.value) {
      const errorMsg = lastError ? `Failed to get OpenAI token after 3 attempts: ${lastError.message}` : 'Failed to get OpenAI token';
      console.error(errorMsg);
      throw new Error(errorMsg);
    }

    // Add ElevenLabs voice ID to response
    const responseData = {
      ...openAIData,
      voice_id: "EXAVITQu4vr4xnSDxMaL", // Sarah's voice ID
      eleven_labs_key: ELEVEN_LABS_API_KEY,
    };

    return new Response(JSON.stringify(responseData), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error("Error in realtime-chat function:", error);
    return new Response(JSON.stringify({ 
      error: error.message,
      details: error.stack,
      time: new Date().toISOString()
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
