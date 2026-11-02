package com.example.smartfoodtracker

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.smartfoodtracker.ui.screens.*
import com.example.smartfoodtracker.ui.theme.SmartFoodTrackerTheme
import com.example.smartfoodtracker.ui.viewmodel.FoodTrackerViewModel

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            SmartFoodTrackerTheme {
                val viewModel: FoodTrackerViewModel = viewModel()
                val currentScreen by viewModel.currentScreen.collectAsState()
                val inventory by viewModel.inventory.collectAsState()
                val recipes by viewModel.recipes.collectAsState()
                val scannedResults by viewModel.scannedResults.collectAsState()
                val isLoading by viewModel.isLoading.collectAsState()

                when (currentScreen) {
                    "home" -> HomeScreen(
                        inventory = inventory,
                        recipes = recipes,
                        onNavigateScan = { viewModel.setScreen("scan") },
                        onNavigateInventory = { viewModel.setScreen("inventory") },
                        onNavigateRecipes = { viewModel.setScreen("recipes") }
                    )
                    "scan" -> CameraScanScreen(
                        isLoading = isLoading,
                        onCapturePhoto = { base64 -> viewModel.scanImage(base64) },
                        onAddManualItem = { name, category, storage, qty, days ->
                            viewModel.addManualItem(name, category, storage, qty, days)
                        },
                        onBack = { viewModel.setScreen("home") }
                    )
                    "confirmation" -> ConfirmationScreen(
                        scannedResults = scannedResults,
                        onConfirmItems = { confirmed -> viewModel.confirmScannedItems(confirmed) },
                        onCancel = { viewModel.setScreen("scan") }
                    )
                    "inventory" -> InventoryScreen(
                        inventory = inventory,
                        onDeleteItem = { id -> viewModel.deleteItem(id) },
                        onNavigateScan = { viewModel.setScreen("scan") },
                        onBack = { viewModel.setScreen("home") }
                    )
                    "recipes" -> RecipeScreen(
                        recipes = recipes,
                        onCookRecipe = { id -> viewModel.consumeRecipe(id) },
                        onBack = { viewModel.setScreen("home") }
                    )
                }
            }
        }
    }
}
