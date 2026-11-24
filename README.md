# Smart Recipe Planner (SmartFoodTracker)

COMP4521 Group 12. A React Native + Node.js app that cuts household food waste. You photograph your fridge, confirm what it found, and it tracks expiry and suggests recipes that use up the food closest to going off.

Core flow: **scan → confirm → track → cook**

## Features (mapped to the proposal)

| Proposal | What's implemented | Where |
|---|---|---|
| 4.1 Photo capture | Expo camera with "single item" / "whole fridge" modes. Photos are compressed on the phone to ≤ 1 MB before upload. | `client/src/screens/ScanScreen.tsx` |
| 4.2 Classification | The vision model (Gemini, or OpenRouter's free image models) returns labels, confidence, quantity and grouping, plus any legible printed use-by date and the ripeness of produce. Labels are mapped onto a canonical ingredient taxonomy. The image is never stored or logged. | `backend/src/app.ts` (`/api/scan`), `services/llm.ts`, `domain/taxonomy.ts` |
| 4.3 Confirmation UI | Editable list with confidence chips (low-confidence items are highlighted). You can edit, delete, merge or add items. Manual entry works with no network, suggests foods as you type, and offers one-tap "Recently added" shortcuts. | `client/src/screens/ConfirmationScreen.tsx` |
| 4.4 Inventory records | Each record stores canonical ID, quantity + unit, storage location, buy date and an expiry range. | `shared/types.d.ts` (`InventoryItem`) |
| 5 Expiry estimation | Shelf-life reference table (built-in USDA FoodKeeper subset, overridden by the Firestore `shelfLifeReference` collection). Foods missing from the table get a validated, clamped AI estimate, labelled as such. Overripe or unripe produce shortens or lengthens the estimate. Estimates are date ranges, and the printed date overrides them: it's read from the photo when legible, or set with quick buttons (+3 days … +1 year) or a calendar. Red/amber/green tiers are derived from the date every time, never stored. Disclaimer shown. | `backend/src/domain/{taxonomy,expiry,shelfLife}.ts`, `backend/src/services/shelfLife.ts`, `client/src/components/ExpiryDateField.tsx` |
| 6.1 Ingredient matching | Recipes and inventory share the same taxonomy, matched on whole words (so "egg" never matches "eggplant"). | `backend/src/domain/normalise.ts` |
| 6.2 Feasibility filter | Allergens (9) and diets (vegetarian, pescatarian, vegan), with exceptions (peanut butter isn't dairy). | `backend/src/domain/dietary.ts` |
| 6.3 Ranking | `S = 0.5·coverage + 0.3·urgency + 0.2·preference`. Preference = favourite cuisines + cooking history. Every recipe is ranked, not only the ones a search returns: TheMealDB (about 790), DummyJSON (50, with photos) and 28 built-in basic recipes (scrambled eggs, egg fried rice, French toast…), cached for a day. If DummyJSON is down it's skipped. | `backend/src/domain/ranking.ts`, `services/{mealdb,recipeSources}.ts`, `data/basicRecipes.ts` |
| 6.4 Missing-ingredient display | Match %, expiring chips, missing chips, servings, "why this recipe". Pantry staples are not counted. | `RecipeListScreen.tsx`, `RecipeDetailScreen.tsx` |
| 6.5 Substitutions | Rules by culinary role (fat, acid, thickener, binder, protein base…). Items you already own are preferred. Gemini fills gaps, and its output is validated and allergen-checked. You accept or reject each one. | `backend/src/domain/substitution.ts` |
| 6.6 LLM adaptation | Offered when no stored recipe covers ≥ 50% of the inventory. Only names + urgency are sent. Strict JSON schema validation, then the same ranking. | `backend/src/domain/generatedRecipe.ts` |
| 6.7 Inventory update | "I cooked this" lets you adjust how much of each item (and each accepted substitute) was used, then deducts it. | `RecipeDetailScreen.tsx`, `client/src/domain/inventory.ts` |
| 7 UI | Home dashboard, scan & confirm, inventory grouped by storage with swipe to edit/use/delete, recipe list & detail with tickable steps, settings. | `client/src/screens/` |
| 8 Privacy | Photos are never persisted. "Delete all my data" wipes the phone and the server. Each request is scoped to a user (Firebase ID token, or a per-install device ID in dev). | `backend/src/middleware/auth.ts` |

### Architecture

```
shared/types.d.ts          types shared by client and server (import type only)
backend/src
  domain/                  pure, framework-free logic (expiry, taxonomy, ranking, dietary, substitution)
  services/                Gemini/OpenRouter, TheMealDB, Firestore/in-memory repository
  middleware/auth.ts       Firebase token or dev device ID
  app.ts                   Express routes (createApp is injectable for tests)
  server.ts                wires real services and listens
client/src
  domain/                  pure logic (expiry tiers, grouping, deduction)
  data/api.ts              the only place that calls fetch
  store/                   Zustand (inventory + preferences persisted with AsyncStorage)
  hooks/                   TanStack Query (recipes, substitutions) + offline-first server sync
  navigation/              React Navigation: bottom tabs + native stack
  screens/, components/    UI only
```

The inventory is **offline-first**. The phone's store is the source of truth, and changes are pushed to `PUT /api/inventory` (Firestore when configured). A fresh install pulls the server copy.

## Running it

### Backend

```bash
cd backend
npm install
cp .env.example .env     # add OPENROUTER_API_KEY (or GEMINI_API_KEY)
npm run dev              # http://localhost:4000/api/health
```

Secrets go in `backend/.env` (not the repo root) and are gitignored:

| Secret | Where | Enables |
| --- | --- | --- |
| `OPENROUTER_API_KEY` | `backend/.env` | Photo recognition (free image models in `OPENROUTER_VISION_MODEL`, tried in order) plus AI recipes and substitutions |
| `GEMINI_API_KEY` (optional) | `backend/.env` | When set, it's used instead of OpenRouter |
| Firebase service account JSON | `backend/scripts/serviceAccountKey.json` (or the `FIREBASE_SERVICE_ACCOUNT` env var) | Firestore storage for inventory and preferences, plus the shelf-life table (about 1,000 entries) |

The startup log shows what's active, for example `vision: openrouter | text: openrouter` and `storage: Firestore`. If there's no AI key, `/api/scan` returns demo detections (labelled as such in the app) and AI recipes are turned off. If there's no service account, data is kept in memory. Free OpenRouter models share rate limits, so a scan sometimes fails with "busy". Retrying usually works. To populate the Firestore shelf-life table, run `npm run seed`; it needs both a service account and an OpenRouter key.

### Client

Requires **Node.js 22.13+** (Expo SDK 58).

```bash
cd client
npm install
cp .env.example .env     # set EXPO_PUBLIC_API_URL to your laptop's LAN IP for a physical phone
npx expo start
```

- **iPhone / Android phone:** install **Expo Go** from the App Store / Play Store. Scan the QR code with the iPhone Camera app, or with the scanner inside Expo Go on Android. The phone and laptop must be on the same Wi-Fi.
- **Android emulator:** press `a` in the Expo terminal, or run `npx expo run:android` for a full native build.

### Tests, lint, CI

```bash
cd backend && npm run typecheck && npm run lint && npm test
cd client  && npm run typecheck && npm run lint && npm test
```

The tests cover expiry-tier boundaries, ranking weights, the scripted scenario "5 items expiring in 2 days", the feasibility filter, substitution filtering, generated-recipe validation, every API endpoint (Supertest), and the inventory and confirmation screens (React Native Testing Library). Vision, LLM and TheMealDB use recorded fixtures, so CI never calls a live API. GitHub Actions runs all of this on every PR.

### Docker

```bash
docker build -f backend/Dockerfile -t smart-food-tracker-backend .
docker run -p 4000:4000 -e GEMINI_API_KEY=your_key smart-food-tracker-backend
```

In production (`NODE_ENV=production`), device-ID auth and demo detections are off. Requests must carry a Firebase ID token.

## Known limitations

- The client doesn't sign in with Firebase Auth yet. It uses a per-install device ID, which the backend only accepts outside production. To switch, call `setAuthTokenProvider(() => auth.currentUser?.getIdToken())` in `client/src/data/api.ts` once a Firebase web config is added.
- Local storage uses AsyncStorage rather than MMKV, so the app still runs in Expo Go. MMKV needs a dev build.
- TheMealDB has no servings field, so database recipes show "serves about 4".
