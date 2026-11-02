package com.example.smartfoodtracker.ui.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.smartfoodtracker.data.api.BackendApiService
import com.example.smartfoodtracker.data.model.FoodItem
import com.example.smartfoodtracker.data.model.Recipe
import com.example.smartfoodtracker.data.model.ScanResult
import com.example.smartfoodtracker.data.model.StorageLocation
import com.example.smartfoodtracker.data.model.UrgencyLevel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit

class FoodTrackerViewModel : ViewModel() {
    private val apiService = BackendApiService()

    private val _inventory = MutableStateFlow<List<FoodItem>>(
        listOf(
            FoodItem(
                name = "Organic Spinach",
                category = "Vegetables",
                storageLocation = StorageLocation.FRIDGE,
                quantity = "1 bag",
                buyDate = LocalDate.now().minusDays(2).toString(),
                expiryDate = LocalDate.now().plusDays(2).toString(),
                urgency = UrgencyLevel.WARNING
            ),
            FoodItem(
                name = "Fresh Avocados",
                category = "Fruits",
                storageLocation = StorageLocation.FRIDGE,
                quantity = "3 units",
                buyDate = LocalDate.now().minusDays(1).toString(),
                expiryDate = LocalDate.now().plusDays(1).toString(),
                urgency = UrgencyLevel.URGENT
            ),
            FoodItem(
                name = "Greek Yogurt",
                category = "Dairy & Eggs",
                storageLocation = StorageLocation.FRIDGE,
                quantity = "500g",
                buyDate = LocalDate.now().minusDays(3).toString(),
                expiryDate = LocalDate.now().plusDays(5).toString(),
                urgency = UrgencyLevel.SAFE
            )
        )
    )
    val inventory: StateFlow<List<FoodItem>> = _inventory.asStateFlow()

    private val _scannedResults = MutableStateFlow<List<ScanResult>>(emptyList())
    val scannedResults: StateFlow<List<ScanResult>> = _scannedResults.asStateFlow()

    private val _recipes = MutableStateFlow<List<Recipe>>(emptyList())
    val recipes: StateFlow<List<Recipe>> = _recipes.asStateFlow()

    private val _currentScreen = MutableStateFlow("home")
    val currentScreen: StateFlow<String> = _currentScreen.asStateFlow()

    private val _isLoading = MutableStateFlow(false)
    val isLoading: StateFlow<Boolean> = _isLoading.asStateFlow()

    init {
        fetchRecipes()
    }

    fun setScreen(screen: String) {
        _currentScreen.value = screen
    }

    fun scanImage(imageUriOrBase64: String) {
        viewModelScope.launch {
            _isLoading.value = true
            val results = apiService.scanImage(imageUriOrBase64)
            _scannedResults.value = results
            _isLoading.value = false
            setScreen("confirmation")
        }
    }

    fun addManualItem(name: String, category: String, storage: StorageLocation, quantity: String, expiryDays: Int) {
        val today = LocalDate.now()
        val expiry = today.plusDays(expiryDays.toLong())
        val urgency = calculateUrgency(expiry.toString())

        val newItem = FoodItem(
            name = name,
            category = category,
            storageLocation = storage,
            quantity = quantity,
            buyDate = today.toString(),
            expiryDate = expiry.toString(),
            urgency = urgency
        )
        _inventory.update { current -> current + newItem }
        fetchRecipes()
    }

    fun confirmScannedItems(confirmedItems: List<FoodItem>) {
        _inventory.update { current -> current + confirmedItems }
        _scannedResults.value = emptyList()
        fetchRecipes()
        setScreen("inventory")
    }

    fun deleteItem(itemId: String) {
        _inventory.update { current -> current.filter { it.id != itemId } }
        fetchRecipes()
    }

    fun consumeRecipe(recipeId: String) {
        // Automatically deduct ingredients matching recipe or simulated consumption
        viewModelScope.launch {
            // Remove 1 urgent item as part of cooking
            val urgentItem = _inventory.value.minByOrNull { it.expiryDate }
            if (urgentItem != null) {
                deleteItem(urgentItem.id)
            }
            fetchRecipes()
        }
    }

    fun fetchRecipes() {
        viewModelScope.launch {
            val recs = apiService.getRecommendations(_inventory.value)
            _recipes.value = recs
        }
    }

    private fun calculateUrgency(expiryDateStr: String): UrgencyLevel {
        return try {
            val expiry = LocalDate.parse(expiryDateStr, DateTimeFormatter.ISO_DATE)
            val days = ChronoUnit.DAYS.between(LocalDate.now(), expiry)
            when {
                days <= 2 -> UrgencyLevel.URGENT
                days <= 5 -> UrgencyLevel.WARNING
                else -> UrgencyLevel.SAFE
            }
        } catch (e: Exception) {
            UrgencyLevel.SAFE
        }
    }
}
