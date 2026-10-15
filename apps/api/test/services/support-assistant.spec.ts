import { ServiceUnavailableException } from '@nestjs/common';

import { askSupportAssistant } from '../../src/modules/support/support-assistant';

const ENV = { GROQ_API_KEY: 'fake', GROQ_MODEL: 'test-model' };
const QUESTION = [{ role: 'user' as const, content: 'How long is a hold?' }];

function groqAnswering(content: string, status = 200) {
  return jest.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status }));
}

function sentBody(fetchMock: jest.Mock) {
  return JSON.parse(fetchMock.mock.calls[0][1].body as string) as { messages: { role: string; content: string }[] };
}

describe('askSupportAssistant', () => {
  it("returns Groq's answer", async () => {
    const reply = await askSupportAssistant(ENV, QUESTION, groqAnswering('  24 hours.  ') as unknown as typeof fetch);

    expect(reply).toBe('24 hours.');
  });

  it('removes Markdown bold the model adds despite the plain-text rule', async () => {
    const reply = await askSupportAssistant(
      ENV,
      QUESTION,
      groqAnswering('Tap **For landlords**, then **Manage my properties**.') as unknown as typeof fetch,
    );

    expect(reply).toBe('Tap For landlords, then Manage my properties.');
  });

  it('grounds the question in the user manual', async () => {
    const fetchMock = groqAnswering('24 hours.');
    await askSupportAssistant(ENV, QUESTION, fetchMock as unknown as typeof fetch);

    expect(sentBody(fetchMock).messages[0]).toEqual({
      role: 'system',
      content: expect.stringContaining('## Reserving a room'),
    });
  });

  it("passes the student's messages after the manual", async () => {
    const fetchMock = groqAnswering('24 hours.');
    await askSupportAssistant(ENV, QUESTION, fetchMock as unknown as typeof fetch);

    expect(sentBody(fetchMock).messages.slice(1)).toEqual(QUESTION);
  });

  it('answers 503 when no Groq key is configured', async () => {
    await expect(
      askSupportAssistant({ GROQ_API_KEY: undefined, GROQ_MODEL: 'test-model' }, QUESTION, groqAnswering('x') as unknown as typeof fetch),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('answers 503 when Groq rejects the request', async () => {
    await expect(
      askSupportAssistant(ENV, QUESTION, groqAnswering('', 429) as unknown as typeof fetch),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
