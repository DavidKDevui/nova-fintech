"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  tools?: string[];
};

interface AssistantContextValue {
  messages: Message[];
  input: string;
  setInput: (value: string) => void;
  loading: boolean;
  sendMessage: (content: string) => Promise<void>;
  resetConversation: () => void;
}

const AssistantContext = createContext<AssistantContextValue>({
  messages: [],
  input: "",
  setInput: () => {},
  loading: false,
  sendMessage: async () => {},
  resetConversation: () => {},
});

export function AssistantProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim() || loading) return;

    const userMessage: Message = { id: crypto.randomUUID(), role: "user", content: content.trim() };
    const assistantMessage: Message = { id: crypto.randomUUID(), role: "assistant", content: "" };

    setMessages((prev) => [...prev, userMessage, assistantMessage]);
    setInput("");
    setLoading(true);

    try {
      const allMessages = [...messages, userMessage].map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: allMessages }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        setMessages((prev) =>
          prev.map((m) => m.id === assistantMessage.id ? { ...m, content: `Erreur : ${errorText}` } : m)
        );
        setLoading(false);
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) { setLoading(false); return; }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6);
          if (data === "[DONE]") break;
          try {
            const parsed = JSON.parse(data);
            if (parsed.tools) {
              setMessages((prev) =>
                prev.map((m) => m.id === assistantMessage.id ? { ...m, tools: parsed.tools } : m)
              );
            }
            if (parsed.content) {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMessage.id
                    ? { ...m, content: m.content + parsed.content }
                    : m
                )
              );
            }
          } catch {
            // ignore parse errors
          }
        }
      }
    } catch {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMessage.id
            ? { ...m, content: "Une erreur est survenue. Veuillez réessayer." }
            : m
        )
      );
    }

    setLoading(false);
  }, [messages, loading]);

  const resetConversation = useCallback(() => {
    setMessages([]);
    setInput("");
  }, []);

  return (
    <AssistantContext.Provider value={{ messages, input, setInput, loading, sendMessage, resetConversation }}>
      {children}
    </AssistantContext.Provider>
  );
}

export function useAssistant() {
  return useContext(AssistantContext);
}

export type { Message };
