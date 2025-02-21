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

// Helper function to extract trade details
const extractTradeDetails = (message: string): { type: 'BUY' | 'SELL' | null, shares: number, symbol: string } | null => {
  const buyMatch = message.match(/buy\s+(\d+)\s+shares?\s+(?:of\s+)?([A-Z]{1,5})/i);
  const sellMatch = message.match(/sell\s+(\d+)\s+shares?\s+(?:of\s+)?([A-Z]{1,5})/i);
  
  if (buyMatch || sellMatch) {
    const match = buyMatch || sellMatch;
    return {
      type: buyMatch ? 'BUY' : 'SELL',
      shares: parseInt(match![1]),
      symbol: match![2].toUpperCase()
    };
  }
  return null;
};

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
  // First try to match symbols after "price of" or "price for"
  if (message.toLowerCase().includes('price of') || message.toLowerCase().includes('price for')) {
    const priceMatch = message.match(/price (?:of|for) ([A-Z]{1,5})/i);
    if (priceMatch) {
      return priceMatch[1].toUpperCase();
    }
  }

  // Then try to match buy/sell patterns
  const buyMatch = message.match(/buy\s+(\d+)\s+shares?\s+(?:of\s+)?([A-Z]{1,5})/i);
  const sellMatch = message.match(/sell\s+(\d+)\s+shares?\s+(?:of\s+)?([A-Z]{1,5})/i);
  
  if (buyMatch || sellMatch) {
    const match = buyMatch || sellMatch;
    return match![2].toUpperCase();
  }
  
  return null;
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
      console.log('Requesting stock data for:', symbol);
      const result = await supabase.functions.invoke('get-stock-data', {
        body: { symbol }
      });
      
      console.log('Stock data response:', result);

      if (result.error) {
        console.error('Stock data error:', result.error);
        throw new Error(result.error.message);
      }

      if (!result.data) {
        console.error('No stock data received');
        throw new Error('No stock data available');
      }

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

      // Add user message to chat immediately
      setMessages(prev => [...prev, { role: 'user', content }]);

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

      // Check for trade details first
      const tradeDetails = extractTradeDetails(content);
      if (tradeDetails) {
        try {
          const stockData = await getStockData(tradeDetails.symbol);
          const totalCost = stockData.price * tradeDetails.shares;
          
          const tradeMessage = `Current price for ${tradeDetails.symbol} is ${formatCurrency(stockData.price)}. ` +
            `Total cost for ${tradeDetails.shares} shares will be ${formatCurrency(totalCost)}. ` +
            `Please enter your PIN (1234) to confirm this ${tradeDetails.type.toLowerCase()} order.`;
          
          setMessages(prev => [...prev, { 
            role: 'assistant', 
            content: tradeMessage
          }]);
          return;
        } catch (error) {
          console.error('Failed to get stock data:', error);
          setMessages(prev => [...prev, { 
            role: 'assistant', 
            content: `I couldn't get the current price for ${tradeDetails.symbol}. Please try again.`
          }]);
          return;
        }
      }

      // Then check for price queries
      const stockSymbol = extractStockSymbol(content);
      if (stockSymbol) {
        try {
          const stockData = await getStockData(stockSymbol);
          if (stockData.price === 0) {
            setMessages(prev => [...prev, { 
              role: 'assistant', 
              content: `I couldn't find a valid stock symbol "${stockSymbol}". Please verify the stock symbol and try again.`
            }]);
            return;
          }
          
          const priceMessage = `Current price for ${stockSymbol} is ${formatCurrency(stockData.price)}. To trade this stock, please specify quantity (e.g., "buy 10 shares of ${stockSymbol}").`;
          
          setMessages(prev => [...prev, { 
            role: 'assistant', 
            content: priceMessage
          }]);
          return;
        } catch (error) {
          console.error('Failed to get stock data:', error);
          const errorMessage = `I couldn't get the current price for ${stockSymbol}. Please verify the stock symbol and try again.`;
          setMessages(prev => [...prev, { 
            role: 'assistant', 
            content: errorMessage
          }]);
          return;
        }
      }

      // If no trade or stock query, proceed with chat
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

      if (error) {
        throw error;
      }

      if (!data?.reply) {
        throw new Error('No response from chat function');
      }

      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: formatResponse(data.reply)
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
