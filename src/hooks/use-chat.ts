import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/providers/AuthProvider";

interface Message {
  role: 'assistant' | 'user';
  content: string;
}

interface ConversationContext {
  selectedSector?: string;
  awaitingRisk?: boolean;
}

// Helper function to format currency
const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount);
};

// Helper function to format percentages
const formatPercent = (value: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'percent',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value / 100);
};

// Helper function to format large numbers with commas
const formatNumber = (num: number): string => {
  return new Intl.NumberFormat('en-US').format(num);
};

// Helper function to extract stock symbol from message
const extractStockSymbol = (message: string): string | null => {
  // Match common stock message patterns
  const buyMatch = message.match(/buy\s+(\d+)\s+shares?\s+(?:of\s+)?([A-Za-z.]+)/i);
  const sellMatch = message.match(/sell\s+(\d+)\s+shares?\s+(?:of\s+)?([A-Za-z.]+)/i);
  
  if (buyMatch || sellMatch) {
    const match = buyMatch || sellMatch;
    return match![2].toUpperCase().trim();
  }
  
  // General symbol pattern (fallback)
  const symbolMatch = message.match(/\b[A-Za-z.]{1,5}\b/);
  return symbolMatch ? symbolMatch[0].toUpperCase().trim() : null;
};

export const useChat = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [context, setContext] = useState<ConversationContext>({});
  const { toast } = useToast();
  const { user } = useAuth();

  const clearMessages = () => {
    setMessages([]);
    setContext({});
  };

  const getStockData = async (symbol: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('get-stock-data', {
        body: { symbol: symbol.toUpperCase() }
      });

      if (error) throw error;
      if (!data) throw new Error('No stock data returned');
      
      return data;
    } catch (error) {
      console.error('Error fetching stock data:', error);
      throw new Error(`Could not fetch data for stock symbol ${symbol}`);
    }
  };

  const processTradeConfirmation = async (message: string) => {
    if (message === '1234' && messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage.role === 'assistant' && lastMessage.content.includes('PIN')) {
        // Extract trade details from previous messages
        const tradeMessage = messages[messages.length - 2].content;
        const buyMatch = tradeMessage.match(/buy\s+(\d+)\s+shares?\s+of\s+([A-Za-z]+)/i);
        const sellMatch = tradeMessage.match(/sell\s+(\d+)\s+shares?\s+of\s+([A-Za-z]+)/i);
        
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
              // Create new stock record for buying
              const { data: newStock, error: createError } = await supabase
                .from('stocks')
                .insert({
                  symbol,
                  name: stockData.name || symbol,
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

            // Format the response with proper number formatting
            const formattedPrice = formatCurrency(stockData.price);
            const formattedTotal = formatCurrency(tradeAmount);
            
            return `Trade executed successfully! ${type} ${shares} shares of ${symbol} at ${formattedPrice} per share. Total amount: ${formattedTotal}. Current market data: Price ${formattedPrice}, Change ${formatPercent(stockData.percentChange)}, Volume ${formatNumber(stockData.volume)}. Please allow up to 1 minute for your portfolio balances and individual stock holdings to be updated.`;
          } catch (error: any) {
            console.error('Trade error:', error);
            throw new Error(`Failed to execute trade: ${error.message}`);
          }
        }
      }
    }
    return null;
  };

  const formatResponse = (text: string): string => {
    // Format currency values ($X.XX or $X)
    text = text.replace(
      /\$\d+(?:,\d{3})*(?:\.\d{2})?/g,
      match => {
        const number = parseFloat(match.replace(/[$,]/g, ''));
        return formatCurrency(number);
      }
    );

    // Format percentage values (X% or X.XX%)
    text = text.replace(
      /(?:\+|-)?\d+(?:\.\d{1,2})?%/g,
      match => {
        const number = parseFloat(match.replace(/%/g, ''));
        return formatPercent(number);
      }
    );

    // Format large numbers with commas
    text = text.replace(
      /(?<![.$])\b\d{4,}\b(?!\s*%)/g,
      match => formatNumber(parseInt(match))
    );

    return text;
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
          { role: 'assistant', content: formatResponse(tradeConfirmation) }
        ]);
        return;
      }
      
      // Add user message to chat
      setMessages(prev => [...prev, { role: 'user', content }]);

      // Extract stock symbol if present
      const stockSymbol = extractStockSymbol(content);
      let contextUpdate = {};
      
      if (stockSymbol) {
        // Add stock symbol to context for the edge function
        contextUpdate = { stockSymbol };
      }

      // Call the edge function
      const { data, error } = await supabase.functions.invoke('chat', {
        body: { 
          message: content,
          userId: user.id,
          context: {
            ...context,
            ...contextUpdate,
            previousMessages: messages.slice(-2) // Send last 2 messages for context
          }
        },
      });

      if (error) {
        console.error('Chat function error:', error);
        throw error;
      }

      if (!data?.reply) {
        throw new Error('No response from chat function');
      }

      let formattedReply = formatResponse(data.reply);

      // Add assistant's response to chat
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: formattedReply
      }]);

    } catch (error: any) {
      console.error('Chat error:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to send message",
        variant: "destructive",
      });
      
      // Add error message to chat
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
