package com.example.smartfoodtracker.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material.icons.filled.Kitchen
import androidx.compose.material.icons.filled.Restaurant
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.smartfoodtracker.data.model.FoodItem
import com.example.smartfoodtracker.data.model.Recipe
import com.example.smartfoodtracker.data.model.UrgencyLevel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(
    inventory: List<FoodItem>,
    recipes: List<Recipe>,
    onNavigateScan: () -> Unit,
    onNavigateInventory: () -> Unit,
    onNavigateRecipes: () -> Unit
) {
    val urgentCount = inventory.count { it.urgency == UrgencyLevel.URGENT || it.urgency == UrgencyLevel.WARNING }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Smart Food Tracker", fontWeight = FontWeight.Bold) },
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
            // Expiring Soon Summary Card
            item {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(
                        containerColor = if (urgentCount > 0) MaterialTheme.colorScheme.errorContainer else MaterialTheme.colorScheme.secondaryContainer
                    )
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Text(
                            text = if (urgentCount > 0) "⚠️ $urgentCount items need attention!" else "🎉 Your pantry is fresh!",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold
                        )
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(
                            text = "Snap a photo of your fridge or ingredients to automatically update inventory and find waste-free recipes.",
                            style = MaterialTheme.typography.bodyMedium
                        )
                        Spacer(modifier = Modifier.height(12.dp))
                        Button(
                            onClick = onNavigateScan,
                            colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.primary)
                        ) {
                            Icon(Icons.Default.CameraAlt, contentDescription = null)
                            Spacer(modifier = Modifier.width(8.dp))
                            Text("Scan Fridge / Food Photo")
                        }
                    }
                }
            }

            // Quick Actions
            item {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    Button(
                        onClick = onNavigateInventory,
                        modifier = Modifier.weight(1f),
                        colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.secondary)
                    ) {
                        Icon(Icons.Default.Kitchen, contentDescription = null)
                        Spacer(modifier = Modifier.width(4.dp))
                        Text("Pantry (${inventory.size})")
                    }
                    Button(
                        onClick = onNavigateRecipes,
                        modifier = Modifier.weight(1f),
                        colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.tertiary)
                    ) {
                        Icon(Icons.Default.Restaurant, contentDescription = null)
                        Spacer(modifier = Modifier.width(4.dp))
                        Text("Recipes (${recipes.size})")
                    }
                }
            }

            // Expiring items list preview
            item {
                Text("Items Expiring Soon", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            }

            items(inventory.filter { it.urgency != UrgencyLevel.SAFE }) { item ->
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    elevation = CardDefaults.cardElevation(2.dp)
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(12.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column {
                            Text(item.name, fontWeight = FontWeight.Bold, fontSize = 16.sp)
                            Text("Expires: ${item.expiryDate}", fontSize = 12.sp, color = MaterialTheme.colorScheme.error)
                        }
                        Badge(
                            containerColor = if (item.urgency == UrgencyLevel.URGENT) Color.Red else Color(
                                0xFFFFA500
                            )
                        ) {
                            Text(if (item.urgency == UrgencyLevel.URGENT) "Urgent" else "Warning", color = Color.White)
                        }
                    }
                }
            }
        }
    }
}
