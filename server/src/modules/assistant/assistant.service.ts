import { env } from "@/common/env";

/* Every provider worth using here (Groq, xAI, OpenAI) speaks the same chat-completions
 * shape, so this is a plain fetch against a configurable base URL — no SDK dependency, and
 * switching provider is an environment change rather than a code change. */
function completionsUrl() {
  return `${env.assistantBaseUrl.replace(/\/+$/, "")}/chat/completions`;
}

/* The assistant speaks to prospective buyers on a public page, so the prompt does two jobs:
 * it states what LeadStack actually is (so answers stay true), and it fences the model in
 * (so it can't be talked into discussing anything else, quoting prices it invented, or
 * making commitments on the company's behalf). Answers are written to be *heard*, not read. */
const SYSTEM_PROMPT = `You are the voice assistant on LeadStack's website, speaking to a prospective buyer.

ABOUT LEADSTACK:
- An invite-only marketplace where approved buyers purchase exclusive B2B leads in India.
- Every lead is sold to exactly one buyer and stays exclusive to them for two months. Leads are never resold.
- Buyers filter by industry, city, state, service, company size, deal value and listing date, choose a quantity, see the total before paying, and pay by UPI or card through Razorpay.
- Before buying, a buyer sees the company, industry, location, what they need and helpful context. The contact person, phone number and email unlock only after purchase.
- Purchased leads live in the buyer's dashboard and can be exported at any time.
- There is no monthly subscription. Buyers pay only when they buy. Larger orders cost less per lead.
- Access requires requesting an account, which the team reviews before approving.

RULES:
- Never state a specific price per lead. Prices depend on order size and are shown in the buyer's dashboard before payment. If asked about cost, explain how pricing works, not what it costs.
- Never invent features, numbers, guarantees, refund terms, customer names or statistics. If you do not know, say so and offer to connect them with the team at support@equidamai.com.
- Only discuss LeadStack and the buyer's own sales problems. Politely decline anything else.
- Never promise approval, delivery dates, or results.

STYLE:
- You are being spoken aloud by a speech synthesiser. Two or three short sentences, maximum.
- Plain conversational English. No lists, no bullet points, no markdown, no emoji, no special characters.
- Write abbreviations as they should be pronounced, for example "U P I" rather than "UPI".
- End by inviting the next question or pointing them to request access, when it fits naturally.`;

export interface AssistantReply {
  reply: string;
  /** False when the model was unavailable — the client then uses its built-in answers. */
  answered: boolean;
}

export function isAssistantConfigured() {
  return Boolean(env.assistantApiKey);
}

/**
 * Answers one question from the landing page's voice assistant.
 *
 * Deliberately stateless and single-turn: the caller passes the visitor's question and gets
 * one spoken answer back. Conversation history isn't kept server-side because there's no
 * session for an anonymous visitor, and a public endpoint that accumulated per-caller state
 * would be trivially abusable.
 */
export async function askAssistant(question: string): Promise<AssistantReply> {
  if (!isAssistantConfigured()) {
    return { reply: "", answered: false };
  }

  // Anonymous public endpoint — a hung upstream must not hold a connection open indefinitely.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(completionsUrl(), {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.assistantApiKey}`,
      },
      body: JSON.stringify({
        model: env.assistantModel,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: question },
        ],
        // Capped low because the reply is spoken aloud — a long answer is worse, not better.
        max_tokens: 160,
        temperature: 0.4,
      }),
    });

    if (!response.ok) {
      return { reply: "", answered: false };
    }

    const data = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const reply = data.choices?.[0]?.message?.content?.trim();

    return reply ? { reply, answered: true } : { reply: "", answered: false };
  } catch {
    // Network failure, timeout, bad JSON — the client falls back to its canned answers,
    // so a broken model never leaves a visitor with silence.
    return { reply: "", answered: false };
  } finally {
    clearTimeout(timeout);
  }
}
