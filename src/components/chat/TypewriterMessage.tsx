
import { useState, useEffect } from 'react';
import { cn } from "@/lib/utils";

interface TypewriterMessageProps {
  content: string;
  role: 'assistant' | 'user';
  typingSpeed?: number;
}

export const TypewriterMessage = ({ content, role, typingSpeed = 30 }: TypewriterMessageProps) => {
  const [displayedContent, setDisplayedContent] = useState('');
  const [isTyping, setIsTyping] = useState(true);

  useEffect(() => {
    if (role === 'user') {
      setDisplayedContent(content);
      setIsTyping(false);
      return;
    }

    let currentIndex = 0;
    setDisplayedContent('');
    setIsTyping(true);

    const typingInterval = setInterval(() => {
      if (currentIndex < content.length) {
        setDisplayedContent(prev => prev + content[currentIndex]);
        currentIndex++;
      } else {
        clearInterval(typingInterval);
        setIsTyping(false);
      }
    }, typingSpeed);

    return () => clearInterval(typingInterval);
  }, [content, role, typingSpeed]);

  return (
    <div className={cn(
      "flex w-full max-w-[80%] mb-4",
      role === 'user' ? "ml-auto" : "mr-auto"
    )}>
      <div className={cn(
        "rounded-lg px-4 py-2",
        role === 'user' 
          ? "bg-blue-500 text-white" 
          : "bg-white/5 text-white"
      )}>
        {displayedContent}
        {isTyping && <span className="animate-pulse">▋</span>}
      </div>
    </div>
  );
};
