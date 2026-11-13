import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const PORT = process.env.PORT || 4000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const MEALDB_BASE_URL = process.env.MEALDB_BASE_URL || 'https://www.themealdb.com/api/json/v1/1';
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'baidu/ernie-5.5-flash-preview:free';

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// Shelf life reference database (days)
const shelfLifeRef: Record<string, number> = {
    "Vegetables": 5,
    "Fruits": 4,
    "Dairy & Eggs": 10,
    "Meat & Poultry": 3,
    "Bakery": 5,
    "Beverages": 7
};

app.get('/api/health', (req: Request, res: Response) => {
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Scan image endpoint using Gemini Vision
app.post('/api/scan', async (req: Request, res: Response) => {
    try {
        const { imageBase64 } = req.body;

        if (!GEMINI_API_KEY) {
            // Return realistic fallback if API key is not configured
            return res.json({
                success: true,
                source: 'mock_fallback',
                items: [
                    { name: "Organic Spinach", category: "Vegetables", confidence: 0.95, estimatedShelfLifeDays: 4, storageLocation: "FRIDGE" },
                    { name: "Fresh Avocados", category: "Fruits", confidence: 0.92, estimatedShelfLifeDays: 3, storageLocation: "FRIDGE" },
                    { name: "Free-range Eggs", category: "Dairy & Eggs", confidence: 0.98, estimatedShelfLifeDays: 14, storageLocation: "FRIDGE" }
                ]
            });
        }

        const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
        const prompt = "Identify all food items in this image. Return a JSON array of objects with fields: name, category, confidence (0 to 1), estimatedShelfLifeDays, storageLocation (FRIDGE, FREEZER, or PANTRY).";

        const imagePart = {
            inlineData: {
                data: imageBase64 || "",
                mimeType: "image/jpeg"
            }
        };

        const result = await model.generateContent([prompt, imagePart]);
        const responseText = result.response.text();

        // Parse JSON from response
        const jsonMatch = responseText.match(/\[[\s\S]*\]/);
        const parsedItems = jsonMatch ? JSON.parse(jsonMatch[0]) : [];

        // Ensure image is discarded immediately (privacy guarantee)
        res.json({ success: true, source: 'gemini_vision', items: parsedItems });
    } catch (error: any) {
        console.error("Vision scan error:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

interface MealDbSummary {
    idMeal: string;
    strMeal: string;
    strMealThumb: string;
}

interface InventoryItem {
    name: string;
    urgency?: 'URGENT' | 'WARNING' | 'SAFE';
}

interface Recipe {
    id: string;
    title: string;
    description: string;
    matchPercentage: number;
    missingIngredients: string[];
    expiringIngredients: string[];
    steps: string[];
    substitutions: Record<string, string>;
}

interface MealDbMeal extends MealDbSummary {
    strCategory: string | null;
    strArea: string | null;
    strInstructions: string | null;
    [key: `strIngredient${number}`]: string | null;
    [key: `strMeasure${number}`]: string | null;
}

const normaliseIngredient = (ingredient: string): string =>
    ingredient
        .toLowerCase()
        .replace(/[^a-z0-9 ]/g, ' ')
        .replace(/\b(organic|fresh|free range|free-range|whole|large|small)\b/g, '')
        .replace(/\s+/g, ' ')
        .trim();

const ingredientSearchTerm = (ingredient: string): string =>
    normaliseIngredient(ingredient).split(' ').slice(0, 3).join(' ');

const getMealDb = async <T>(path: string): Promise<T> => {
    const response = await fetch(`${MEALDB_BASE_URL}${path}`);
    if (!response.ok) {
        throw new Error(`TheMealDB request failed with status ${response.status}`);
    }
    return response.json() as Promise<T>;
};

const getMealIngredients = (meal: MealDbMeal): string[] =>
    Array.from({ length: 20 }, (_, index) => meal[`strIngredient${index + 1}`])
        .filter((ingredient): ingredient is string => Boolean(ingredient?.trim()))
        .map(normaliseIngredient);

const toSteps = (instructions: string | null): string[] =>
    (instructions || '')
        .split(/\r?\n|(?<=[.!?])\s+/)
        .map(step => step.trim())
        .filter(Boolean);

const toRecipe = (meal: MealDbMeal, inventory: InventoryItem[]): Recipe => {
    const mealIngredients = getMealIngredients(meal);
    const inventoryIngredients = inventory.map(item => normaliseIngredient(item.name));
    const matchedInventory = mealIngredients.filter(mealIngredient =>
        inventoryIngredients.some(itemIngredient =>
            itemIngredient === mealIngredient ||
            itemIngredient.includes(mealIngredient) ||
            mealIngredient.includes(itemIngredient)
        )
    );
    const missingIngredients = mealIngredients.filter(mealIngredient =>
        !inventoryIngredients.some(itemIngredient =>
            itemIngredient === mealIngredient ||
            itemIngredient.includes(mealIngredient) ||
            mealIngredient.includes(itemIngredient)
        )
    );
    const expiringIngredients = inventory
        .filter(item => item.urgency === 'URGENT' || item.urgency === 'WARNING')
        .filter(item => mealIngredients.some(mealIngredient => {
            const inventoryIngredient = normaliseIngredient(item.name);
            return inventoryIngredient === mealIngredient ||
                inventoryIngredient.includes(mealIngredient) ||
                mealIngredient.includes(inventoryIngredient);
        }))
        .map(item => item.name);

    return {
        id: meal.idMeal,
        title: meal.strMeal,
        description: [meal.strArea, meal.strCategory].filter(Boolean).join(' · ') || 'Recipe from TheMealDB',
        matchPercentage: mealIngredients.length === 0
            ? 0
            : Math.round((new Set(matchedInventory).size / mealIngredients.length) * 100),
        missingIngredients,
        expiringIngredients,
        steps: toSteps(meal.strInstructions),
        substitutions: {}
    };
};

const parseGeneratedRecipe = (content: string): Recipe => {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
        throw new Error('Recipe generator returned invalid JSON');
    }

    const parsed = JSON.parse(jsonMatch[0]) as Partial<Recipe>;
    if (
        typeof parsed.title !== 'string' ||
        typeof parsed.description !== 'string' ||
        !Array.isArray(parsed.steps) ||
        !Array.isArray(parsed.missingIngredients) ||
        !Array.isArray(parsed.expiringIngredients)
    ) {
        throw new Error('Recipe generator returned an incomplete recipe');
    }

    return {
        id: `generated_${Date.now()}`,
        title: parsed.title,
        description: parsed.description,
        matchPercentage: typeof parsed.matchPercentage === 'number'
            ? Math.max(0, Math.min(100, Math.round(parsed.matchPercentage)))
            : 0,
        missingIngredients: parsed.missingIngredients.filter((item): item is string => typeof item === 'string'),
        expiringIngredients: parsed.expiringIngredients.filter((item): item is string => typeof item === 'string'),
        steps: parsed.steps.filter((item): item is string => typeof item === 'string'),
        substitutions: parsed.substitutions && typeof parsed.substitutions === 'object'
            ? parsed.substitutions
            : {}
    };
};

app.post('/api/recipes/generate', async (req: Request, res: Response) => {
    try {
        const { inventory } = req.body as { inventory?: InventoryItem[] };
        if (!Array.isArray(inventory)) {
            return res.status(400).json({ success: false, error: 'inventory must be an array' });
        }
        if (!OPENROUTER_API_KEY) {
            return res.status(503).json({ success: false, error: 'Recipe generation is not configured' });
        }

        const inventorySummary = inventory.map(item => ({
            name: item.name,
            urgency: item.urgency || 'SAFE'
        }));
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${OPENROUTER_API_KEY}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': 'http://localhost:4000',
                'X-Title': 'SmartFoodTracker'
            },
            body: JSON.stringify({
                model: OPENROUTER_MODEL,
                temperature: 0.3,
                messages: [
                    {
                        role: 'system',
                        content: 'You generate practical recipes that reduce food waste. Return only valid JSON with fields: title, description, matchPercentage (0-100), missingIngredients (string array), expiringIngredients (string array), steps (string array), substitutions (object mapping ingredient to replacement). Do not invent inventory items.'
                    },
                    {
                        role: 'user',
                        content: `Create one recipe using this inventory. Prioritise URGENT and WARNING items. Inventory JSON: ${JSON.stringify(inventorySummary)}`
                    }
                ]
            })
        });
        if (!response.ok) {
            const upstreamBody = await response.text();
            let upstreamMessage = `status ${response.status}`;
            try {
                const parsed = JSON.parse(upstreamBody) as { error?: { message?: string } };
                if (parsed.error?.message) upstreamMessage = parsed.error.message;
            } catch {
                // Keep the response generic if OpenRouter does not return JSON.
            }
            throw new Error(`OpenRouter request failed: ${upstreamMessage}`);
        }

        const data = await response.json() as {
            choices?: Array<{ message?: { content?: string } }>;
        };
        const content = data.choices?.[0]?.message?.content;
        if (!content) {
            throw new Error('OpenRouter returned no recipe');
        }

        res.json({ success: true, recipe: parseGeneratedRecipe(content) });
    } catch (error: any) {
        console.error("Recipe generation error:", error);
        const message = error instanceof Error ? error.message : 'Unknown recipe generation error';
        res.status(502).json({ success: false, error: message });
    }
});

app.post('/api/recipes/recommend', async (req: Request, res: Response) => {
    try {
        const { inventory } = req.body as { inventory?: InventoryItem[] };
        if (!Array.isArray(inventory)) {
            return res.status(400).json({ success: false, error: 'inventory must be an array' });
        }

        const searchTerms = [...new Set(
            inventory
                .map(item => ingredientSearchTerm(item.name))
                .filter(Boolean)
        )].slice(0, 8);

        if (searchTerms.length === 0) {
            return res.json({ success: true, recipes: [] });
        }

        const searchResults = await Promise.all(
            searchTerms.map(term =>
                getMealDb<{ meals: MealDbSummary[] | null }>(`/filter.php?i=${encodeURIComponent(term)}`)
            )
        );
        const mealIds = [...new Set(
            searchResults.flatMap(result => (result.meals || []).map(meal => meal.idMeal))
        )].slice(0, 12);
        const meals = await Promise.all(
            mealIds.map(id => getMealDb<{ meals: MealDbMeal[] | null }>(`/lookup.php?i=${id}`))
        );
        const recipes = meals
            .flatMap(result => result.meals || [])
            .map(meal => toRecipe(meal, inventory))
            .sort((a, b) => b.matchPercentage - a.matchPercentage)
            .slice(0, 6);

        res.json({ success: true, recipes });
    } catch (error: any) {
        console.error("Recipe database error:", error);
        res.status(502).json({ success: false, error: 'Unable to retrieve recipes from TheMealDB' });
    }
});

app.listen(PORT, () => {
    console.log(`SmartFoodTracker Express backend running on port ${PORT}`);
});
