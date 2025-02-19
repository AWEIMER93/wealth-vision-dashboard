
import React, { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { RealtimeChat } from '@/utils/RealtimeAudio';
import { Mic, MicOff } from 'lucide-react';
import { useAuth } from '@/providers/AuthProvider';

interface VoiceInterfaceProps {
  onSpeakingChange: (speaking: boolean) => void;
}

const VoiceInterface: React.FC<VoiceInterfaceProps> = ({ onSpeakingChange }) => {
  const { toast } = useToast();
  const { user } = useAuth();
  const [isConnected, setIsConnected] = useState(false);
  const chatRef = useRef<RealtimeChat | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  const playAudio = async (text: string) => {
    try {
      onSpeakingChange(true);
      
      const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${chatRef.current?.voiceId}`, {
        method: 'POST',
        headers: {
          'Accept': 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': chatRef.current?.elevenLabsKey || '',
        },
        body: JSON.stringify({
          text,
          model_id: "eleven_multilingual_v2",
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
          }
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate speech');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      
      if (audioRef.current) {
        audioRef.current.src = url;
        await audioRef.current.play();
      }
    } catch (error) {
      console.error('Error playing audio:', error);
      onSpeakingChange(false);
    }
  };

  const handleMessage = async (event: any) => {
    console.log('Received message:', event);
    
    if (event.type === 'response.text' && chatRef.current?.voiceId && chatRef.current?.elevenLabsKey) {
      await playAudio(event.text);
    }

    // Handle function calls for trades
    if (event.type === 'response.function_call_arguments.delta') {
      const functionCall = JSON.parse(event.delta);
      if (functionCall?.action && functionCall?.symbol && functionCall?.shares) {
        // Get current stock price for confirmation
        const { data: stockData } = await supabase
          .from('stocks')
          .select('current_price')
          .eq('symbol', functionCall.symbol)
          .single();

        if (stockData) {
          const totalAmount = stockData.current_price * functionCall.shares;
          const confirmMessage = `You are about to ${functionCall.action.toLowerCase()} ${functionCall.shares} shares of ${functionCall.symbol} at $${stockData.current_price.toLocaleString()} per share. Total amount: $${totalAmount.toLocaleString()}. Please confirm with your PIN.`;
          await playAudio(confirmMessage);
        }
      }
    }

    // Handle trade execution confirmation
    if (event.type === 'response.text' && event.text.includes('Trade executed successfully')) {
      const updatedMessage = `${event.text} Please note that it may take 1-2 minutes for your portfolio balances and stock holdings to be updated.`;
      await playAudio(updatedMessage);
    }
  };

  const startConversation = async () => {
    try {
      chatRef.current = new RealtimeChat(handleMessage);
      await chatRef.current.init();
      setIsConnected(true);
      
      const userName = user?.email?.split('@')[0] || 'there';
      const greetingMessage = `Hi ${userName}, I'm ready to help with your portfolio. I can assist you with viewing your portfolio, executing trades, and providing market analysis. What would you like to do?`;
      
      if (chatRef.current.voiceId && chatRef.current.elevenLabsKey) {
        await playAudio(greetingMessage);
      }
      
      toast({
        title: "Voice Assistant Ready",
        description: "You can now speak with your portfolio assistant",
      });
    } catch (error) {
      console.error('Error starting conversation:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : 'Failed to start voice assistant',
        variant: "destructive",
      });
    }
  };

  const endConversation = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
    }
    chatRef.current?.disconnect();
    setIsConnected(false);
    onSpeakingChange(false);
    
    toast({
      title: "Voice Assistant Disconnected",
      description: "Voice interface has been turned off",
    });
  };

  useEffect(() => {
    audioRef.current = new Audio();
    audioRef.current.onended = () => onSpeakingChange(false);
    
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
      }
      chatRef.current?.disconnect();
    };
  }, []);

  return (
    <>
      <Button
        onClick={isConnected ? endConversation : startConversation}
        size="icon"
        variant={isConnected ? "destructive" : "default"}
        className="fixed bottom-4 left-4 h-12 w-12 rounded-full shadow-lg hover:shadow-xl transition-all"
      >
        {isConnected ? (
          <MicOff className="h-6 w-6" />
        ) : (
          <Mic className="h-6 w-6" />
        )}
      </Button>
    </>
  );
};

export default VoiceInterface;
