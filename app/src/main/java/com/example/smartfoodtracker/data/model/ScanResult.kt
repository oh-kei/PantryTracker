package com.example.smartfoodtracker.data.model

data class ScanResult(
    val name: String,
    val category: String,
    val confidence: Float,
    val estimatedShelfLifeDays: Int,
    val storageLocation: StorageLocation = StorageLocation.FRIDGE
)
