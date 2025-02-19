import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { MessageCircle, X, LineChart, Wallet, TrendingUp, AlertCircle, DollarSign } from "lucide-react";
import { ChatMessage } from "./ChatMessage";
import { ChatInput } from "./ChatInput";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/providers/AuthProvider";
import { useQueryClient } from "@tanstack/react-query";

interface Message {
  role: 'assistant' | 'user';
  content: string;
}

interface TradeCommand {
  type: 'BUY' | 'SELL';
  units: number;
  symbol: string;
}

const QUICK_ACTIONS = [
  { icon: Wallet, label: "Portfolio Summary", query: "Give me a quick summary of my portfolio performance" },
  { icon: TrendingUp, label: "Best Performers", query: "What are my best performing stocks?" },
  { icon: LineChart, label: "Market Analysis", query: "How is the market affecting my portfolio?" },
  { icon: AlertCircle, label: "Risk Assessment", query: "What's my portfolio risk level?" },
  { icon: DollarSign, label: "Execute Trade", query: "I'd like to make a trade" },
];

export const ChatBot = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [awaitingPin, setAwaitingPin] = useState(false);
  const [pendingTrade, setPendingTrade] = useState<TradeCommand | null>(null);
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!user?.id) return;

    // Subscribe to stock changes
    const stockChannel = supabase
      .channel('stock-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'stocks'
        },
        (payload) => {
          console.log('Stock change:', payload);
          queryClient.invalidateQueries({ queryKey: ['portfolio', user.id] });
        }
      )
      .subscribe();

    // Subscribe to transaction changes
    const transactionChannel = supabase
      .channel('transaction-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'transactions'
        },
        (payload) => {
          console.log('Transaction:', payload);
          queryClient.invalidateQueries({ queryKey: ['portfolio', user.id] });
          
          // Show toast for new transactions
          if (payload.eventType === 'INSERT') {
            const { type, units, price_per_unit, total_amount } = payload.new;
            toast({
              title: `Trade Executed`,
              description: `Successfully ${type.toLowerCase()}ed ${units} shares at $${price_per_unit} per share. Total: $${total_amount}`,
              variant: "default",
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(stockChannel);
      supabase.removeChannel(transactionChannel);
    };
  }, [user?.id, queryClient, toast]);

  const handleSendMessage = async (message: string) => {
    try {
      setIsLoading(true);
      setMessages(prev => [...prev, { role: 'user', content: message }]);

      const payload: any = { message };
      if (awaitingPin) {
        payload.pin = message;
        payload.tradeCommand = pendingTrade;
      }

      const { data, error } = await supabase.functions.invoke('portfolio-chat', {
        body: payload,
      });

      if (error) throw error;

      setMessages(prev => [...prev, { role: 'assistant', content: data.reply }]);
      
      if (data.awaitingPin) {
        setAwaitingPin(true);
        setPendingTrade(data.tradeCommand);
      } else {
        setAwaitingPin(false);
        setPendingTrade(null);
      }
      
    } catch (error) {
      console.error('Chat error:', error);
      toast({
        title: "Error",
        description: "Failed to get response. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const userName = user?.email?.split('@')[0] || 'there';
  
  return (
    <div className="fixed bottom-4 right-4 z-50">
      {isOpen ? (
        <Card className="w-[400px] h-[600px] flex flex-col animate-fade-in bg-[#1A1A1A] border-white/10">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4 border-b border-white/10">
            <span className="font-semibold text-white">Portfolio Assistant</span>
            <Button 
              variant="ghost" 
              size="icon"
              onClick={() => setIsOpen(false)}
              className="text-gray-400 hover:text-white"
            >
              <X className="h-4 w-4" />
            </Button>
          </CardHeader>
          
          {/* Quick Actions */}
          <div className="p-4 border-b border-white/10">
            <div className="grid grid-cols-2 gap-2">
              {QUICK_ACTIONS.map((action) => (
                <Button
                  key={action.label}
                  variant="outline"
                  className="flex items-center gap-2 h-auto py-3 border-white/10 hover:bg-white/5 text-white"
                  onClick={() => handleSendMessage(action.query)}
                  disabled={isLoading}
                >
                  <action.icon className="h-4 w-4" />
                  <span className="text-sm">{action.label}</span>
                </Button>
              ))}
            </div>
          </div>

          <CardContent className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 ? (
              <div className="text-center text-gray-400 pt-8">
                Hello, {userName}! How can I assist you today?
              </div>
            ) : (
              messages.map((message, index) => (
                <ChatMessage
                  key={index}
                  role={message.role}
                  content={message.content}
                />
              ))
            )}
          </CardContent>

          <div className="p-4 border-t border-white/10">
            <ChatInput 
              onSend={handleSendMessage} 
              disabled={isLoading}
              placeholder={awaitingPin ? "Enter your PIN to confirm" : "Ask about your portfolio..."}
            />
          </div>
        </Card>
      ) : (
        <Button
          onClick={() => setIsOpen(true)}
          size="icon"
          className="h-12 w-12 rounded-full bg-blue-500 hover:bg-blue-600 text-white shadow-lg hover:shadow-xl transition-all"
        >
          <MessageCircle className="h-6 w-6" />
        </Button>
      )}
    </div>
  );
};
