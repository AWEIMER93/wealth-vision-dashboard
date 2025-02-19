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
  }).format(amount);
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
            // Start transaction
            // Get current stock price and stock data
            const { data: stock, error: stockError } = await supabase
              .from('stocks')
              .select('*')
              .eq('symbol', symbol)
              .single();
            
            if (stockError || !stock) {
              throw new Error('Stock not found');
            }
            
            // Get user's portfolio
            const { data: portfolio, error: portfolioError } = await supabase
              .from('portfolios')
              .select('*')
              .eq('user_id', user!.id)
              .single();
            
            if (portfolioError || !portfolio) {
              throw new Error('Portfolio not found');
            }

            const tradeAmount = stock.current_price * shares;
            
            // Create transaction
            const { error: transactionError } = await supabase
              .from('transactions')
              .insert({
                type,
                shares,
                price_per_unit: stock.current_price,
                total_amount: tradeAmount,
                portfolio_id: portfolio.id,
                stock_id: stock.id,
              });
            
            if (transactionError) throw transactionError;

            // Update or create stock holding
            const { data: existingStock, error: existingStockError } = await supabase
              .from('stocks')
              .select('*')
              .eq('portfolio_id', portfolio.id)
              .eq('symbol', symbol)
              .single();

            if (existingStock) {
              // Update existing stock
              const newShares = type === 'BUY' 
                ? existingStock.shares + shares 
                : existingStock.shares - shares;

              if (newShares > 0) {
                const { error: updateError } = await supabase
                  .from('stocks')
                  .update({ shares: newShares })
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
            } else if (type === 'BUY') {
              // Create new stock holding
              const { error: insertError } = await supabase
                .from('stocks')
                .insert({
                  symbol,
                  name: stock.name,
                  shares,
                  current_price: stock.current_price,
                  price_change: stock.price_change,
                  market_cap: stock.market_cap,
                  volume: stock.volume,
                  portfolio_id: portfolio.id
                });
              
              if (insertError) throw insertError;
            }

            // Update portfolio total
            const newTotal = type === 'BUY'
              ? (portfolio.total_holding || 0) + tradeAmount
              : (portfolio.total_holding || 0) - tradeAmount;

            const { error: portfolioUpdateError } = await supabase
              .from('portfolios')
              .update({
                total_holding: newTotal,
                active_stocks: type === 'BUY' && !existingStock 
                  ? (portfolio.active_stocks || 0) + 1 
                  : type === 'SELL' && existingStock?.shares === shares
                  ? (portfolio.active_stocks || 0) - 1
                  : portfolio.active_stocks
              })
              .eq('id', portfolio.id);
            
            if (portfolioUpdateError) throw portfolioUpdateError;

            // Format the response with proper number formatting
            const formattedPrice = formatCurrency(stock.current_price);
            const formattedTotal = formatCurrency(tradeAmount);
            
            return `Trade executed successfully! ${type} ${shares} shares of ${symbol} at ${formattedPrice} per share. Total amount: ${formattedTotal}. Please allow up to 1 minute for your portfolio balances and individual stock holdings to be updated.`;
          } catch (error: any) {
            console.error('Trade error:', error);
            throw new Error(`Failed to execute trade: ${error.message}`);
          }
        }
      }
    }
    return null;
  };

  const extractSectorFromMessages = (messages: Message[]): string | undefined => {
    const sectors = ['technology', 'electric vehicles', 'finance', 'healthcare', 'retail', 'energy', 'telecommunications', 'aerospace'];
    for (let i = messages.length - 2; i >= 0; i--) {
      const msg = messages[i].content.toLowerCase();
      const foundSector = sectors.find(sector => msg.includes(sector));
      if (foundSector) return foundSector;
    }
    return undefined;
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

      // Check if we're awaiting risk preference and have a sector
      const userContent = content.toLowerCase();
      const riskLevels = ['conservative', 'moderate', 'aggressive', 'speculative'];
      const isRiskResponse = riskLevels.some(risk => userContent.includes(risk));
      
      let messageToSend = content;
      if (context.awaitingRisk && isRiskResponse) {
        const sector = context.selectedSector || extractSectorFromMessages(messages);
        if (sector) {
          messageToSend = `${sector} sector with ${content}`; // Combine sector and risk
        }
      }
      
      // Add user message to chat
      setMessages(prev => [...prev, { role: 'user', content }]);

      // Call the edge function
      const { data, error } = await supabase.functions.invoke('chat', {
        body: { 
          message: messageToSend,
          userId: user.id,
          context: {
            ...context,
            previousMessages: messages.slice(-2) // Send last 2 messages for context
          }
        },
      });

      if (error) throw error;

      // Format any numbers in the response
      let formattedReply = data.reply || "I'm sorry, I couldn't process that request.";
      
      // Format currency values in the response
      formattedReply = formattedReply.replace(
        /\$(\d+(?:\.\d{2})?)/g,
        (match, number) => formatCurrency(parseFloat(number))
      );

      // Update context based on the conversation
      if (formattedReply.includes("What's your risk tolerance?")) {
        setContext(prev => ({
          ...prev,
          selectedSector: extractSectorFromMessages([...messages, { role: 'user', content }]),
          awaitingRisk: true
        }));
      } else {
        // Reset context after getting recommendations
        setContext({});
      }

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
