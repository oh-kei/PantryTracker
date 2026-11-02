package com.example.smartfoodtracker.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.smartfoodtracker.data.model.FoodItem
import com.example.smartfoodtracker.data.model.ScanResult
import com.example.smartfoodtracker.data.model.StorageLocation
import com.example.smartfoodtracker.data.model.UrgencyLevel
import java.time.LocalDate

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ConfirmationScreen(
    scannedResults: List<ScanResult>,
    onConfirmItems: (List<FoodItem>) -> Unit,
    onCancel: () -> Unit
) {
    // Mutable list of items being edited
    val editableItems = remember(scannedResults) {
        mutableStateListOf<FoodItem>().apply {
            addAll(
                scannedResults.map { scan ->
                    val today = LocalDate.now()
                    val expiry = today.plusDays(scan.estimatedShelfLifeDays.toLong())
                    FoodItem(
                        name = scan.name,
                        category = scan.category,
                        storageLocation = scan.storageLocation,
                        quantity = "1 unit",
                        buyDate = today.toString(),
                        expiryDate = expiry.toString(),
                        confidence = scan.confidence,
                        urgency = UrgencyLevel.SAFE
                    )
                }
            )
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Confirm Detected Items") },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.primaryContainer)
            )
        },
        bottomBar = {
            Surface(tonalElevation = 8.dp) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp),
                    horizontalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    OutlinedButton(
                        onClick = onCancel,
                        modifier = Modifier.weight(1f)
                    ) {
                        Text("Retake / Cancel")
                    }
                    Button(
                        onClick = { onConfirmItems(editableItems.toList()) },
                        modifier = Modifier.weight(1f)
                    ) {
                        Icon(Icons.Default.Check, contentDescription = null)
                        Spacer(modifier = Modifier.width(4.dp))
                        Text("Confirm & Save")
                    }
                }
            }
        }
    ) { padding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            item {
                Text(
                    "Review and adjust items identified by Gemini Vision. You can edit names, quantities, or remove incorrect items.",
                    style = MaterialTheme.typography.bodyMedium
                )
            }

            if (editableItems.isEmpty()) {
                item {
                    Text("No items detected. Try adding items manually.", color = MaterialTheme.colorScheme.error)
                }
            }

            items(editableItems) { item ->
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    elevation = CardDefaults.cardElevation(2.dp)
                ) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            OutlinedTextField(
                                value = item.name,
                                onValueChange = { newName ->
                                    val index = editableItems.indexOf(item)
                                    if (index != -1) {
                                        editableItems[index] = item.copy(name = newName)
                                    }
                                },
                                label = { Text("Item Name") },
                                modifier = Modifier.weight(1f)
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            IconButton(onClick = { editableItems.remove(item) }) {
                                Icon(Icons.Default.Delete, contentDescription = "Delete", tint = MaterialTheme.colorScheme.error)
                            }
                        }

                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            OutlinedTextField(
                                value = item.quantity,
                                onValueChange = { newQty ->
                                    val index = editableItems.indexOf(item)
                                    if (index != -1) {
                                        editableItems[index] = item.copy(quantity = newQty)
                                    }
                                },
                                label = { Text("Quantity") },
                                modifier = Modifier.weight(1f)
                            )
                            OutlinedTextField(
                                value = item.category,
                                onValueChange = { newCat ->
                                    val index = editableItems.indexOf(item)
                                    if (index != -1) {
                                        editableItems[index] = item.copy(category = newCat)
                                    }
                                },
                                label = { Text("Category") },
                                modifier = Modifier.weight(1f)
                            )
                        }

                        Text(
                            text = "Estimated Expiry: ${item.expiryDate} (Confidence: ${(item.confidence * 100).toInt()}%)",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.secondary,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }
            }
        }
    }
}
