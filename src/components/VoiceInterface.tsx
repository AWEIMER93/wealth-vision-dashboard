
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

  const handleMessage = async (event: any) => {
    console.log('Received message:', event);
    
    if (event.type === 'response.text') {
      onSpeakingChange(true);
      // Use browser's built-in speech synthesis
      const utterance = new SpeechSynthesisUtterance(event.text);
      utterance.onend = () => onSpeakingChange(false);
      speechSynthesis.speak(utterance);
    }
  };

  const startConversation = async () => {
    try {
      chatRef.current = new RealtimeChat(handleMessage);
      await chatRef.current.init();
      setIsConnected(true);
      
      // Play greeting message with user's name
      const userName = user?.email?.split('@')[0] || 'there';
      const greetingMessage = `Hello ${userName}! How can I help you with your portfolio today?`;
      const utterance = new SpeechSynthesisUtterance(greetingMessage);
      utterance.onend = () => onSpeakingChange(false);
      onSpeakingChange(true);
      speechSynthesis.speak(utterance);
      
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
    speechSynthesis.cancel(); // Stop any ongoing speech
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
      speechSynthesis.cancel();
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
