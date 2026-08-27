package com.haridhayal.hermes.feature.search

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ListItem
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.haridhayal.hermes.core.model.SearchResponse

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SearchScreen(result: SearchResponse?, onSearch: (String) -> Unit, onOpen: (String, String) -> Unit) {
    var query by remember { mutableStateOf("") }
    Scaffold(topBar = { TopAppBar(title = { Text("Search") }) }) { padding ->
        Column(Modifier.fillMaxSize().padding(padding)) {
            OutlinedTextField(
                query,
                { query = it; onSearch(it) },
                label = { Text("Projects and conversations") },
                modifier = Modifier.fillMaxWidth().padding(12.dp),
            )
            LazyColumn {
                items(result?.projects.orEmpty()) { hit ->
                    ListItem(headlineContent = { Text(hit.name) }, supportingContent = { Text(hit.snippet.orEmpty()) })
                }
                items(result?.messages.orEmpty()) { hit ->
                    ListItem(
                        headlineContent = { Text(hit.projectName) },
                        supportingContent = { Text(hit.preview) },
                        modifier = Modifier.clickable { onOpen(hit.projectId, hit.sessionId) },
                    )
                }
                items(result?.deliveries.orEmpty()) { hit ->
                    ListItem(
                        headlineContent = { Text(hit.jobName) },
                        supportingContent = { Text(hit.snippet) },
                        modifier = Modifier.clickable { onOpen(hit.projectId, hit.sessionId) },
                    )
                }
            }
        }
    }
}
