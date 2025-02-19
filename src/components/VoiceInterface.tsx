
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

  const playAudio = async (text: string, voiceId: string, apiKey: string) => {
    try {
      onSpeakingChange(true);
      
      const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
        method: 'POST',
        headers: {
          'Accept': 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': apiKey,
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
      await playAudio(event.text, chatRef.current.voiceId, chatRef.current.elevenLabsKey);
    }
  };

  const startConversation = async () => {
    try {
      chatRef.current = new RealtimeChat(handleMessage);
      await chatRef.current.init();
      setIsConnected(true);
      
      const userName = user?.email?.split('@')[0] || 'there';
      const greetingMessage = `Hi ${userName}, I'm ready to help with your portfolio.`;
      
      if (chatRef.current.voiceId && chatRef.current.elevenLabsKey) {
        await playAudio(greetingMessage, chatRef.current.voiceId, chatRef.current.elevenLabsKey);
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
