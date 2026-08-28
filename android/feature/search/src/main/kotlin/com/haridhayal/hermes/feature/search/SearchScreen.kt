package com.haridhayal.hermes.feature.search

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.haridhayal.hermes.core.designsystem.HermesGroup
import com.haridhayal.hermes.core.designsystem.HermesRow
import com.haridhayal.hermes.core.designsystem.HermesRowDivider
import com.haridhayal.hermes.core.designsystem.HermesSearchField
import com.haridhayal.hermes.core.designsystem.HermesSectionLabel
import com.haridhayal.hermes.core.designsystem.HermesTopBar
import com.haridhayal.hermes.core.model.SearchResponse

@Composable
fun SearchScreen(
    result: SearchResponse?,
    onSearch: (String) -> Unit,
    onOpen: (String, String) -> Unit,
    onBack: () -> Unit,
) {
    var query by remember { mutableStateOf("") }
    val projects = result?.projects.orEmpty()
    val messages = result?.messages.orEmpty()
    val deliveries = result?.deliveries.orEmpty()
    val hasResults = projects.isNotEmpty() || messages.isNotEmpty() || deliveries.isNotEmpty()

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = { HermesTopBar("Search", onBack) },
    ) { padding ->
        LazyColumn(
            state = rememberLazyListState(),
            modifier = Modifier.fillMaxSize().padding(padding),
        ) {
            item {
                HermesSearchField(
                    value = query,
                    onValueChange = { query = it; onSearch(it) },
                    placeholder = "Projects and conversations",
                    modifier = Modifier.padding(horizontal = 18.dp, vertical = 10.dp),
                )
                Spacer(Modifier.height(18.dp))
            }
            if (projects.isNotEmpty()) {
                item {
                    ResultGroup("Projects") {
                        projects.forEach { hit ->
                            HermesRow(hit.name, hit.snippet.orEmpty())
                            HermesRowDivider()
                        }
                    }
                }
            }
            if (messages.isNotEmpty()) {
                item {
                    ResultGroup("Conversations") {
                        messages.forEach { hit ->
                            HermesRow(hit.projectName, hit.preview, onClick = { onOpen(hit.projectId, hit.sessionId) })
                            HermesRowDivider()
                        }
                    }
                }
            }
            if (deliveries.isNotEmpty()) {
                item {
                    ResultGroup("Scheduled activity") {
                        deliveries.forEach { hit ->
                            HermesRow(hit.jobName, hit.snippet, onClick = { onOpen(hit.projectId, hit.sessionId) })
                            HermesRowDivider()
                        }
                    }
                }
            }
            if (query.isBlank()) {
                item { SearchHint("Search projects, conversations, and scheduled job deliveries.") }
            } else if (result != null && !hasResults) {
                item { SearchHint("No results for “$query”.") }
            }
            item { Spacer(Modifier.height(36.dp)) }
        }
    }
}

@Composable
private fun ResultGroup(title: String, content: @Composable androidx.compose.foundation.layout.ColumnScope.() -> Unit) {
    Column(Modifier.fillMaxWidth().padding(horizontal = 18.dp, vertical = 10.dp)) {
        HermesSectionLabel(title)
        HermesGroup(content = content)
    }
}

@Composable
private fun SearchHint(text: String) {
    Text(
        text,
        modifier = Modifier.fillMaxWidth().padding(horizontal = 36.dp, vertical = 44.dp),
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        style = MaterialTheme.typography.bodyLarge,
    )
}
