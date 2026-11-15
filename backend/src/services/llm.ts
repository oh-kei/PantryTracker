import { GoogleGenerativeAI } from '@google/generative-ai';

/** One raw detection from the vision model, before taxonomy mapping. */
export interface RawDetection {
  label: string;
  confidence: number;
  quantity: number;
  unit: string;
  group?: string;
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
Return ONLY a JSON array. Each element must be:
{"label": string (common ingredient name, singular, e.g. "egg", "spinach", "cheddar cheese"),
 "confidence": number between 0 and 1,
 "quantity": integer count of visible units (1 if unsure),
 "unit": string ("unit", "bag", "bottle", "carton", "pack", "g"),
 "group": optional string naming the package when several items share one (e.g. "egg carton")}`;

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

/** OpenRouter text fallback, used when no Gemini key is configured. */
export class OpenRouterClient implements TextClient {
  readonly name = 'openrouter';

  constructor(private readonly apiKey: string, private readonly model: string) {}

  async generateJson(system: string, prompt: string): Promise<unknown> {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'X-Title': 'SmartFoodTracker',
      },
      body: JSON.stringify({
        model: this.model,
        temperature: 0.3,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: prompt },
        ],
      }),
    });
    if (!response.ok) {
      let message = `status ${response.status}`;
      try {
        const body = await response.json() as { error?: { message?: string } };
        if (body.error?.message) message = body.error.message;
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
}

export interface LlmClients {
  vision: VisionClient | null;
  text: TextClient | null;
}

export const createLlmClients = (env: NodeJS.ProcessEnv = process.env): LlmClients => {
  const geminiKey = env.GEMINI_API_KEY || '';
  const gemini = geminiKey ? new GeminiClient(geminiKey, env.GEMINI_MODEL || 'gemini-2.5-flash') : null;
  const openRouter = env.OPENROUTER_API_KEY
    ? new OpenRouterClient(env.OPENROUTER_API_KEY, env.OPENROUTER_MODEL || 'baidu/ernie-5.5-flash-preview:free')
    : null;
  return { vision: gemini, text: gemini || openRouter };
};
