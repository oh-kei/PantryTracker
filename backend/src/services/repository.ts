import type { Firestore } from 'firebase-admin/firestore';
import type { InventoryItem, UserPreferences } from '../../../shared/types';

/** Per-user persistence for inventory and preferences. Photos are never stored. */
export interface UserDataRepository {
  getInventory(uid: string): Promise<InventoryItem[]>;
  replaceInventory(uid: string, items: InventoryItem[]): Promise<void>;
  getPreferences(uid: string): Promise<UserPreferences | null>;
  setPreferences(uid: string, preferences: UserPreferences): Promise<void>;
  /** Delete everything stored for this user. */
  deleteAll(uid: string): Promise<void>;
}

export class MemoryRepository implements UserDataRepository {
  private readonly inventory = new Map<string, InventoryItem[]>();
  private readonly preferences = new Map<string, UserPreferences>();

  async getInventory(uid: string) {
    return this.inventory.get(uid) || [];
  }

  async replaceInventory(uid: string, items: InventoryItem[]) {
    this.inventory.set(uid, items);
  }

  async getPreferences(uid: string) {
    return this.preferences.get(uid) || null;
  }

  async setPreferences(uid: string, preferences: UserPreferences) {
    this.preferences.set(uid, preferences);
  }

  async deleteAll(uid: string) {
    this.inventory.delete(uid);
    this.preferences.delete(uid);
  }
}

/**
 * Firestore layout:
 *   users/{uid}                      -> { preferences, updatedAt }
 *   users/{uid}/inventory/{itemId}   -> InventoryItem
 */
export class FirestoreRepository implements UserDataRepository {
  constructor(private readonly db: Firestore) {}

  private user(uid: string) {
    return this.db.collection('users').doc(uid);
  }

  async getInventory(uid: string) {
    const snapshot = await this.user(uid).collection('inventory').get();
    return snapshot.docs.map(doc => doc.data() as InventoryItem);
  }

  async replaceInventory(uid: string, items: InventoryItem[]) {
    const collection = this.user(uid).collection('inventory');
    const existing = await collection.get();
    const keep = new Set(items.map(item => item.id));
    // Firestore batches are limited to 500 writes.
    const writes: Array<(batch: FirebaseFirestore.WriteBatch) => void> = [
      ...existing.docs.filter(doc => !keep.has(doc.id)).map(doc => (batch: FirebaseFirestore.WriteBatch) => { batch.delete(doc.ref); }),
      ...items.map(item => (batch: FirebaseFirestore.WriteBatch) => { batch.set(collection.doc(item.id), item); }),
    ];
    for (let i = 0; i < writes.length; i += 450) {
      const batch = this.db.batch();
      writes.slice(i, i + 450).forEach(write => write(batch));
      await batch.commit();
    }
  }

  async getPreferences(uid: string) {
    const doc = await this.user(uid).get();
    return (doc.data()?.preferences as UserPreferences | undefined) || null;
  }

  async setPreferences(uid: string, preferences: UserPreferences) {
    await this.user(uid).set({ preferences, updatedAt: new Date().toISOString() }, { merge: true });
  }

  async deleteAll(uid: string) {
    await this.db.recursiveDelete(this.user(uid));
  }
}
