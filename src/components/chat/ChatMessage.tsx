
import { TypewriterMessage } from "./TypewriterMessage";

interface ChatMessageProps {
  content: string;
  role: 'assistant' | 'user';
}

export const ChatMessage = ({ content, role }: ChatMessageProps) => {
  return <TypewriterMessage content={content} role={role} />;
};
