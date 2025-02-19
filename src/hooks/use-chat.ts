
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/providers/AuthProvider";

interface Message {
  role: 'assistant' | 'user';
  content: string;
}

export const useChat = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();

  const processTradeConfirmation = async (message: string) => {
    if (message === '1234' && messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage.role === 'assistant' && lastMessage.content.includes('PIN: 1234')) {
        // Extract trade details from previous messages
        const tradeMessage = messages[messages.length - 2].content;
        const buyMatch = tradeMessage.match(/buy\s+(\d+)\s+shares?\s+of\s+([A-Za-z]+)/i);
        const sellMatch = tradeMessage.match(/sell\s+(\d+)\s+shares?\s+of\s+([A-Za-z]+)/i);
        
        if (buyMatch || sellMatch) {
          const match = buyMatch || sellMatch;
          const type = buyMatch ? 'BUY' : 'SELL';
          const shares = parseInt(match![1]);
          let symbol = match![2].toUpperCase();
          
          const stockMappings: { [key: string]: string } = {
            'APPLE': 'AAPL',
            'TESLA': 'TSLA',
            'MICROSOFT': 'MSFT',
            'GOOGLE': 'GOOG',
            'NVIDIA': 'NVDA',
          };
          
          if (stockMappings[symbol]) {
            symbol = stockMappings[symbol];
          }
          
          try {
            // Get current stock price
            const { data: stock } = await supabase
              .from('stocks')
              .select('current_price, id')
              .eq('symbol', symbol)
              .single();
            
            if (!stock) {
              throw new Error('Stock not found');
            }
            
            // Get user's portfolio
            const { data: portfolio } = await supabase
              .from('portfolios')
              .select('id')
              .eq('user_id', user!.id)
              .single();
            
            if (!portfolio) {
              throw new Error('Portfolio not found');
            }
            
            // Create transaction
            const { error: transactionError } = await supabase
              .from('transactions')
              .insert({
                type,
                shares,
                price_per_unit: stock.current_price,
                total_amount: stock.current_price * shares,
                portfolio_id: portfolio.id,
                stock_id: stock.id,
              });
            
            if (transactionError) throw transactionError;
            
            return `Trade executed successfully! ${type} ${shares} shares of ${symbol} at $${stock.current_price.toFixed(2)} per share. Total amount: $${(stock.current_price * shares).toFixed(2)}`;
          } catch (error: any) {
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
      const tradeConfirmation = await processTradeConfirmation(content);
      if (tradeConfirmation) {
        setMessages(prev => [
          ...prev,
          { role: 'user', content: '****' }, // Mask PIN
          { role: 'assistant', content: tradeConfirmation }
        ]);
        return;
      }
      
      // Add user message to chat
      setMessages(prev => [...prev, { role: 'user', content }]);

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
