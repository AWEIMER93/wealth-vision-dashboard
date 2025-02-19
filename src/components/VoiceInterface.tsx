
import React, { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { RealtimeChat } from '@/utils/RealtimeAudio';
import { Mic, MicOff } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/providers/AuthProvider';

interface VoiceInterfaceProps {
  onSpeakingChange: (speaking: boolean) => void;
}

const VOICE_ID = "M7ya1YbaeFaPXljg9BpK"; // Custom voice ID
const MODEL_ID = "eleven_monolingual_v1";

const VoiceInterface: React.FC<VoiceInterfaceProps> = ({ onSpeakingChange }) => {
  const { toast } = useToast();
  const { user } = useAuth();
  const [isConnected, setIsConnected] = useState(false);
  const chatRef = useRef<RealtimeChat | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const playAudioResponse = async (text: string) => {
    try {
      onSpeakingChange(true);
      
      const { data, error } = await supabase.functions.invoke('text-to-speech', {
        body: { 
          text,
          voice_id: VOICE_ID,
          model_id: MODEL_ID
        }
      });

      if (error) throw error;

      if (data?.audio_base64) {
        const audio = new Audio(`data:audio/mp3;base64,${data.audio_base64}`);
        audioRef.current = audio;
        
        audio.onended = () => {
          onSpeakingChange(false);
        };
        
        await audio.play();
      }
    } catch (error) {
      console.error('Error playing audio:', error);
      onSpeakingChange(false);
      toast({
        title: "Error",
        description: "Failed to play audio response",
        variant: "destructive",
      });
    }
  };

  const handleMessage = async (event: any) => {
    console.log('Received message:', event);
    
    if (event.type === 'response.text') {
      await playAudioResponse(event.text);
    }
  };

  const startConversation = async () => {
    try {
      chatRef.current = new RealtimeChat(handleMessage);
      await chatRef.current.init();
      setIsConnected(true);
      
      // Play greeting message with user's name
      const userName = user?.email?.split('@')[0] || 'there';
      const greetingMessage = `Hello ${userName}! How are you today? What can I help you with regarding your portfolio?`;
      await playAudioResponse(greetingMessage);
      
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
      audioRef.current = null;
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
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      chatRef.current?.disconnect();
    };
  }, []);

  return (
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
  );
};

export default VoiceInterface;
