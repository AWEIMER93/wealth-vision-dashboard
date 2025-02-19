
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/providers/AuthProvider";

interface Message {
  role: 'assistant' | 'user';
  content: string;
}

interface TradeCommand {
  type: 'BUY' | 'SELL';
  units: number;
  symbol: string;
}

export const useChat = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [awaitingPin, setAwaitingPin] = useState(false);
  const [pendingTrade, setPendingTrade] = useState<TradeCommand | null>(null);
  const { toast } = useToast();
  const { user } = useAuth();

  const handleSendMessage = async (message: string) => {
    if (!user) {
      toast({
        title: "Authentication Required",
        description: "Please log in to use the chat feature.",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsLoading(true);
      setMessages(prev => [...prev, { role: 'user', content: message }]);

      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError || !session) {
        throw new Error('Authentication required');
      }

      const body = awaitingPin && pendingTrade 
        ? { message, pin: message, tradeCommand: pendingTrade }
        : { message };

      const { data, error } = await supabase.functions.invoke('portfolio-chat', {
        body,
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        }
      });

      if (error) {
        console.error('Chat error:', error);
        throw error;
      }

      if (!data?.reply) {
        throw new Error('Invalid response format');
      }

      setMessages(prev => [...prev, { role: 'assistant', content: data.reply }]);
      
      if (data.awaitingPin) {
        setAwaitingPin(true);
        setPendingTrade(data.tradeCommand);
        
        toast({
          title: "PIN Verification Required",
          description: "Please enter your PIN to confirm the trade",
          variant: "default",
        });
      } else {
        setAwaitingPin(false);
        setPendingTrade(null);
      }
    } catch (error: any) {
      console.error('Chat error:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to get response. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return {
    messages,
    isLoading,
    awaitingPin,
    handleSendMessage
  };
};
