package com.haridhayal.hermes.feature.chat

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AttachFile
import androidx.compose.material.icons.outlined.Image
import androidx.compose.material.icons.outlined.Menu
import androidx.compose.material.icons.outlined.MoreVert
import androidx.compose.material.icons.outlined.Send
import androidx.compose.material.icons.outlined.Stop
import androidx.compose.material3.AssistChip
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.haridhayal.hermes.core.model.MessageDto
import com.haridhayal.hermes.core.model.StreamEventDto
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChatScreen(
    title: String,
    messages: List<MessageDto>,
    activity: List<StreamEventDto>,
    pendingCount: Int,
    running: Boolean,
    onMenu: () -> Unit,
    onSend: (String, List<Uri>) -> Unit,
    onApproval: (runId: String, choice: String, all: Boolean) -> Unit,
    onStop: () -> Unit,
    onNewChat: () -> Unit,
    onFork: () -> Unit,
    onRename: (String) -> Unit,
    onDelete: () -> Unit,
    onProjectSettings: () -> Unit,
) {
    var text by remember { mutableStateOf("") }
    var attachments by remember { mutableStateOf<List<Uri>>(emptyList()) }
    var menu by remember { mutableStateOf(false) }
    var renaming by remember { mutableStateOf(false) }
    var deleting by remember { mutableStateOf(false) }
    var renamedTitle by remember(title) { mutableStateOf(title) }
    val images = rememberLauncherForActivityResult(ActivityResultContracts.PickMultipleVisualMedia(8)) {
        attachments = attachments + it
    }
    val files = rememberLauncherForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) {
        attachments = attachments + it
    }
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(title) },
                navigationIcon = { IconButton(onClick = onMenu) { Icon(Icons.Outlined.Menu, "Open navigation") } },
                actions = {
                    if (running) IconButton(onClick = onStop) { Icon(Icons.Outlined.Stop, "Stop run") }
                    IconButton(onClick = { menu = true }) { Icon(Icons.Outlined.MoreVert, "Session actions") }
                    DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                        DropdownMenuItem(text = { Text("New chat") }, onClick = { menu = false; onNewChat() })
                        DropdownMenuItem(text = { Text("Fork branch") }, onClick = { menu = false; onFork() })
                        DropdownMenuItem(text = { Text("Rename") }, onClick = { menu = false; renaming = true })
                        DropdownMenuItem(text = { Text("Delete branch") }, onClick = { menu = false; deleting = true })
                        DropdownMenuItem(text = { Text("Project settings") }, onClick = { menu = false; onProjectSettings() })
                    }
                },
            )
        },
        bottomBar = {
            Column(Modifier.padding(12.dp)) {
                if (attachments.isNotEmpty()) Text("${attachments.size} attachment(s)", style = MaterialTheme.typography.labelMedium)
                Row(verticalAlignment = androidx.compose.ui.Alignment.Bottom) {
                    IconButton(onClick = { images.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) }) {
                        Icon(Icons.Outlined.Image, "Choose images")
                    }
                    IconButton(onClick = { files.launch(arrayOf("*/*")) }) { Icon(Icons.Outlined.AttachFile, "Choose files") }
                    OutlinedTextField(
                        value = text,
                        onValueChange = { text = it },
                        placeholder = { Text("Message Hermes") },
                        modifier = Modifier.weight(1f),
                        maxLines = 6,
                    )
                    IconButton(
                        onClick = { onSend(text, attachments); text = ""; attachments = emptyList() },
                        enabled = text.isNotBlank() || attachments.isNotEmpty(),
                    ) { Icon(Icons.Outlined.Send, "Send") }
                }
            }
        },
    ) { padding ->
        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(padding).padding(horizontal = 12.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            items(messages) { message -> MessageCard(message) }
            if (pendingCount > 0) item { AssistChip(onClick = {}, label = { Text("$pendingCount queued") }) }
            items(activity.takeLast(30)) { event -> ActivityCard(event, onApproval) }
        }
    }
    if (renaming) AlertDialog(
        onDismissRequest = { renaming = false },
        title = { Text("Rename chat") },
        text = { OutlinedTextField(renamedTitle, { renamedTitle = it }, label = { Text("Title") }) },
        confirmButton = { androidx.compose.material3.TextButton(onClick = { onRename(renamedTitle); renaming = false }) { Text("Save") } },
        dismissButton = { androidx.compose.material3.TextButton(onClick = { renaming = false }) { Text("Cancel") } },
    )
    if (deleting) AlertDialog(
        onDismissRequest = { deleting = false },
        title = { Text("Delete this branch?") },
        text = { Text("This removes the selected chat and all child branches.") },
        confirmButton = { androidx.compose.material3.TextButton(onClick = { onDelete(); deleting = false }) { Text("Delete") } },
        dismissButton = { androidx.compose.material3.TextButton(onClick = { deleting = false }) { Text("Cancel") } },
    )
}

@Composable
private fun MessageCard(message: MessageDto) {
    val user = message.role == "user"
    Row(Modifier.fillMaxWidth(), horizontalArrangement = if (user) Arrangement.End else Arrangement.Start) {
        Card(Modifier.fillMaxWidth(if (user) .86f else .96f)) {
            Column(Modifier.padding(14.dp)) {
                Text(if (user) "You" else if (message.role == "cron") "Scheduled job" else "Hermes", fontWeight = FontWeight.SemiBold)
                Text(message.content.orEmpty())
            }
        }
    }
}

@Composable
private fun ActivityCard(event: StreamEventDto, onApproval: (String, String, Boolean) -> Unit) {
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(12.dp)) {
            Text(event.type.replace('_', ' '), style = MaterialTheme.typography.labelLarge)
            val summary = event.payload["message"]?.jsonPrimitive?.contentOrNull
                ?: event.payload["text"]?.jsonPrimitive?.contentOrNull
            if (!summary.isNullOrBlank()) Text(summary)
            val runId = event.runId
            if (event.type.contains("approval", ignoreCase = true) && runId != null) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(onClick = { onApproval(runId, "once", false) }) { Text("Approve once") }
                    Button(onClick = { onApproval(runId, "always", true) }) { Text("Always") }
                    Button(onClick = { onApproval(runId, "deny", false) }) { Text("Deny") }
                }
            }
        }
    }
}
