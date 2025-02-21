
import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Mic, Square } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/providers/AuthProvider";
import Vapi from "@vapi-ai/web";

// Initialize Vapi client
const vapi = new Vapi("your-api-key-here");
const assistantId = "your-assistant-id-here";

export const VoiceAgent = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    // Initialize Vapi
    vapi.start(assistantId);
  }, []);

  const startRecording = async () => {
    try {
      setIsRecording(true);
      setIsProcessing(true);

      // Start the conversation with user context
      const conversation = await vapi.start(assistantId, {
        userContext: {
          userId: user?.id,
          email: user?.email,
        }
      });

      // Handle messages from the assistant
      conversation.on('message', (message) => {
        console.log('Assistant:', message);
      });

      // Handle errors
      conversation.on('error', (error) => {
        console.error('Vapi error:', error);
        toast({
          title: "Error",
          description: "Failed to process voice command",
          variant: "destructive",
        });
        setIsRecording(false);
        setIsProcessing(false);
      });

      // Handle conversation end
      conversation.on('end', () => {
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
    if (isRecording) {
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
