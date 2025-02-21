
import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Mic, Square } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/providers/AuthProvider";
import Vapi from "@vapi-ai/web";
import { supabase } from "@/integrations/supabase/client";

export const VoiceAgent = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [vapi, setVapi] = useState<Vapi | null>(null);

  useEffect(() => {
    const initVapi = async () => {
      try {
        const { data: { vapi_key } } = await supabase.functions.invoke('get-secret', {
          body: { key: 'VAPI_API_KEY' }
        });
        
        if (vapi_key) {
          const vapiInstance = new Vapi(vapi_key);
          setVapi(vapiInstance);
        }
      } catch (error) {
        console.error('Error initializing Vapi:', error);
        toast({
          title: "Error",
          description: "Failed to initialize voice assistant",
          variant: "destructive",
        });
      }
    };

    initVapi();
  }, [toast]);

  const startRecording = async () => {
    if (!vapi) {
      toast({
        title: "Error",
        description: "Voice assistant not initialized",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsRecording(true);
      setIsProcessing(true);

      // Get user's portfolio data for context
      const { data: portfolioData } = await supabase
        .from('portfolios')
        .select('*, stocks(*)')
        .eq('user_id', user?.id)
        .single();

      // Start recording using the correct SDK method
      await vapi.start({
        assistantId: "9b7aeabf-7e65-401a-a820-ced369981fb9", // Your assistant ID
        prompt: {
          messages: [{
            role: "system",
            content: `You are a portfolio management voice assistant. The user's portfolio contains:
              ${portfolioData ? `
              - Total Holdings: $${portfolioData.total_holding || 0}
              - Total Profit: ${portfolioData.total_profit || 0}%
              - Active Stocks: ${portfolioData.active_stocks || 0}
              ` : 'No portfolio data available'}
              
              You can help with:
              1. Checking portfolio status
              2. Getting stock information
              3. Executing trades (requires PIN verification)
              
              Always verify user's identity before making trades.`
          }]
        }
      });

      // Add event listeners
      vapi.addListener('message', (message) => {
        console.log('Assistant:', message);
      });

      vapi.addListener('error', (error) => {
        console.error('Vapi error:', error);
        toast({
          title: "Error",
          description: "Failed to process voice command",
          variant: "destructive",
        });
        setIsRecording(false);
        setIsProcessing(false);
      });

      vapi.addListener('end', () => {
        setIsRecording(false);
        setIsProcessing(false);
      });

    } catch (error) {
      console.error('Error starting recording:', error);
      toast({
        title: "Error",
        description: "Failed to start voice assistant",
        variant: "destructive",
      });
      setIsRecording(false);
      setIsProcessing(false);
    }
  };

  const stopRecording = () => {
    if (isRecording && vapi) {
      vapi.stop();
      setIsRecording(false);
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed bottom-24 left-8 flex items-center gap-2">
      <Button
        variant="outline"
        size="icon"
        className={`w-12 h-12 rounded-full ${isRecording ? 'bg-red-500 hover:bg-red-600' : ''}`}
        onClick={isRecording ? stopRecording : startRecording}
        disabled={isProcessing}
      >
        {isRecording ? (
          <Square className="h-6 w-6" />
        ) : (
          <Mic className="h-6 w-6" />
        )}
      </Button>
    </div>
  );
};
