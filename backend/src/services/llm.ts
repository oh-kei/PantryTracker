import { GoogleGenerativeAI } from '@google/generative-ai';

/** One raw detection from the vision model, before taxonomy mapping. */
export interface RawDetection {
  label: string;
  confidence: number;
  quantity: number;
  unit: string;
  group?: string;
  /** Use-by / best-before date as printed on the pack, YYYY-MM-DD (checked later). */
  printedDate?: string;
  ripeness?: 'unripe' | 'ripe' | 'overripe';
}

export interface VisionClient {
  readonly name: string;
  identifyFoods(imageBase64: string, mimeType: string): Promise<RawDetection[]>;
}

export interface TextClient {
  readonly name: string;
  /** Ask for a JSON response and return the parsed value (validation is the caller's job). */
  generateJson(system: string, prompt: string): Promise<unknown>;
}

const VISION_PROMPT = `You are a food recognition system for a kitchen inventory app.
Identify every distinct food item visible in the photo. Ignore containers, shelves and non-food objects.
Return ONLY a JSON object of the form {"items": [...]} (an empty array if there is no food). Each item must be:
{"label": string (common ingredient name, singular, e.g. "egg", "spinach", "cheddar cheese"),
 "confidence": number between 0 and 1,
 "quantity": integer count of visible units (1 if unsure),
 "unit": string ("unit", "bag", "bottle", "carton", "pack", "g"),
 "group": optional string naming the package when several items share one (e.g. "egg carton"),
 "printedDate": optional "YYYY-MM-DD", only if a use-by, best-before or expiry date is clearly legible on this item's packaging (never guess),
 "ripeness": optional, for fresh fruit and vegetables only: "unripe", "ripe" or "overripe" (brown spots, wilting, soft patches)}`;

/** Extract the first JSON value from a model response, tolerating code fences or prose. */
export const extractJson = (text: string): unknown => {
  const cleaned = text.replace(/```(?:json)?/gi, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/[[{][\s\S]*[\]}]/);
    if (!match) throw new Error('Model response did not contain JSON');
    return JSON.parse(match[0]);
  }
};

/** Validate and clean the vision model's output. */
export const parseDetections = (value: unknown): RawDetection[] => {
  const list = Array.isArray(value) ? value : Array.isArray((value as { items?: unknown })?.items)
    ? (value as { items: unknown[] }).items
    : [];
  return list.flatMap(entry => {
    if (!entry || typeof entry !== 'object') return [];
    const e = entry as Record<string, unknown>;
    const label = typeof e.label === 'string' ? e.label : typeof e.name === 'string' ? e.name : '';
    if (!label.trim()) return [];
    const confidence = Number(e.confidence);
    const quantity = Math.round(Number(e.quantity));
    return [{
      label: label.trim(),
      confidence: Number.isFinite(confidence) ? Math.min(1, Math.max(0, confidence)) : 0.5,
      quantity: Number.isFinite(quantity) && quantity > 0 ? Math.min(quantity, 99) : 1,
      unit: typeof e.unit === 'string' && e.unit.trim() ? e.unit.trim() : 'unit',
      group: typeof e.group === 'string' && e.group.trim() ? e.group.trim() : undefined,
      ...(typeof e.printedDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(e.printedDate.trim()) ? { printedDate: e.printedDate.trim() } : {}),
      ...(['unripe', 'ripe', 'overripe'].includes(e.ripeness as string) ? { ripeness: e.ripeness as RawDetection['ripeness'] } : {}),
    }];
  });
};

export class GeminiClient implements VisionClient, TextClient {
  readonly name = 'gemini';
  private readonly genAI: GoogleGenerativeAI;

  constructor(apiKey: string, private readonly model = 'gemini-2.5-flash') {
    this.genAI = new GoogleGenerativeAI(apiKey);
  }

  async identifyFoods(imageBase64: string, mimeType: string): Promise<RawDetection[]> {
    const model = this.genAI.getGenerativeModel({
      model: this.model,
      generationConfig: { responseMimeType: 'application/json', temperature: 0.1 },
    });
    const result = await model.generateContent([
      VISION_PROMPT,
      { inlineData: { data: imageBase64, mimeType } },
    ]);
    return parseDetections(extractJson(result.response.text()));
  }

  async generateJson(system: string, prompt: string): Promise<unknown> {
    const model = this.genAI.getGenerativeModel({
      model: this.model,
      systemInstruction: system,
      generationConfig: { responseMimeType: 'application/json', temperature: 0.3 },
    });
    const result = await model.generateContent(prompt);
    return extractJson(result.response.text());
  }
}

type ChatContent = string | Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }>;

/**
 * OpenRouter client (OpenAI-compatible API). Used when no Gemini key is configured:
 * text generation with `textModel`, photo recognition with `visionModel`
 * (which must accept image input).
 */
export class OpenRouterClient implements TextClient, VisionClient {
  readonly name = 'openrouter';

  constructor(
    private readonly apiKey: string,
    private readonly textModel: string,
    /** One or more image-capable models, tried in order (free models are often rate-limited). */
    private readonly visionModels: string[] = DEFAULT_OPENROUTER_VISION_MODELS,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private async chat(model: string, messages: Array<{ role: 'system' | 'user'; content: ChatContent }>, temperature: number): Promise<unknown> {
    const response = await this.fetchImpl('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'X-Title': 'SmartFoodTracker',
      },
      body: JSON.stringify({ model, temperature, response_format: { type: 'json_object' }, messages }),
    });
    if (!response.ok) {
      let message = `status ${response.status}`;
      try {
        const body = await response.json() as { error?: { message?: string; code?: number } };
        if (body.error?.message) message = body.error.message;
        if (response.status === 429 || body.error?.code === 429) message = `${model} is busy (rate-limited)`;
      } catch {
        // keep the generic message
      }
      throw new Error(`OpenRouter request failed: ${message}`);
    }
    const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('OpenRouter returned an empty response');
    return extractJson(content);
  }

  async generateJson(system: string, prompt: string): Promise<unknown> {
    return this.chat(this.textModel, [
      { role: 'system', content: system },
      { role: 'user', content: prompt },
    ], 0.3);
  }

  /**
   * The image is sent inline as a data URL and is not stored by this app.
   * Falls through the configured models until one answers.
   */
  async identifyFoods(imageBase64: string, mimeType: string): Promise<RawDetection[]> {
    let lastError: Error = new Error('No OpenRouter vision model configured');
    for (const model of this.visionModels) {
      try {
        const result = await this.chat(model, [{
          role: 'user',
          content: [
            { type: 'text', text: VISION_PROMPT },
            { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
          ],
        }], 0.1);
        return parseDetections(result);
      } catch (error) {
        lastError = error as Error;
      }
    }
    throw lastError;
  }
}

/** Free OpenRouter models that accept images. Override with OPENROUTER_VISION_MODEL (comma-separated). */
export const DEFAULT_OPENROUTER_VISION_MODELS = ['nvidia/nemotron-3.5-super-vl:free', 'google/gemma-4-31b-it:free'];

export interface LlmClients {
  vision: VisionClient | null;
  text: TextClient | null;
}

/** Gemini is preferred for both vision and text; OpenRouter covers whichever Gemini can't. */
export const createLlmClients = (env: NodeJS.ProcessEnv = process.env): LlmClients => {
  const geminiKey = env.GEMINI_API_KEY || '';
  const gemini = geminiKey ? new GeminiClient(geminiKey, env.GEMINI_MODEL || 'gemini-2.5-flash') : null;
  const openRouter = env.OPENROUTER_API_KEY
    ? new OpenRouterClient(
      env.OPENROUTER_API_KEY,
      env.OPENROUTER_MODEL || 'baidu/ernie-5.5-flash-preview:free',
      env.OPENROUTER_VISION_MODEL
        ? env.OPENROUTER_VISION_MODEL.split(',').map(m => m.trim()).filter(Boolean)
        : DEFAULT_OPENROUTER_VISION_MODELS,
    )
    : null;
  return { vision: gemini || openRouter, text: gemini || openRouter };
};
