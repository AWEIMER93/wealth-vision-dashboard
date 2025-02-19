
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { MessageCircle, X } from "lucide-react";
import { ChatMessage } from "./ChatMessage";
import { ChatInput } from "./ChatInput";
import { QuickActions } from "./QuickActions";
import { useChat } from "@/hooks/use-chat";
import { useAuth } from "@/providers/AuthProvider";
import { useRealtimeUpdates } from "@/hooks/use-realtime-updates";

export const ChatBot = () => {
  const [isOpen, setIsOpen] = useState(false);
  const { user } = useAuth();
  const { messages, isLoading, awaitingPin, handleSendMessage } = useChat();
  
  useRealtimeUpdates(user?.id);

  // Don't render the chat bot if user is not authenticated
  if (!user) {
    return null;
  }

  const userName = user.email?.split('@')[0] || 'there';
  
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
          
          <div className="p-4 border-b border-white/10">
            <QuickActions onAction={handleSendMessage} disabled={isLoading} />
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
              placeholder={awaitingPin ? "Enter your PIN to confirm trade" : "Ask about your portfolio..."}
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
