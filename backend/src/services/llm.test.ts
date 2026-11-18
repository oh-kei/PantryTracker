import { createLlmClients, OpenRouterClient } from './llm';

const okResponse = (content: string) =>
  new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });

describe('OpenRouterClient', () => {
  it('sends the photo as an inline image to the vision model and parses detections', async () => {
    const fetchImpl = jest.fn(async () => okResponse('{"items":[{"label":"eggs","confidence":0.9,"quantity":6,"unit":"unit"}]}'));
    const client = new OpenRouterClient('key', 'text-model', ['vision-model'], fetchImpl as unknown as typeof fetch);

    const detections = await client.identifyFoods('QUJD', 'image/jpeg');

    expect(detections).toEqual([{ label: 'eggs', confidence: 0.9, quantity: 6, unit: 'unit', group: undefined }]);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe('vision-model');
    expect(body.messages[0].content[1]).toEqual({ type: 'image_url', image_url: { url: 'data:image/jpeg;base64,QUJD' } });
  });

  it('uses the text model for text and surfaces API errors', async () => {
    const fetchImpl = jest.fn()
      .mockResolvedValueOnce(okResponse('```json\n{"title":"x"}\n```'))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: 'Rate limit exceeded' } }), { status: 429 }));
    const client = new OpenRouterClient('key', 'text-model', ['vision-model'], fetchImpl as unknown as typeof fetch);

    await expect(client.generateJson('sys', 'prompt')).resolves.toEqual({ title: 'x' });
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body).model).toBe('text-model');
    await expect(client.identifyFoods('QUJD', 'image/jpeg')).rejects.toThrow('vision-model is busy (rate-limited)');
  });

  it('falls back to the next vision model when one is rate-limited', async () => {
    const fetchImpl = jest.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: 'Provider returned error', code: 429 } }), { status: 429 }))
      .mockResolvedValueOnce(okResponse('{"items":[{"label":"apple","confidence":0.8}]}'));
    const client = new OpenRouterClient('key', 'text-model', ['busy-model', 'backup-model'], fetchImpl as unknown as typeof fetch);

    const detections = await client.identifyFoods('QUJD', 'image/jpeg');

    expect(detections.map(d => d.label)).toEqual(['apple']);
    expect(fetchImpl.mock.calls.map(call => JSON.parse(call[1].body).model)).toEqual(['busy-model', 'backup-model']);
  });
});

describe('createLlmClients', () => {
  it('prefers Gemini, falls back to OpenRouter for vision and text', () => {
    expect(createLlmClients({})).toEqual({ vision: null, text: null });
    const openRouterOnly = createLlmClients({ OPENROUTER_API_KEY: 'k' });
    expect(openRouterOnly.vision?.name).toBe('openrouter');
    expect(openRouterOnly.text?.name).toBe('openrouter');
    const both = createLlmClients({ OPENROUTER_API_KEY: 'k', GEMINI_API_KEY: 'g' });
    expect(both.vision?.name).toBe('gemini');
    const custom = createLlmClients({ OPENROUTER_API_KEY: 'k', OPENROUTER_VISION_MODEL: ' a , b ' }) as unknown as { vision: { visionModels: string[] } };
    expect(custom.vision.visionModels).toEqual(['a', 'b']);
  });
});
