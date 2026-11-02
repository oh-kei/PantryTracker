package com.example.smartfoodtracker.data.model

import java.util.UUID

enum class StorageLocation {
    FRIDGE, FREEZER, PANTRY
}

enum class UrgencyLevel {
    URGENT, WARNING, SAFE
}

data class FoodItem(
    val id: String = UUID.randomUUID().toString(),
    val name: String,
    val category: String,
    val storageLocation: StorageLocation = StorageLocation.FRIDGE,
    val quantity: String = "1 unit",
    val buyDate: String = "",
    val expiryDate: String = "",
    val confidence: Float = 1.0f,
    val urgency: UrgencyLevel = UrgencyLevel.SAFE
)
