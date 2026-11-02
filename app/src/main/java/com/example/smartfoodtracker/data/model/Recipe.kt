package com.example.smartfoodtracker.data.model

data class Recipe(
    val id: String,
    val title: String,
    val description: String,
    val matchPercentage: Int,
    val missingIngredients: List<String>,
    val expiringIngredients: List<String>,
    val steps: List<String>,
    val substitutions: Map<String, String> = emptyMap()
)
