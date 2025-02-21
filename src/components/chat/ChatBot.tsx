
import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { MessageCircle, X, Home } from "lucide-react";
import { ChatMessage } from "./ChatMessage";
import { ChatInput } from "./ChatInput";
import { useChat } from "@/hooks/use-chat";
import { useAuth } from "@/providers/AuthProvider";

// Quick action types
interface QuickAction {
  label: string;
  action: string;
}

const quickActions: QuickAction[] = [
  { label: "Portfolio Summary", action: "Show me a summary of my portfolio" },
  { label: "Market Overview", action: "Give me today's market overview" },
  { label: "Execute Trade", action: "I want to execute a trade" },
  { label: "Performance Analysis", action: "Analyze my portfolio performance" },
];

export const ChatBot = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [showMenu, setShowMenu] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { messages, isLoading, sendMessage, clearMessages } = useChat();
  const { user } = useAuth();
  
  useEffect(() => {
    const scrollToBottom = () => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };
    scrollToBottom();
  }, [messages]);
  
  const handleQuickAction = (action: string) => {
    setShowMenu(false);
    sendMessage(action);
  };

  const handleMenuReturn = () => {
    setShowMenu(true);
    clearMessages();
  };

  // Render null only if there's no user
  if (!user) {
    return null;
  }
  
  return (
    <div className="fixed bottom-4 right-4 z-50">
      {isOpen ? (
        <Card className="w-[400px] h-[600px] flex flex-col animate-fade-in bg-[#1A1A1A] border-white/10">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4 border-b border-white/10">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-white">Portfolio Assistant</span>
              {!showMenu && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleMenuReturn}
                  className="text-gray-400 hover:text-white h-8 w-8"
                >
                  <Home className="h-4 w-4" />
                </Button>
              )}
            </div>
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
            {showMenu ? (
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
              <>
                {messages.map((message, index) => (
                  <ChatMessage
                    key={index}
                    role={message.role}
                    content={message.content}
                  />
                ))}
                <div ref={messagesEndRef} />
              </>
            )}
          </CardContent>

          <div className="p-4 border-t border-white/10">
            <ChatInput 
              onSend={(content) => {
                setShowMenu(false);
                sendMessage(content);
              }} 
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
