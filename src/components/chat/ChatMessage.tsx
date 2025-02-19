
import { cn } from "@/lib/utils";

interface ChatMessageProps {
  content: string;
  role: 'assistant' | 'user';
}

export const ChatMessage = ({ content, role }: ChatMessageProps) => {
  return (
    <div className={cn(
      "flex w-full max-w-[80%] mb-4",
      role === 'user' ? "ml-auto" : "mr-auto"
    )}>
      <div className={cn(
        "rounded-lg px-4 py-2",
        role === 'user' 
          ? "bg-primary text-primary-foreground" 
          : "bg-muted"
      )}>
        {content}
      </div>
    </div>
  );
};
