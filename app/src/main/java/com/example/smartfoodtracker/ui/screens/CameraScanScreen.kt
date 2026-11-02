package com.example.smartfoodtracker.ui.screens

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Camera
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.core.content.ContextCompat
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.smartfoodtracker.data.model.StorageLocation

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CameraScanScreen(
    isLoading: Boolean,
    onCapturePhoto: (String) -> Unit,
    onAddManualItem: (String, String, StorageLocation, String, Int) -> Unit,
    onBack: () -> Unit
) {
    val context = LocalContext.current
    var hasCameraPermission by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED
        )
    }

    val permissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission()
    ) { granted ->
        hasCameraPermission = granted
    }

    LaunchedEffect(Unit) {
        if (!hasCameraPermission) {
            permissionLauncher.launch(Manifest.permission.CAMERA)
        }
    }

    var showManualDialog by remember { mutableStateOf(false) }
    var manualName by remember { mutableStateOf("") }
    var manualCategory by remember { mutableStateOf("Produce") }
    var manualQuantity by remember { mutableStateOf("1 unit") }
    var manualDays by remember { mutableStateOf("7") }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Scan or Add Food") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.primaryContainer)
            )
        }
    ) { padding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(24.dp),
            contentAlignment = Alignment.Center
        ) {
            if (isLoading) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    CircularProgressIndicator()
                    Spacer(modifier = Modifier.height(16.dp))
                    Text("Gemini Vision is identifying items & estimating shelf-life...", fontWeight = FontWeight.Medium)
                }
            } else {
                Column(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(20.dp)
                ) {
                    Icon(
                        Icons.Default.Camera,
                        contentDescription = null,
                        modifier = Modifier.size(80.dp),
                        tint = MaterialTheme.colorScheme.primary
                    )
                    Text(
                        "Photograph Your Fridge or Items",
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.Bold
                    )
                    Text(
                        "Capture a clear photo of your fridge interior or produce. Images are processed in-transit by Gemini Vision and never persisted on servers.",
                        style = MaterialTheme.typography.bodyMedium,
                        modifier = Modifier.padding(horizontal = 16.dp)
                    )

                    Spacer(modifier = Modifier.height(16.dp))

                    Button(
                        onClick = {
                            // Simulate successful camera capture triggering Gemini vision
                            onCapturePhoto("mock_captured_image_base64")
                        },
                        modifier = Modifier.fillMaxWidth().height(50.dp),
                        shape = RoundedCornerShape(12.dp)
                    ) {
                        Text("Capture Photo & Analyze", fontSize = 16.sp)
                    }

                    OutlinedButton(
                        onClick = { showManualDialog = true },
                        modifier = Modifier.fillMaxWidth().height(50.dp),
                        shape = RoundedCornerShape(12.dp)
                    ) {
                        Icon(Icons.Default.Edit, contentDescription = null)
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("Manual Entry Fallback", fontSize = 16.sp)
                    }
                }
            }

            if (showManualDialog) {
                AlertDialog(
                    onDismissRequest = { showManualDialog = false },
                    title = { Text("Add Item Manually") },
                    text = {
                        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            OutlinedTextField(
                                value = manualName,
                                onValueChange = { manualName = it },
                                label = { Text("Food Item Name") }
                            )
                            OutlinedTextField(
                                value = manualCategory,
                                onValueChange = { manualCategory = it },
                                label = { Text("Category (e.g. Vegetables)") }
                            )
                            OutlinedTextField(
                                value = manualQuantity,
                                onValueChange = { manualQuantity = it },
                                label = { Text("Quantity (e.g. 2 units)") }
                            )
                            OutlinedTextField(
                                value = manualDays,
                                onValueChange = { manualDays = it },
                                label = { Text("Shelf life in days") }
                            )
                        }
                    },
                    confirmButton = {
                        Button(onClick = {
                            val daysInt = manualDays.toIntOrNull() ?: 7
                            if (manualName.isNotBlank()) {
                                onAddManualItem(manualName, manualCategory, StorageLocation.FRIDGE, manualQuantity, daysInt)
                                showManualDialog = false
                                onBack()
                            }
                        }) {
                            Text("Add to Pantry")
                        }
                    },
                    dismissButton = {
                        TextButton(onClick = { showManualDialog = false }) {
                            Text("Cancel")
                        }
                    }
                )
            }
        }
    }
}
