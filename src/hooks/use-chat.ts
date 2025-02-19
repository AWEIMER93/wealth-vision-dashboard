
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Message {
  role: 'assistant' | 'user';
  content: string;
}

export const useChat = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const sendMessage = async (content: string) => {
    try {
      setIsLoading(true);
      
      // Add user message to chat
      setMessages(prev => [...prev, { role: 'user', content }]);

      // Get current session
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('Authentication required');
      }

      // Call the edge function
      const { data, error } = await supabase.functions.invoke('chat', {
        body: { 
          message: content,
          userId: user.id
        },
      });

      if (error) throw error;

      // Add assistant's response to chat
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: data.reply || "I'm sorry, I couldn't process that request."
      }]);
    } catch (error: any) {
      console.error('Chat error:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to send message",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return {
    messages,
    isLoading,
    sendMessage,
  };
};
