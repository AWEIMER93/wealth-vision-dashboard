
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/providers/AuthProvider";
import { useQueryClient } from "@tanstack/react-query";
import { formatCurrency, formatPercent, formatNumber, extractTradeDetails } from "@/utils/trade-helpers";
import { executeTrade } from "@/services/trade-service";

interface Message {
  role: 'assistant' | 'user';
  content: string;
}

interface ConversationContext {
  selectedSector?: string;
  awaitingRisk?: boolean;
}

export const useChat = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [context, setContext] = useState<ConversationContext>({});
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const clearMessages = () => {
    setMessages([]);
    setContext({});
  };

  const processTradeConfirmation = async (message: string) => {
    if (message === '1234' && messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage.role === 'assistant' && lastMessage.content.includes('PIN')) {
        // Extract trade details from previous messages
        const tradeMessage = messages[messages.length - 2].content;
        const buyMatch = tradeMessage.match(/buy\s+(\d+)\s+shares?\s+(?:of\s+)?([A-Za-z]+)/i);
        const sellMatch = tradeMessage.match(/sell\s+(\d+)\s+shares?\s+(?:of\s+)?([A-Za-z]+)/i);
        
        if (buyMatch || sellMatch) {
          const match = buyMatch || sellMatch;
          const type = buyMatch ? 'BUY' : 'SELL';
          const shares = parseInt(match![1]);
          const symbol = match![2].toUpperCase();
          
          try {
            // Get user's portfolio first
            const { data: portfolio, error: portfolioError } = await supabase
              .from('portfolios')
              .select('*')
              .eq('user_id', user!.id)
              .single();
            
            if (portfolioError || !portfolio) {
              throw new Error('Portfolio not found');
            }

            const result = await executeTrade({
              portfolio,
              symbol,
              shares,
              type,
              userId: user!.id
            });

            // Invalidate queries to refresh the UI
            queryClient.invalidateQueries({ queryKey: ['portfolio'] });

            return `Trade executed successfully! ${type} ${shares} shares of ${symbol} at ${formatCurrency(result.price)} per share. Total amount: ${formatCurrency(result.total)}`;
          } catch (error: any) {
            console.error('Trade error:', error);
            throw new Error(`Failed to execute trade: ${error.message}`);
          }
        }
      }
    }
    return null;
  };

  const sendMessage = async (content: string) => {
    try {
      if (!user) {
        throw new Error('Authentication required');
      }

      setIsLoading(true);

      // First check if this is a trade confirmation
      if (messages.length > 0 && messages[messages.length - 1].role === 'assistant' && 
          messages[messages.length - 1].content.includes('PIN')) {
        const tradeConfirmation = await processTradeConfirmation(content);
        if (tradeConfirmation) {
          setMessages(prev => [...prev, { role: 'assistant', content: tradeConfirmation }]);
          return;
        }
      }

      // Add user message to chat
      setMessages(prev => [...prev, { role: 'user', content }]);

      // Check if last assistant message was asking for stock symbol
      const lastMessage = messages[messages.length - 1];
      if (lastMessage?.role === 'assistant' && 
          (lastMessage.content.includes("Which stock do you want to buy?") ||
           lastMessage.content.includes("Which stock do you want to sell?"))) {
        const type = lastMessage.content.includes("buy") ? "buy" : "sell";
        setMessages(prev => [...prev, { 
          role: 'assistant', 
          content: `How many shares of ${content.toUpperCase()} do you want to ${type}?`
        }]);
        return;
      }

      // For other messages, proceed with normal chat flow
      if (content.toLowerCase().includes('execute trade') || 
          content.toLowerCase().includes('i want to trade')) {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: "Please select how you would like to trade:"
        }]);
        return;
      }

      const { data, error } = await supabase.functions.invoke('chat', {
        body: { 
          message: content,
          userId: user.id,
          context: {
            ...context,
            previousMessages: messages.slice(-2)
          }
        },
      });

      if (error) throw error;

      if (!data?.reply) {
        throw new Error('No response from chat function');
      }

      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: data.reply
      }]);

    } catch (error: any) {
      console.error('Chat error:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to send message",
        variant: "destructive",
      });
      
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: "I'm sorry, I encountered an error. Please try again."
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  return {
    messages,
    setMessages,
    isLoading,
    sendMessage,
    clearMessages,
  };
};
