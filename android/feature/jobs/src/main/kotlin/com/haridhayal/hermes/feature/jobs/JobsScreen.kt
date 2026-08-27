package com.haridhayal.hermes.feature.jobs

import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Card
import androidx.compose.material3.TextButton
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun JobsScreen(jobs: List<JsonObject>, unavailable: Boolean, onAction: (String, String) -> Unit) {
    Scaffold(topBar = { TopAppBar(title = { Text("Jobs") }) }) { padding ->
        LazyColumn(Modifier.fillMaxSize().padding(padding).padding(12.dp)) {
            if (unavailable) item { Text("Scheduled jobs are unavailable on this Hermes host.") }
            items(jobs) { job ->
                Card(Modifier.padding(vertical = 6.dp)) {
                    androidx.compose.foundation.layout.Column(Modifier.padding(16.dp)) {
                        Text(job["name"]?.jsonPrimitive?.contentOrNull ?: "Scheduled job")
                        val id = job["id"]?.jsonPrimitive?.contentOrNull
                        if (id != null) Row {
                            TextButton(onClick = { onAction(id, "run") }) { Text("Run") }
                            TextButton(onClick = { onAction(id, "pause") }) { Text("Pause") }
                            TextButton(onClick = { onAction(id, "resume") }) { Text("Resume") }
                        }
                    }
                }
            }
        }
    }
}
