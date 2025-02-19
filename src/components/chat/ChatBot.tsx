
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { MessageCircle, X } from "lucide-react";
import { ChatMessage } from "./ChatMessage";
import { ChatInput } from "./ChatInput";
import { useChat } from "@/hooks/use-chat";

// Quick action types
interface QuickAction {
  label: string;
  action: string;
}

const quickActions: QuickAction[] = [
  { label: "Portfolio Summary", action: "Show me a summary of my portfolio" },
  { label: "Market Overview", action: "Give me today's market overview" },
  { label: "Buy Stock", action: "I want to buy stocks" },
  { label: "Sell Stock", action: "I want to sell stocks" },
  { label: "Performance Analysis", action: "Analyze my portfolio performance" },
];

export const ChatBot = () => {
  const [isOpen, setIsOpen] = useState(false);
  const { messages, isLoading, sendMessage } = useChat();
  
  const handleQuickAction = (action: string) => {
    sendMessage(action);
  };
  
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

          <CardContent className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 ? (
              <>
                <div className="text-center text-gray-400 pt-8 pb-4">
                  How can I assist you with your portfolio today?
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {quickActions.map((action, index) => (
                    <Button
                      key={index}
                      variant="outline"
                      className="text-sm border-white/10 hover:bg-white/5"
                      onClick={() => handleQuickAction(action.action)}
                    >
                      {action.label}
                    </Button>
                  ))}
                </div>
              </>
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
              onSend={sendMessage} 
              disabled={isLoading}
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
