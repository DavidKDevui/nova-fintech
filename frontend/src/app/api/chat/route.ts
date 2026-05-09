import OpenAI from "openai";
import { eq } from "drizzle-orm";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { practitioners, bankAccounts } from "@/lib/db/schema";
import { buildFinancialContext } from "@/lib/ai/context-builder";
import { buildSystemPrompt } from "@/lib/ai/system-prompt";
import { toolDefinitions, createToolExecutors } from "@/lib/ai/tools";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Simple in-memory rate limiting
const rateLimits = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 60_000;

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const entry = rateLimits.get(userId);
  if (!entry || now > entry.resetAt) {
    rateLimits.set(userId, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count++;
  return true;
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session || session.accountType !== "practitioner") {
    return new Response("Non autorisé", { status: 401 });
  }

  if (!checkRateLimit(session.id)) {
    return new Response("Trop de requêtes. Réessayez dans quelques secondes.", { status: 429 });
  }

  const { messages } = await request.json() as {
    messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[];
  };

  // Get practitioner data for tool execution
  const [hp] = await db.select().from(practitioners).where(eq(practitioners.userId, session.id));
  if (!hp) return new Response("Profil requis", { status: 403 });

  const accs = await db.select({ id: bankAccounts.id }).from(bankAccounts).where(eq(bankAccounts.practitionerId, hp.id));
  const accountIds = accs.map((a) => a.id);

  // Build financial context
  const context = await buildFinancialContext(session.id);
  const systemPrompt = buildSystemPrompt(context);

  // Create tool executors with practitioner context
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const executors = createToolExecutors(hp.id, accountIds, hp as any);

  // Prepare messages with system prompt
  const allMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...messages,
  ];

  // Tool calling loop (max 3 rounds)
  const allToolsUsed: string[] = [];
  for (let round = 0; round < 3; round++) {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: allMessages,
      tools: toolDefinitions,
      stream: false,
    });

    const choice = response.choices[0]!;
    const message = choice.message;

    // If no tool calls, stream the final response
    if (!message.tool_calls || message.tool_calls.length === 0) {
      // Re-do the call with streaming for the final response
      const stream = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: allMessages,
        stream: true,
      });

      const encoder = new TextEncoder();
      const readable = new ReadableStream({
        async start(controller) {
          if (allToolsUsed.length > 0) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ tools: allToolsUsed })}\n\n`));
          }
          for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content;
            if (content) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content })}\n\n`));
            }
          }
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        },
      });

      return new Response(readable, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
        },
      });
    }

    // Execute tool calls — collect names for client display
    allMessages.push(message);
    for (const toolCall of message.tool_calls) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tc = toolCall as any;
      const fnName = tc.function.name as keyof typeof executors;
      const args = JSON.parse(tc.function.arguments);
      allToolsUsed.push(fnName);
      let result: string;
      try {
        const executor = executors[fnName];
        if (executor) {
          result = await executor(args);
        } else {
          result = `Outil "${fnName}" non disponible.`;
        }
      } catch (err) {
        console.error(`[AI Tool] ${fnName} error:`, err);
        result = "Erreur lors de l'exécution de l'outil.";
      }

      allMessages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: result,
      });
    }
    // Continue loop for next round
  }

  // If we exhausted rounds, do a final streaming call
  const stream = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: allMessages,
    stream: true,
  });

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      if (allToolsUsed.length > 0) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ tools: allToolsUsed })}\n\n`));
      }
      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content;
        if (content) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content })}\n\n`));
        }
      }
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}
