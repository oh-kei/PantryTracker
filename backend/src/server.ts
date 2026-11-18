import dotenv from 'dotenv';
import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';
import { createApp } from './app';
import { fromReferenceDoc, Taxonomy } from './domain/taxonomy';
import { createLlmClients } from './services/llm';
import { MealDbSource } from './services/mealdb';
import { FirestoreRepository, MemoryRepository, UserDataRepository } from './services/repository';

dotenv.config();

const PORT = Number(process.env.PORT) || 4000;
const isProduction = process.env.NODE_ENV === 'production';

const initFirebase = (): admin.firestore.Firestore | null => {
  const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT ||
    path.resolve(process.cwd(), 'scripts/serviceAccountKey.json');
  try {
    if (!fs.existsSync(serviceAccountPath)) return null;
    const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    return admin.firestore();
  } catch (error) {
    console.error('Firebase initialisation failed:', (error as Error).message);
    return null;
  }
};

const main = async () => {
  const firestore = initFirebase();
  const taxonomy = new Taxonomy();

  if (firestore) {
    try {
      const snapshot = await firestore.collection('shelfLifeReference').get();
      let loaded = 0;
      snapshot.docs.forEach(doc => {
        const entry = fromReferenceDoc(doc.data());
        if (entry) { taxonomy.add(entry); loaded++; }
      });
      console.log(`Loaded ${loaded} shelf-life reference entries from Firestore`);
    } catch (error) {
      console.warn('Could not load shelfLifeReference from Firestore, using built-in table:', (error as Error).message);
    }
  }

  const repository: UserDataRepository = firestore ? new FirestoreRepository(firestore) : new MemoryRepository();
  const llm = createLlmClients();

  const recipes = new MealDbSource(process.env.MEALDB_BASE_URL || undefined);
  const app = createApp({
    llm,
    recipes,
    repository,
    taxonomy,
    verifyToken: firestore ? async token => (await admin.auth().verifyIdToken(token)).uid : undefined,
    // Device IDs are for local evaluation only; in production require Firebase Auth tokens.
    allowDeviceAuth: process.env.ALLOW_DEVICE_AUTH ? process.env.ALLOW_DEVICE_AUTH === 'true' : !isProduction,
    allowMockVision: process.env.ALLOW_MOCK_VISION ? process.env.ALLOW_MOCK_VISION === 'true' : !isProduction,
  });

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`SmartFoodTracker backend on port ${PORT}`);
    console.log(`  vision: ${llm.vision?.name || 'not configured'} | text: ${llm.text?.name || 'not configured'}`);
    console.log(`  storage: ${firestore ? 'Firestore' : 'in-memory (data is lost on restart)'} | taxonomy: ${taxonomy.size} ingredients`);
    // Warm the recipe catalogue so the first recommendation is fast.
    recipes.all()
      .then(list => console.log(`  recipes: ${list.length} loaded from TheMealDB`))
      .catch(error => console.warn('  recipes: catalogue not loaded yet, will search by ingredient:', (error as Error).message));
  });
};

main().catch(error => {
  console.error(error);
  process.exit(1);
});
