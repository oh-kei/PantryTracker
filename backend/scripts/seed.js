import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import admin from "firebase-admin";
import OpenAI from "openai";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });
const scriptDir = path.dirname(new URL(import.meta.url).pathname);

// 1. Initialize Firebase Admin
const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT ||
  path.resolve(scriptDir, "serviceAccountKey.json");
const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf8"));
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});
const db = admin.firestore();

// 2. Initialize OpenRouter client
const client = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY, // Starts with sk-or-v1-...
  baseURL: "https://openrouter.ai/api/v1",
});

// 3. Load and simplify USDA FoodKeeper data
const rawFoodKeeper = JSON.parse(
  fs.readFileSync(path.resolve(scriptDir, "FoodKeeper-Data.json"), "utf8")
);
const productSheet = rawFoodKeeper.sheets.find((s) => s.name === "Product").data;

const usdaReference = productSheet.map((row) => ({
  name: row.Name,
  subtitle: row.Name_subtitle || "",
  pantryMin: row.Pantry_Min,
  pantryMax: row.Pantry_Max,
  pantryMetric: row.Pantry_Metric,
  fridgeMin: row.Refrigerate_Min,
  fridgeMax: row.Refrigerate_Max,
  fridgeMetric: row.Refrigerate_Metric,
  freezerMin: row.Freeze_Min,
  freezerMax: row.Freeze_Max,
  freezerMetric: row.Freeze_Metric,
}));

async function buildIngredientDatabase() {
  console.log("Fetching ingredients from TheMealDB...");
  const res = await fetch("https://www.themealdb.com/api/json/v1/1/list.php?i=list");
  if (!res.ok) {
    throw new Error(`TheMealDB request failed with status ${res.status}`);
  }
  const data = await res.json();
  const mealDbIngredients = data.meals || [];

  console.log(`Found ${mealDbIngredients.length} ingredients. Mapping shelf lives...`);

  const chunkSize = 50;
  for (let i = 0; i < mealDbIngredients.length; i += chunkSize) {
    const chunk = mealDbIngredients.slice(i, i + chunkSize);

    const prompt = `
You are building a food expiry database. Map each ingredient from TheMealDB list below to the closest shelf-life rules in the USDA FoodKeeper dataset.
Convert all time metrics (Weeks, Months, Years) into exact integer DAYS (e.g., 1 week = 7, 1 month = 30, 1 year = 365).
If an item cannot be safely stored in a location (like raw chicken in the pantry), set that location to null.
For dry spices, herbs, and condiments not explicitly listed in USDA data, assign reasonable pantry defaults (e.g., 365 to 730 days).

Return ONLY a valid JSON object with an "items" array matching this exact schema:
{
  "items": [
    {
      "canonicalId": "lowercase_snake_case_name",
      "mealDbId": "exact idIngredient string",
      "mealDbName": "exact strIngredient string",
      "category": "Produce | Dairy & Eggs | Meat & Seafood | Pantry & Dry Goods | Condiments & Sauces | Spices & Herbs | Bakery | Beverages",
      "defaultStorage": "pantry | fridge | freezer",
      "aliases": ["common", "alternative", "names"],
      "shelfLifeDays": {
        "pantry": { "min": 0, "max": 0 } | null,
        "fridge": { "min": 0, "max": 0 } | null,
        "freezer": { "min": 0, "max": 0 } | null
      }
    }
  ]
}

TheMealDB Ingredients to map:
${JSON.stringify(chunk.map((item) => ({ id: item.idIngredient, name: item.strIngredient })))}

USDA FoodKeeper Reference Data:
${JSON.stringify(usdaReference)}
`;

    const completion = await client.chat.completions.create({
      model: "baidu/ernie-5.5-flash-preview:free",
      messages: [
        { role: "system", content: "You are a structured data assistant that outputs strict JSON only." },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.1,
    });

    const rawContent = completion.choices[0]?.message?.content;
    if (!rawContent) {
      throw new Error("OpenRouter returned no mapping content");
    }
    const rawText = rawContent
      .replace(/^```json\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();

    const parsed = JSON.parse(rawText);
    const mappedItems = parsed.items || parsed;

    const batch = db.batch();
    for (const item of mappedItems) {
      const docRef = db.collection("shelfLifeReference").doc(item.canonicalId);
      batch.set(docRef, item);
    }
    await batch.commit();

    console.log(`Committed ${Math.min(i + chunkSize, mealDbIngredients.length)} / ${mealDbIngredients.length}`);
  }

  console.log("Successfully seeded shelfLifeReference collection in Firestore!");
}

buildIngredientDatabase().catch(console.error);
