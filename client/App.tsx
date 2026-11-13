import React, { useState, useEffect, useRef } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Alert } from 'react-native';
import HomeScreen from './src/screens/HomeScreen';
import CameraScanScreen from './src/screens/CameraScanScreen';
import ConfirmationScreen from './src/screens/ConfirmationScreen';
import InventoryScreen from './src/screens/InventoryScreen';
import RecipeScreen from './src/screens/RecipeScreen';
import { FoodItem, Recipe, ScanResult, scanImageApi, fetchRecommendationsApi, generateRecipeApi, inferCategory } from './src/services/api';

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
  const [isGeneratingRecipe, setIsGeneratingRecipe] = useState(false);
  const recipeRequestId = useRef(0);

  useEffect(() => {
    loadRecipes(inventory);
  }, [inventory]);

  const loadRecipes = async (currentInventory: FoodItem[]) => {
    const requestId = ++recipeRequestId.current;
    try {
      const recs = await fetchRecommendationsApi(currentInventory);
      if (requestId === recipeRequestId.current) {
        setRecipes(recs);
      }
    } catch (error) {
      console.error('Recipe recommendations failed:', error);
    }
  };

  const handleGenerateRecipe = async () => {
    setIsGeneratingRecipe(true);
    try {
      const generatedRecipe = await generateRecipeApi(inventory);
      setRecipes(currentRecipes => [generatedRecipe, ...currentRecipes]);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('Recipe generation failed:', message);
      Alert.alert('Recipe generation failed', message);
    } finally {
      setIsGeneratingRecipe(false);
    }
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
      category: inferCategory(name) === 'Other' ? category : inferCategory(name),
      storageLocation: storage,
      quantity,
      buyDate: today.toISOString().split('T')[0],
      expiryDate: expiry.toISOString().split('T')[0],
      urgency
    };
    setInventory([...inventory, newItem]);
  };

  const handleEditItem = (id: string, name: string, category: string, quantity: string, days: number) => {
    const today = new Date();
    const expiry = new Date(today);
    expiry.setDate(today.getDate() + days);
    const diffDays = Math.ceil((expiry.getTime() - today.getTime()) / 86400000);
    const urgency: FoodItem['urgency'] = diffDays <= 2 ? 'URGENT' : diffDays <= 5 ? 'WARNING' : 'SAFE';
    const updated = inventory.map(item => item.id === id ? {
      ...item,
      name,
      category: category === item.category ? category : (inferCategory(name) === 'Other' ? category : inferCategory(name)),
      quantity,
      buyDate: today.toISOString().split('T')[0],
      expiryDate: expiry.toISOString().split('T')[0],
      urgency
    } : item);
    setInventory(updated);
  };

  const handleDeleteItem = (id: string) => {
    const updated = inventory.filter(item => item.id !== id);
    setInventory(updated);
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
          onEditItem={handleEditItem}
          onNavigateScan={() => setCurrentScreen('scan')}
          onBack={() => setCurrentScreen('home')}
        />
      )}
      {currentScreen === 'recipes' && (
        <RecipeScreen
          recipes={recipes}
          isGenerating={isGeneratingRecipe}
          onGenerateRecipe={handleGenerateRecipe}
          onCookRecipe={handleCookRecipe}
          onBack={() => setCurrentScreen('home')}
        />
      )}
    </>
  );
}
