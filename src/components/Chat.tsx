
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { supabase } from '@/integrations/supabase/client'
import { toast } from 'sonner'
import { MessageCircle, X } from 'lucide-react'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

export function Chat() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isOpen, setIsOpen] = useState(false)

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim()) return

    const userMessage = { role: 'user' as const, content: input }
    setMessages(prev => [...prev, userMessage])
    setInput('')
    setIsLoading(true)

    try {
      const { data, error } = await supabase.functions.invoke('chat', {
        body: { messages: [...messages, userMessage] }
      })

      if (error) throw error

      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: data.message 
      }])
    } catch (error) {
      console.error('Error sending message:', error)
      toast.error('Failed to send message')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {!isOpen && (
        <Button
          onClick={() => setIsOpen(true)}
          className="rounded-full w-12 h-12 p-0"
        >
          <MessageCircle className="h-6 w-6" />
        </Button>
      )}

      {isOpen && (
        <Card className="w-[380px] shadow-lg">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Financial Assistant</CardTitle>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsOpen(false)}
              className="h-8 w-8"
            >
              <X className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-4 mb-4 h-[400px] overflow-y-auto">
              {messages.map((message, i) => (
                <div
                  key={i}
                  className={`p-4 rounded-lg ${
                    message.role === 'user'
                      ? 'bg-primary text-primary-foreground ml-auto max-w-[80%]'
                      : 'bg-muted max-w-[80%]'
                  }`}
                >
                  {message.content}
                </div>
              ))}
            </div>
            <form onSubmit={sendMessage} className="flex gap-2">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask about your portfolio..."
                disabled={isLoading}
              />
              <Button type="submit" disabled={isLoading}>
                Send
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
