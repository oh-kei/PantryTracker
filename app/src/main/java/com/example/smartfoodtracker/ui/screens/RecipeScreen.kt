package com.example.smartfoodtracker.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Restaurant
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.smartfoodtracker.data.model.Recipe

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RecipeScreen(
    recipes: List<Recipe>,
    onCookRecipe: (String) -> Unit,
    onBack: () -> Unit
) {
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Smart Recipe Recommendations") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.primaryContainer)
            )
        }
    ) { padding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            item {
                Text(
                    "Recipes are ranked dynamically based on inventory coverage and your expiring items to minimise food waste.",
                    style = MaterialTheme.typography.bodyMedium
                )
            }

            if (recipes.isEmpty()) {
                item {
                    Box(modifier = Modifier.fillMaxWidth().padding(32.dp), contentAlignment = Alignment.Center) {
                        Text("No recipe recommendations available. Add more inventory items!", color = Color.Gray)
                    }
                }
            }

            items(recipes) { recipe ->
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    elevation = CardDefaults.cardElevation(3.dp)
                ) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(recipe.title, fontWeight = FontWeight.Bold, fontSize = 18.sp, modifier = Modifier.weight(1f))
                            Badge(containerColor = MaterialTheme.colorScheme.primary) {
                                Text("${recipe.matchPercentage}% Match", color = Color.White)
                            }
                        }

                        Text(recipe.description, style = MaterialTheme.typography.bodyMedium)

                        if (recipe.expiringIngredients.isNotEmpty()) {
                            Text(
                                "🔥 Uses expiring items: ${recipe.expiringIngredients.joinToString(", ")}",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.error,
                                fontWeight = FontWeight.Bold
                            )
                        }

                        if (recipe.missingIngredients.isNotEmpty()) {
                            Text(
                                "🛒 Missing: ${recipe.missingIngredients.joinToString(", ")}",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.secondary
                            )
                        }

                        if (recipe.substitutions.isNotEmpty()) {
                            Text(
                                "💡 Substitutions: ${recipe.substitutions.entries.joinToString { "${it.key} ➔ ${it.value}" }}",
                                style = MaterialTheme.typography.bodySmall
                            )
                        }

                        Divider()

                        Text("Steps:", fontWeight = FontWeight.Bold, fontSize = 14.sp)
                        recipe.steps.forEachIndexed { index, step ->
                            Text("${index + 1}. $step", fontSize = 13.sp)
                        }

                        Spacer(modifier = Modifier.height(4.dp))

                        Button(
                            onClick = { onCookRecipe(recipe.id) },
                            modifier = Modifier.fillMaxWidth(),
                            colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.primary)
                        ) {
                            Icon(Icons.Default.CheckCircle, contentDescription = null)
                            Spacer(modifier = Modifier.width(8.dp))
                            Text("I Cooked This (Deduct Inventory)")
                        }
                    }
                }
            }
        }
    }
}
