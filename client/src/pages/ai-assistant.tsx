import { useState, useRef, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { GlassCard } from "@/components/glass-card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Send, Bot, User, Sparkles, FileText, Users, ClipboardList } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface QuickAction {
  id: string;
  label: string;
  prompt: string;
  icon: any;
}

const quickActions: QuickAction[] = [
  {
    id: "create-pass",
    label: "Create Position",
    prompt: "Create a new recruitment pass for a ",
    icon: FileText,
  },
  {
    id: "add-candidate",
    label: "Add Candidate",
    prompt: "Add a new candidate named ",
    icon: Users,
  },
  {
    id: "list-passes",
    label: "View Openings",
    prompt: "Show me all current job openings",
    icon: ClipboardList,
  },
  {
    id: "analytics",
    label: "Analytics",
    prompt: "Show me the recruitment analytics and statistics",
    icon: Sparkles,
  },
];

export default function AiAssistant() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "Hello! I'm your AI recruitment assistant powered by Claude. I can **perform actions** in your recruitment system:\n\n**Actions I can take:**\n• Create new recruitment passes\n• Add candidates to the system\n• Link candidates to job openings\n• Schedule interviews\n• Update candidate status\n• Generate job descriptions\n\n**Information I can provide:**\n• List current passes and candidates\n• Show analytics and statistics\n• Give recruitment advice\n\nJust tell me what you need - for example:\n- \"Create a new position for Senior Developer in Engineering\"\n- \"Add a candidate named John Smith\"\n- \"Show me all open positions\"\n\nHow can I help you today?",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const chatMutation = useMutation({
    mutationFn: async (prompt: string) => {
      const response = await apiRequest("POST", "/api/ai/chat", { prompt });
      return response.json();
    },
    onSuccess: (data) => {
      const assistantMessage: Message = {
        id: Date.now().toString(),
        role: "assistant",
        content: data.response || data.message || "I apologize, but I encountered an issue processing your request. Please try again.",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantMessage]);
      
      // Invalidate queries if actions were performed
      if (data.actionsPerformed && data.actionsPerformed.length > 0) {
        queryClient.invalidateQueries({ queryKey: ["/api/passes"] });
        queryClient.invalidateQueries({ queryKey: ["/api/candidates"] });
        queryClient.invalidateQueries({ queryKey: ["/api/interviews"] });
        queryClient.invalidateQueries({ queryKey: ["/api/analytics"] });
      }
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to get AI response",
        variant: "destructive",
      });
      const errorMessage: Message = {
        id: Date.now().toString(),
        role: "assistant",
        content: "I apologize, but I encountered an error. Please try again.",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    },
  });

  const handleSend = () => {
    if (!input.trim() || chatMutation.isPending) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input.trim(),
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMessage]);
    chatMutation.mutate(input.trim());
    setInput("");
  };

  const handleQuickAction = (action: QuickAction) => {
    setInput(action.prompt);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold flex items-center gap-2" data-testid="text-page-title">
          <Sparkles className="w-6 h-6 text-green-600" strokeWidth={2} />
          AI Recruitment Assistant
        </h1>
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        {quickActions.map((action) => (
          <Button
            key={action.id}
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => handleQuickAction(action)}
            data-testid={`button-quick-${action.id}`}
          >
            <action.icon className="w-4 h-4" strokeWidth={2} />
            {action.label}
          </Button>
        ))}
      </div>

      <GlassCard className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex gap-3 ${message.role === "user" ? "justify-end" : "justify-start"}`}
            >
              {message.role === "assistant" && (
                <div className="w-8 h-8 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center flex-shrink-0">
                  <Bot className="w-4 h-4 text-green-600 dark:text-green-400" strokeWidth={2} />
                </div>
              )}
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                  message.role === "user"
                    ? "bg-green-600 text-white"
                    : "bg-muted"
                }`}
                data-testid={`message-${message.role}-${message.id}`}
              >
                <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                <p
                  className={`text-xs mt-1 ${
                    message.role === "user" ? "text-green-100" : "text-muted-foreground"
                  }`}
                >
                  {message.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
              {message.role === "user" && (
                <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
                  <User className="w-4 h-4 text-blue-600 dark:text-blue-400" strokeWidth={2} />
                </div>
              )}
            </div>
          ))}
          {chatMutation.isPending && (
            <div className="flex gap-3 justify-start" data-testid="loading-ai-response">
              <div className="w-8 h-8 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center flex-shrink-0">
                <Bot className="w-4 h-4 text-green-600 dark:text-green-400 animate-pulse" strokeWidth={2} />
              </div>
              <div className="max-w-[80%] rounded-2xl px-4 py-3 bg-muted">
                <Skeleton className="h-4 w-48 mb-2" />
                <Skeleton className="h-4 w-32" />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="p-4 border-t border-border/50">
          <div className="flex gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask me anything about recruitment..."
              className="min-h-[60px] resize-none"
              data-testid="input-ai-message"
            />
            <Button
              onClick={handleSend}
              disabled={!input.trim() || chatMutation.isPending}
              size="icon"
              className="h-auto bg-green-600 hover:bg-green-700"
              data-testid="button-send-message"
            >
              <Send className="w-5 h-5" strokeWidth={2} />
            </Button>
          </div>
        </div>
      </GlassCard>
    </div>
  );
}
