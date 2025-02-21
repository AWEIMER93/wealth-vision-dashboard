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
  const queryClient = useQueryClient();

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
    try {
      if (message === '1234' && messages.length > 0) {
        const lastMessage = messages[messages.length - 1];
        if (lastMessage.role === 'assistant' && lastMessage.content.includes('PIN')) {
          const priceMatch = lastMessage.content.match(/Current price for ([A-Z]+) is \$([\d.]+)\. Total cost for (\d+) shares/);
          if (priceMatch) {
            const [_, symbol, priceStr, sharesStr] = priceMatch;
            const shares = parseInt(sharesStr);
            const price = parseFloat(priceStr);
            const type = lastMessage.content.toLowerCase().includes('buy') ? 'BUY' : 'SELL';
            
            console.log('Processing trade:', { symbol, shares, price, type });

            // Get user's portfolio
            const { data: portfolio, error: portfolioError } = await supabase
              .from('portfolios')
              .select('*')
              .eq('user_id', user!.id)
              .single();
            
            if (portfolioError) {
              console.error('Portfolio error:', portfolioError);
              throw new Error('Portfolio not found');
            }

            // Get real-time stock data
            const stockData = await getStockData(symbol);
            
            if (!stockData.price) {
              throw new Error(`Could not get current price for ${symbol}`);
            }

            // For sell orders, verify user has enough shares
            if (type === 'SELL') {
              const { data: userStock } = await supabase
                .from('stocks')
                .select('*')
                .eq('portfolio_id', portfolio.id)
                .eq('symbol', symbol)
                .single();

              if (!userStock || userStock.shares < shares) {
                throw new Error(`Insufficient shares. You only have ${userStock?.shares || 0} shares of ${symbol}`);
              }
            }

            // Get or create stock record
            const { data: existingStock, error: stockError } = await supabase
              .from('stocks')
              .select('*')
              .eq('portfolio_id', portfolio.id)
              .eq('symbol', symbol)
              .single();

            let stockId;
            if (stockError) {
              if (type === 'SELL') {
                throw new Error('Cannot sell a stock that is not in your portfolio');
              }
              
              // Create new stock for buying
              const { data: newStock, error: createError } = await supabase
                .from('stocks')
                .insert({
                  symbol,
                  name: stockData.name || symbol,
                  shares: 0,
                  current_price: stockData.price,
                  price_change: stockData.percentChange || 0,
                  market_cap: stockData.marketCap || 0,
                  volume: stockData.volume || 0,
                  portfolio_id: portfolio.id
                })
                .select()
                .single();

              if (createError) throw createError;
              stockId = newStock.id;
            } else {
              stockId = existingStock.id;
            }

            // Create transaction
            const tradeAmount = stockData.price * shares;
            const { error: transactionError } = await supabase
              .from('transactions')
              .insert({
                type,
                shares,
                price_per_unit: stockData.price,
                total_amount: tradeAmount,
                portfolio_id: portfolio.id,
                stock_id: stockId,
              });
            
            if (transactionError) throw transactionError;

            // Update stock holding
            const newShares = type === 'BUY' 
              ? (existingStock?.shares || 0) + shares 
              : (existingStock?.shares || 0) - shares;

            if (newShares > 0) {
              await supabase
                .from('stocks')
                .update({ 
                  shares: newShares,
                  current_price: stockData.price,
                  price_change: stockData.percentChange || 0,
                  market_cap: stockData.marketCap || 0,
                  volume: stockData.volume || 0
                })
                .eq('id', stockId);
            } else {
              await supabase
                .from('stocks')
                .delete()
                .eq('id', stockId);
            }

            // Update portfolio totals
            const { error: portfolioUpdateError } = await supabase
              .from('portfolios')
              .update({
                total_holding: type === 'BUY'
                  ? (portfolio.total_holding || 0) + tradeAmount
                  : (portfolio.total_holding || 0) - tradeAmount,
                active_stocks: type === 'BUY' && !existingStock
                  ? (portfolio.active_stocks || 0) + 1
                  : type === 'SELL' && newShares === 0
                  ? (portfolio.active_stocks || 0) - 1
                  : portfolio.active_stocks
              })
              .eq('id', portfolio.id);

            if (portfolioUpdateError) throw portfolioUpdateError;

            // Invalidate queries to refresh the UI
            queryClient.invalidateQueries({ queryKey: ['portfolio'] });

            return `Trade executed successfully! ${type.toLowerCase()}ing ${shares} shares of ${symbol} at ${formatCurrency(stockData.price)} per share. Total amount: ${formatCurrency(tradeAmount)}`;
          }
        }
      }
      return null;
    } catch (error: any) {
      console.error('Trade error:', error);
      throw new Error(`Failed to execute trade: ${error.message}`);
    }
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

      // Check if user is specifying number of shares
      if (lastMessage?.role === 'assistant' && 
          lastMessage.content.includes("How many shares of")) {
        const match = lastMessage.content.match(/shares of ([A-Z]+) do you want to (buy|sell)/i);
        if (match && !isNaN(Number(content))) {
          const [_, symbol, type] = match;
          try {
            const stockData = await getStockData(symbol);
            const shares = Number(content);
            const totalCost = stockData.price * shares;
            
            const tradeMessage = `Current price for ${symbol} is ${formatCurrency(stockData.price)}. ` +
              `Total cost for ${shares} shares will be ${formatCurrency(totalCost)}. ` +
              `Please enter your PIN to confirm this ${type} order.`;
            
            setMessages(prev => [...prev, { 
              role: 'assistant', 
              content: tradeMessage
            }]);
            return;
          } catch (error) {
            console.error('Failed to get stock data:', error);
            setMessages(prev => [...prev, { 
              role: 'assistant', 
              content: `I couldn't get the current price for ${symbol}. Please try again.`
            }]);
            return;
          }
        }
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
    setMessages,
    isLoading,
    sendMessage,
    clearMessages,
  };
};
