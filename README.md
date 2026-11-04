# SmartFoodTracker 🥗📱

SmartFoodTracker is an intelligent kitchen management and recipe planning application designed to reduce household food waste through automated visual inventory tracking, shelf-life estimation, and constraint-based recipe generation.

---

## 🌟 Key Features & Architecture

### 1. Automated Visual Recognition & Camera Capture
- **Expo Camera Integration**: Users can photograph their fridge interior or individual produce items directly from the mobile app.
- **Gemini Vision API**: The captured image is forwarded to the backend and processed using Google's multimodal **Gemini 1.5 Flash** model to detect food items, categories, confidence scores, and estimate shelf-life expiration dates.
- **Privacy Guarantee**: Fridge photos are processed in-transit and discarded immediately—they are **never** persisted on servers.

### 2. Confirmation UI & Manual Fallbacks
- **Editable Review List**: Detected items appear with confidence scores and estimated shelf-life days, allowing users to verify, rename, adjust quantities, or delete incorrect detections.
- **Manual Entry Fallback**: Users can manually add food items at any time, ensuring the app remains fully functional even without camera access or internet connectivity.

### 3. Smart Inventory Management
- **Urgency Badges**: Inventory items are automatically categorised by storage location (Fridge, Freezer, Pantry) and sorted by expiration urgency with clear color-coded indicators.
- **Inventory Deduction**: Completing a recipe ("I Cooked This") automatically deducts the consumed ingredients from the pantry.

### 4. Expiry-Driven Recommendation & Substitution Engine
- **Ranked Recipes**: Recipes are scored and ranked dynamically based on inventory coverage and expiration urgency (`Score = w1*coverage + w2*urgency + w3*preference`).
- **Culinary Substitutions**: For missing ingredients, the system suggests intelligent culinary alternatives based on flavour profiles and properties.

---

## 🛠️ Tech Stack

- **Mobile Client**: React Native (Expo) + TypeScript (`/client`) sharing types and interfaces with the server.
- **Backend API**: Node.js + Express + TypeScript (`/backend`), connecting to Gemini API (`@google/generative-ai`).
- **Continuous Integration**: GitHub Actions CI workflow (`.github/workflows/ci.yml`) for automated client typechecking and backend compilation.
- **Deployment**: Docker containerization (`backend/Dockerfile`).

---

## 🚀 Getting Started

### 1. Running the React Native Client
1. Navigate to the `client` directory:
   ```bash
   cd client
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start Expo development server:
   ```bash
   npx expo start
   ```

### 2. Running the Express Backend API
1. Navigate to the `backend` directory:
   ```bash
   cd backend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Set your Gemini API key in an `.env` file (optional; falls back to simulated intelligent mock data if not provided):
   ```env
   PORT=4000
   GEMINI_API_KEY=your_gemini_api_key_here
   ```
4. Start the development server:
   ```bash
   npm run dev
   ```

---

## 🚢 CI/CD & Deployment

- **CI Pipeline**: Automated on every push/PR via [ci.yml](file:///C:/Users/kei/AndroidStudioProjects/SmartFoodTracker/.github/workflows/ci.yml).
- **Docker**: Build and run the backend container:
  ```bash
  docker build -t smart-food-tracker-backend ./backend
  docker run -p 4000:4000 -e GEMINI_API_KEY=your_key smart-food-tracker-backend
  ```
