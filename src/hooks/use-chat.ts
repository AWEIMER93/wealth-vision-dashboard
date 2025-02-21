
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/providers/AuthProvider";
import { useQueryClient } from "@tanstack/react-query";

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

  const getStockData = async (symbol: string) => {
    try {
      const result = await supabase.functions.invoke('get-stock-data', {
        body: { symbol }
      });
      
      if (result.error) throw new Error(result.error.message);
      if (!result.data) throw new Error('No stock data available');
      
      return result.data;
    } catch (error) {
      console.error('getStockData error:', error);
      throw error;
    }
  };

  const processTradeConfirmation = async (message: string) => {
    if (message === '1234' && messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage.role === 'assistant' && lastMessage.content.includes('PIN')) {
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

            // Get real-time stock data
            const stockData = await getStockData(symbol);
            
            if (!stockData.price) {
              throw new Error(`Could not get current price for ${symbol}`);
            }

            // For sell orders, verify user has enough shares
            if (type === 'SELL') {
              const { data: userPortfolio } = await supabase
                .from('portfolios')
                .select('*, stocks(*)')
                .eq('user_id', user!.id)
                .single();

              const userStock = userPortfolio?.stocks?.find(s => s.symbol === symbol);
              if (!userStock || userStock.shares < shares) {
                throw new Error(`Insufficient shares. You only have ${userStock?.shares || 0} shares of ${symbol}`);
              }
            }

            // Get or create stock record
            let existingStock;
            const { data: stockRecord, error: stockError } = await supabase
              .from('stocks')
              .select('*')
              .eq('symbol', symbol)
              .eq('portfolio_id', portfolio.id)
              .single();

            if (stockError) {
              if (type === 'SELL') {
                throw new Error('Cannot sell a stock that is not in your portfolio');
              }

              const { data: newStock, error: createError } = await supabase
                .from('stocks')
                .insert({
                  symbol,
                  name: stockData.companyName || symbol,
                  current_price: stockData.price,
                  shares: 0,
                  price_change: stockData.percentChange || 0,
                  market_cap: stockData.marketCap || 0,
                  volume: stockData.volume || 0,
                  portfolio_id: portfolio.id
                })
                .select()
                .single();
              
              if (createError) throw createError;
              existingStock = newStock;
            } else {
              existingStock = stockRecord;
            }

            // Calculate trade amount using current stock price
            const tradeAmount = stockData.price * shares;
            
            // Create transaction
            const { error: transactionError } = await supabase
              .from('transactions')
              .insert({
                type,
                shares,
                price_per_unit: stockData.price,
                total_amount: tradeAmount,
                portfolio_id: portfolio.id,
                stock_id: existingStock.id,
              });
            
            if (transactionError) throw transactionError;

            // Update stock holding
            const newShares = type === 'BUY' 
              ? (existingStock.shares || 0) + shares 
              : (existingStock.shares || 0) - shares;

            if (newShares > 0) {
              const { error: updateError } = await supabase
                .from('stocks')
                .update({ 
                  shares: newShares,
                  current_price: stockData.price,
                  price_change: stockData.percentChange || 0,
                  market_cap: stockData.marketCap || 0,
                  volume: stockData.volume || 0
                })
                .eq('id', existingStock.id);
              
              if (updateError) throw updateError;
            } else {
              // Remove stock if no shares left
              const { error: deleteError } = await supabase
                .from('stocks')
                .delete()
                .eq('id', existingStock.id);
              
              if (deleteError) throw deleteError;
            }

            // Update portfolio total
            const newTotal = type === 'BUY'
              ? (portfolio.total_holding || 0) + tradeAmount
              : (portfolio.total_holding || 0) - tradeAmount;

            const { error: portfolioUpdateError } = await supabase
              .from('portfolios')
              .update({
                total_holding: newTotal,
                active_stocks: type === 'BUY' && newShares === shares
                  ? (portfolio.active_stocks || 0) + 1 
                  : type === 'SELL' && newShares === 0
                  ? (portfolio.active_stocks || 0) - 1
                  : portfolio.active_stocks
              })
              .eq('id', portfolio.id);

            if (portfolioUpdateError) throw portfolioUpdateError;

            // Invalidate queries to refresh the UI
            queryClient.invalidateQueries({ queryKey: ['portfolio'] });

            return `Trade executed successfully! ${type} ${shares} shares of ${symbol} at $${stockData.price.toLocaleString()} per share. Total amount: $${tradeAmount.toLocaleString()}`;
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

      // Add user message to chat immediately
      setMessages(prev => [...prev, { role: 'user', content }]);

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

      // Check for trade command
      const buyMatch = content.match(/buy\s+(\d+)\s+shares?\s+(?:of\s+)?([A-Za-z]+)/i);
      const sellMatch = content.match(/sell\s+(\d+)\s+shares?\s+(?:of\s+)?([A-Za-z]+)/i);

      if (buyMatch || sellMatch) {
        const match = buyMatch || sellMatch;
        const type = buyMatch ? 'buy' : 'sell';
        const shares = parseInt(match![1]);
        const symbol = match![2].toUpperCase();

        try {
          const stockData = await getStockData(symbol);
          const totalCost = stockData.price * shares;
          
          const tradeMessage = `Current price for ${symbol} is $${stockData.price.toLocaleString()}. ` +
            `Total cost for ${shares} shares will be $${totalCost.toLocaleString()}. ` +
            `Please enter your PIN (1234) to confirm this ${type} order.`;
          
          setMessages(prev => [...prev, { 
            role: 'assistant', 
            content: tradeMessage
          }]);
          return;
        } catch (error) {
          console.error('Failed to get stock data:', error);
          setMessages(prev => [...prev, { 
            role: 'assistant', 
            content: `I couldn't get the current price for ${symbol}. Please verify the stock symbol and try again.`
          }]);
          return;
        }
      }

      // Handle general chat messages
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
      if (!data?.reply) throw new Error('No response from chat function');

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
    isLoading,
    sendMessage,
    clearMessages,
  };
};
