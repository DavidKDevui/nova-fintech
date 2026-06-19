"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  tools?: string[];
};

// Outils qui MODIFIENT les données du praticien : quand l'un d'eux est exécuté
// par l'assistant, on incrémente `dataVersion` pour que les vues concernées
// (prévision de CA, cotisations…) se rafraîchissent automatiquement.
const MUTATING_TOOLS = new Set([
  "set_availability",
  "set_days_per_week",
  "add_ca_adjustment",
  "clear_ca_adjustments",
  "estimate_month_from_acts",
]);

interface AssistantContextValue {
  messages: Message[];
  input: string;
  setInput: (value: string) => void;
  loading: boolean;
  sendMessage: (content: string) => Promise<void>;
  resetConversation: () => void;
  /** Incrémenté à chaque exécution d'un outil mutant : signal de rafraîchissement. */
  dataVersion: number;
}

const AssistantContext = createContext<AssistantContextValue>({
  messages: [],
  input: "",
  setInput: () => {},
  loading: false,
  sendMessage: async () => {},
  resetConversation: () => {},
  dataVersion: 0,
});

export function AssistantProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [dataVersion, setDataVersion] = useState(0);

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
              // Un outil mutant a tourné → signal de rafraîchissement des vues.
              if (Array.isArray(parsed.tools) && parsed.tools.some((t: string) => MUTATING_TOOLS.has(t))) {
                setDataVersion((v) => v + 1);
              }
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
    <AssistantContext.Provider value={{ messages, input, setInput, loading, sendMessage, resetConversation, dataVersion }}>
      {children}
    </AssistantContext.Provider>
  );
}

export function useAssistant() {
  return useContext(AssistantContext);
}

export type { Message };
