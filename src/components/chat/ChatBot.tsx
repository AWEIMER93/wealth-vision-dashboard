
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { MessageCircle, X, Mic, MicOff } from "lucide-react";
import { ChatMessage } from "./ChatMessage";
import { ChatInput } from "./ChatInput";
import { useChat } from "@/hooks/use-chat";
import { RealtimeChat } from "@/utils/RealtimeAudio";

export const ChatBot = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isVoiceEnabled, setIsVoiceEnabled] = useState(false);
  const { messages, isLoading, sendMessage } = useChat();

  const toggleVoice = async () => {
    if (isVoiceEnabled) {
      setIsVoiceEnabled(false);
      // Voice cleanup will be handled by VoiceInterface component
    } else {
      try {
        const chat = new RealtimeChat((event) => {
          if (event.type === 'response.text') {
            sendMessage(event.text);
          }
        });
        await chat.init();
        setIsVoiceEnabled(true);
      } catch (error) {
        console.error('Error initializing voice:', error);
      }
    }
  };
  
  return (
    <div className="fixed bottom-4 right-4 z-50">
      {isOpen ? (
        <Card className="w-[400px] h-[600px] flex flex-col animate-fade-in bg-[#1A1A1A] border-white/10">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4 border-b border-white/10">
            <div className="flex items-center gap-4">
              <span className="font-semibold text-white">Chat Assistant</span>
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleVoice}
                className={`${isVoiceEnabled ? 'text-blue-500' : 'text-gray-400'} hover:text-white`}
              >
                {isVoiceEnabled ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
              </Button>
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
            {messages.length === 0 ? (
              <div className="text-center text-gray-400 pt-8">
                How can I assist you with your portfolio today?
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
