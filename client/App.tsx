import React, { useState, useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import HomeScreen from './src/screens/HomeScreen';
import CameraScanScreen from './src/screens/CameraScanScreen';
import ConfirmationScreen from './src/screens/ConfirmationScreen';
import InventoryScreen from './src/screens/InventoryScreen';
import RecipeScreen from './src/screens/RecipeScreen';
import { FoodItem, Recipe, ScanResult, scanImageApi, fetchRecommendationsApi } from './src/services/api';

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<'home' | 'scan' | 'confirmation' | 'inventory' | 'recipes'>('home');
  const [inventory, setInventory] = useState<FoodItem[]>([
    {
      id: '1',
      name: 'Organic Spinach',
      category: 'Vegetables',
      storageLocation: 'FRIDGE',
      quantity: '1 bag',
      buyDate: new Date(Date.now() - 2 * 86400000).toISOString().split('T')[0],
      expiryDate: new Date(Date.now() + 2 * 86400000).toISOString().split('T')[0],
      urgency: 'WARNING'
    },
    {
      id: '2',
      name: 'Fresh Avocados',
      category: 'Fruits',
      storageLocation: 'FRIDGE',
      quantity: '3 units',
      buyDate: new Date(Date.now() - 1 * 86400000).toISOString().split('T')[0],
      expiryDate: new Date(Date.now() + 1 * 86400000).toISOString().split('T')[0],
      urgency: 'URGENT'
    },
    {
      id: '3',
      name: 'Greek Yogurt',
      category: 'Dairy & Eggs',
      storageLocation: 'FRIDGE',
      quantity: '500g',
      buyDate: new Date(Date.now() - 3 * 86400000).toISOString().split('T')[0],
      expiryDate: new Date(Date.now() + 5 * 86400000).toISOString().split('T')[0],
      urgency: 'SAFE'
    }
  ]);

  const [scannedResults, setScannedResults] = useState<ScanResult[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    loadRecipes(inventory);
  }, []);

  const loadRecipes = async (currentInventory: FoodItem[]) => {
    const recs = await fetchRecommendationsApi(currentInventory);
    setRecipes(recs);
  };

  const handleScanImage = async (imageBase64: string) => {
    setIsLoading(true);
    const results = await scanImageApi(imageBase64);
    setScannedResults(results);
    setIsLoading(false);
    setCurrentScreen('confirmation');
  };

  const handleConfirmItems = (confirmedItems: FoodItem[]) => {
    const updated = [...inventory, ...confirmedItems];
    setInventory(updated);
    setScannedResults([]);
    loadRecipes(updated);
    setCurrentScreen('inventory');
  };

  const handleAddManualItem = (name: string, category: string, storage: 'FRIDGE' | 'FREEZER' | 'PANTRY', quantity: string, days: number) => {
    const today = new Date();
    const expiry = new Date();
    expiry.setDate(today.getDate() + days);

    const diffDays = Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    const urgency = diffDays <= 2 ? 'URGENT' : diffDays <= 5 ? 'WARNING' : 'SAFE';

    const newItem: FoodItem = {
      id: `manual_${Date.now()}`,
      name,
      category,
      storageLocation: storage,
      quantity,
      buyDate: today.toISOString().split('T')[0],
      expiryDate: expiry.toISOString().split('T')[0],
      urgency
    };
    const updated = [...inventory, newItem];
    setInventory(updated);
    loadRecipes(updated);
  };

  const handleDeleteItem = (id: string) => {
    const updated = inventory.filter(item => item.id !== id);
    setInventory(updated);
    loadRecipes(updated);
  };

  const handleCookRecipe = (recipeId: string) => {
    // Remove one urgent item as part of cooking execution
    const urgentItem = inventory.find(i => i.urgency === 'URGENT' || i.urgency === 'WARNING') || inventory[0];
    if (urgentItem) {
      handleDeleteItem(urgentItem.id);
    }
  };

  return (
    <>
      <StatusBar style="auto" />
      {currentScreen === 'home' && (
        <HomeScreen
          inventory={inventory}
          recipes={recipes}
          onNavigateScan={() => setCurrentScreen('scan')}
          onNavigateInventory={() => setCurrentScreen('inventory')}
          onNavigateRecipes={() => setCurrentScreen('recipes')}
        />
      )}
      {currentScreen === 'scan' && (
        <CameraScanScreen
          isLoading={isLoading}
          onCapturePhoto={handleScanImage}
          onAddManualItem={handleAddManualItem}
          onBack={() => setCurrentScreen('home')}
        />
      )}
      {currentScreen === 'confirmation' && (
        <ConfirmationScreen
          scannedResults={scannedResults}
          onConfirmItems={handleConfirmItems}
          onCancel={() => setCurrentScreen('scan')}
        />
      )}
      {currentScreen === 'inventory' && (
        <InventoryScreen
          inventory={inventory}
          onDeleteItem={handleDeleteItem}
          onNavigateScan={() => setCurrentScreen('scan')}
          onBack={() => setCurrentScreen('home')}
        />
      )}
      {currentScreen === 'recipes' && (
        <RecipeScreen
          recipes={recipes}
          onCookRecipe={handleCookRecipe}
          onBack={() => setCurrentScreen('home')}
        />
      )}
    </>
  );
}
