package com.example.smartfoodtracker.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.smartfoodtracker.data.model.FoodItem
import com.example.smartfoodtracker.data.model.StorageLocation
import com.example.smartfoodtracker.data.model.UrgencyLevel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun InventoryScreen(
    inventory: List<FoodItem>,
    onDeleteItem: (String) -> Unit,
    onNavigateScan: () -> Unit,
    onBack: () -> Unit
) {
    var selectedFilter by remember { mutableStateOf("ALL") }

    val filteredList = when (selectedFilter) {
        "FRIDGE" -> inventory.filter { it.storageLocation == StorageLocation.FRIDGE }
        "URGENT" -> inventory.filter { it.urgency == UrgencyLevel.URGENT || it.urgency == UrgencyLevel.WARNING }
        else -> inventory
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Pantry Inventory") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    IconButton(onClick = onNavigateScan) {
                        Icon(Icons.Default.Add, contentDescription = "Add Item")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.primaryContainer)
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            // Filter Chips
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                FilterChip(
                    selected = selectedFilter == "ALL",
                    onClick = { selectedFilter = "ALL" },
                    label = { Text("All (${inventory.size})") }
                )
                FilterChip(
                    selected = selectedFilter == "FRIDGE",
                    onClick = { selectedFilter = "FRIDGE" },
                    label = { Text("Fridge") }
                )
                FilterChip(
                    selected = selectedFilter == "URGENT",
                    onClick = { selectedFilter = "URGENT" },
                    label = { Text("Expiring Soon") }
                )
            }

            if (filteredList.isEmpty()) {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .weight(1f),
                    contentAlignment = Alignment.Center
                ) {
                    Text("No inventory items found. Tap '+' to scan or add items.", color = Color.Gray)
                }
            } else {
                LazyColumn(
                    modifier = Modifier.fillMaxWidth().weight(1f),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    items(filteredList) { item ->
                        Card(
                            modifier = Modifier.fillMaxWidth(),
                            elevation = CardDefaults.cardElevation(2.dp),
                            colors = CardDefaults.cardColors(
                                containerColor = when (item.urgency) {
                                    UrgencyLevel.URGENT -> MaterialTheme.colorScheme.errorContainer
                                    UrgencyLevel.WARNING -> MaterialTheme.colorScheme.tertiaryContainer
                                    UrgencyLevel.SAFE -> MaterialTheme.colorScheme.surfaceVariant
                                }
                            )
                        ) {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(16.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(item.name, fontWeight = FontWeight.Bold, fontSize = 16.sp)
                                    Spacer(modifier = Modifier.height(2.dp))
                                    Text("Qty: ${item.quantity} | Category: ${item.category}", fontSize = 13.sp)
                                    Text("Expires: ${item.expiryDate}", fontSize = 12.sp, color = MaterialTheme.colorScheme.primary)
                                }
                                IconButton(onClick = { onDeleteItem(item.id) }) {
                                    Icon(Icons.Default.Delete, contentDescription = "Delete", tint = MaterialTheme.colorScheme.error)
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
