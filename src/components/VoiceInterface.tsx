
import React, { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { RealtimeChat } from '@/utils/RealtimeAudio';
import { Mic, MicOff } from 'lucide-react';
import { useAuth } from '@/providers/AuthProvider';
import { supabase } from '@/integrations/supabase/client';

interface VoiceInterfaceProps {
  onSpeakingChange: (speaking: boolean) => void;
}

const VoiceInterface: React.FC<VoiceInterfaceProps> = ({ onSpeakingChange }) => {
  const { toast } = useToast();
  const { user } = useAuth();
  const [isConnected, setIsConnected] = useState(false);
  const chatRef = useRef<RealtimeChat | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  const fetchElevenLabsKey = async () => {
    try {
      console.log('Fetching ElevenLabs API key...');
      const { data, error } = await supabase.functions.invoke('get-secret', {
        body: { secretName: 'ELEVEN_LABS_API_KEY' }
      });

      if (error) {
        console.error('Error from Supabase function:', error);
        throw error;
      }

      console.log('API key retrieved:', data?.secret ? 'Found key' : 'No key found');
      return data?.secret;
    } catch (error) {
      console.error('Error fetching ElevenLabs key:', error);
      return null;
    }
  };

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
    
    if (event.type === 'response.text') {
      if (event.text.toLowerCase().includes('view portfolio') || 
          event.text.toLowerCase().includes('check portfolio') ||
          event.text.toLowerCase().includes('see my portfolio')) {
        // Only subscribe to updates when user wants to view portfolio
        await chatRef.current?.subscribeToPortfolioUpdates();
      }
      
      if (chatRef.current?.voiceId && chatRef.current?.elevenLabsKey) {
        await playAudio(event.text);
      }
    }
  };

  const startConversation = async () => {
    try {
      const elevenLabsKey = await fetchElevenLabsKey();
      console.log('ElevenLabs key status:', elevenLabsKey ? 'Retrieved' : 'Not found');
      
      if (!elevenLabsKey) {
        throw new Error('ElevenLabs API key not found. Please make sure it is set in Supabase.');
      }

      chatRef.current = new RealtimeChat(handleMessage);
      chatRef.current.elevenLabsKey = elevenLabsKey;
      console.log('Initializing chat...');
      await chatRef.current.init();
      setIsConnected(true);
      
      const userName = user?.email?.split('@')[0] || 'there';
      const greetingMessage = `Hi ${userName}, I'm ready to help with your portfolio. Would you like to view your portfolio, execute a trade, or get market analysis?`;
      await playAudio(greetingMessage);
      
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
