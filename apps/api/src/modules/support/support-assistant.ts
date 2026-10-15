import { Logger, ServiceUnavailableException } from '@nestjs/common';

import { SUPPORT_MANUAL, type SupportAskInput } from '@campushomes/shared';

import type { Env } from '../../config/env';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
// Under the web client's 15s API_TIMEOUT_MS, so the student sees our message, not a timeout.
const TIMEOUT_MS = 12_000;
const UNAVAILABLE = 'CampusHomes AI is not available right now. Try the user manual or contact us.';

const manualText = SUPPORT_MANUAL.map(
  (section) => `## ${section.title}\n${section.steps.map((step) => `- ${step}`).join('\n')}`,
).join('\n\n');

// The model has no tools and no account data: it answers from the manual
// only, so a prompt-injected reply can at worst be off-topic text.
export const SUPPORT_SYSTEM_PROMPT = `You are CampusHomes AI, the support assistant for CampusHomes, a platform listing inspected student hostels near Makerere University in Uganda.

Answer questions about using CampusHomes using only the manual below. Keep answers short and friendly, in plain text with no Markdown (no asterisks or headings). Use numbered steps only when giving steps.

Rules:
- If the manual does not cover the question, say you are not sure and suggest the Contact tab (WhatsApp or a message to our team).
- You cannot see anyone's account, reservations, listings or prices. Never invent prices, availability, phone numbers or policies.
- Never ask for passwords or sign-in codes.
- For safety concerns or disputes, direct the person to contact our team.
- Politely decline questions unrelated to CampusHomes or student housing.

Manual:
${manualText}`;

const logger = new Logger('SupportAssistant');

export async function askSupportAssistant(
  env: Pick<Env, 'GROQ_API_KEY' | 'GROQ_MODEL'>,
  messages: SupportAskInput['messages'],
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  if (!env.GROQ_API_KEY) throw new ServiceUnavailableException(UNAVAILABLE);

  let res: Response;
  try {
    res = await fetchImpl(GROQ_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: env.GROQ_MODEL,
        messages: [{ role: 'system', content: SUPPORT_SYSTEM_PROMPT }, ...messages],
        temperature: 0.2,
        max_tokens: 500,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    logger.warn(`Groq request failed: ${err instanceof Error ? err.name : 'unknown'}`);
    throw new ServiceUnavailableException(UNAVAILABLE);
  }
  if (!res.ok) {
    // Status only; the body can echo the request.
    logger.warn(`Groq answered ${res.status}`);
    throw new ServiceUnavailableException(UNAVAILABLE);
  }

  const body = (await res.json().catch(() => null)) as { choices?: { message?: { content?: unknown } }[] } | null;
  const reply = body?.choices?.[0]?.message?.content;
  if (typeof reply !== 'string' || !reply.trim()) {
    logger.warn('Groq returned no answer');
    throw new ServiceUnavailableException(UNAVAILABLE);
  }
  // The page shows plain text; models still add **bold** now and then.
  return reply.replace(/\*\*(.+?)\*\*/g, '$1').trim();
}
