package com.haridhayal.hermes.feature.settings

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import com.haridhayal.hermes.core.data.DevicePreferences
import com.haridhayal.hermes.core.data.DisclosurePreference
import com.haridhayal.hermes.core.data.TextSizePreference
import com.haridhayal.hermes.core.designsystem.HermesGroup
import com.haridhayal.hermes.core.designsystem.HermesRow
import com.haridhayal.hermes.core.designsystem.HermesRowDivider
import com.haridhayal.hermes.core.designsystem.HermesSearchField
import com.haridhayal.hermes.core.designsystem.HermesSectionLabel
import com.haridhayal.hermes.core.designsystem.HermesTopBar
import com.haridhayal.hermes.core.model.CatalogSummary
import com.haridhayal.hermes.core.model.MaintenanceStatusDto
import com.haridhayal.hermes.core.model.NotificationKind
import com.haridhayal.hermes.core.model.NotificationSettingsDto
import com.haridhayal.hermes.core.model.ProjectDto
import com.haridhayal.hermes.core.model.ThemePreference

internal val SETTINGS_SECTION_ORDER = listOf(
    "Appearance",
    "Agent",
    "Chat",
    "Notifications",
    "Scheduled",
    "Connection",
    "Archived projects",
    "Data",
    "About",
    "Device",
)

private val SETTINGS_SEARCH_TERMS = listOf(
    "theme text size reduce motion light dark appearance",
    "agent name assistant labels prompts approval",
    "chat tools thinking enter sends follow reply duration haptics",
    "notifications activity run approval question jobs firebase android",
    "scheduled jobs schedule prompt skills",
    "connection status endpoint catalogue models skills toolsets capabilities active runs",
    "archived projects restore delete transcript",
    "data database runs events prune media cache",
    "about version local preferences",
    "device unpair revoke credentials",
)

@Composable
fun SettingsScreen(
    host: String,
    agentName: String,
    agentSaveRevision: Long,
    status: String,
    preferences: DevicePreferences,
    catalogs: CatalogSummary,
    capabilities: String,
    activeRuns: Int,
    scheduledCount: Int,
    scheduledUnavailable: Boolean,
    archivedProjects: List<ProjectDto>,
    maintenance: MaintenanceStatusDto?,
    notifications: NotificationSettingsDto,
    firebaseAvailable: Boolean,
    notificationsBlocked: Boolean,
    version: String,
    onBack: () -> Unit,
    onPreferences: (DevicePreferences) -> Unit,
    onSaveAgentName: (String) -> Unit,
    onNotificationsEnabled: (Boolean) -> Unit,
    onNotificationKinds: (List<NotificationKind>) -> Unit,
    onTestNotification: () -> Unit,
    onOpenNotificationSettings: () -> Unit,
    onOpenJobs: () -> Unit,
    onRestoreArchived: (String) -> Unit,
    onDeleteArchived: (String) -> Unit,
    onClearCache: () -> Unit,
    onPrune: () -> Unit,
    onUnpair: () -> Unit,
) {
    var confirmDelete by remember { mutableStateOf<ProjectDto?>(null) }
    var confirmUnpair by remember { mutableStateOf(false) }
    var query by remember { mutableStateOf("") }
    val normalizedQuery = query.trim().lowercase()
    val visibleSections = SETTINGS_SECTION_ORDER.mapIndexed { index, title ->
        normalizedQuery.isBlank() || "$title ${SETTINGS_SEARCH_TERMS[index]}".lowercase().contains(normalizedQuery)
    }

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = { HermesTopBar("Settings", onBack) },
    ) { padding ->
        Column(
            Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 18.dp),
        ) {
            HermesSearchField(
                value = query,
                onValueChange = { query = it },
                placeholder = "Search settings",
                modifier = Modifier.padding(top = 8.dp, bottom = 30.dp),
            )

            if (visibleSections[0]) {
                SettingsSection(SETTINGS_SECTION_ORDER[0]) {
                    ChoiceRow("Theme", ThemePreference.entries, preferences.theme, ::themeLabel) {
                        onPreferences(preferences.copy(theme = it))
                    }
                    ChoiceRow("Text size", TextSizePreference.entries, preferences.textSize, { it.name }) {
                        onPreferences(preferences.copy(textSize = it))
                    }
                    SwitchRow("Reduce motion", "Also honours Android's animation preference", preferences.reducedMotion) {
                        onPreferences(preferences.copy(reducedMotion = it))
                    }
                }
            }

            if (visibleSections[1]) {
                SettingsSection(SETTINGS_SECTION_ORDER[1]) {
                    AgentNameField(
                        value = agentName,
                        revision = agentSaveRevision,
                        detail = "Used for labels, prompts, and approval copy on every client",
                        onSave = onSaveAgentName,
                    )
                }
            }

            if (visibleSections[2]) {
                SettingsSection(SETTINGS_SECTION_ORDER[2]) {
                    ChoiceRow("Tool calls", DisclosurePreference.entries, preferences.toolCalls, ::disclosureLabel) {
                        onPreferences(preferences.copy(toolCalls = it))
                    }
                    ChoiceRow("Thinking trace", DisclosurePreference.entries, preferences.thinking, ::disclosureLabel) {
                        onPreferences(preferences.copy(thinking = it))
                    }
                    SwitchRow("Enter sends", "Physical keyboards only; Shift+Enter inserts a newline", preferences.sendOnEnter) {
                        onPreferences(preferences.copy(sendOnEnter = it))
                    }
                    SwitchRow("Follow reply", null, preferences.autoScroll) {
                        onPreferences(preferences.copy(autoScroll = it))
                    }
                    SwitchRow("Show run duration", null, preferences.showRunDuration) {
                        onPreferences(preferences.copy(showRunDuration = it))
                    }
                    SwitchRow("Haptics", "One tick on send and completion", preferences.haptics) {
                        onPreferences(preferences.copy(haptics = it))
                    }
                }
            }

            if (visibleSections[3]) {
                SettingsSection(SETTINGS_SECTION_ORDER[3]) {
                    val available = firebaseAvailable && notifications.configured
                    SwitchRow(
                        "Hermes activity",
                        when {
                            !firebaseAvailable -> "Unavailable until google-services.json is added"
                            !notifications.configured -> "Firebase is not configured on this server"
                            notificationsBlocked -> "Blocked by Android; allow notifications in system settings"
                            else -> "${notifications.subscriptions} registered device${if (notifications.subscriptions == 1) "" else "s"}"
                        },
                        available && preferences.notificationsEnabled,
                        enabled = available,
                        onChecked = onNotificationsEnabled,
                    )
                    if (preferences.notificationsEnabled) {
                        NotificationKind.entries.forEach { kind ->
                            SwitchRow(
                                notificationKindLabel(kind),
                                null,
                                kind in notifications.kinds,
                                enabled = notifications.enabled,
                            ) { checked ->
                                val next = if (checked) notifications.kinds + kind else notifications.kinds - kind
                                onNotificationKinds(next.distinct())
                            }
                        }
                        ActionRow("Test notification", "Send an activity notification to this device", "Send", onTestNotification)
                    }
                    if (notificationsBlocked) {
                        ActionRow("Android notification settings", "Review app permission and channel access", "Open", onOpenNotificationSettings)
                    }
                }
            }

            if (visibleSections[4]) {
                SettingsSection(SETTINGS_SECTION_ORDER[4]) {
                    ActionRow(
                        "Scheduled jobs",
                        if (scheduledUnavailable) "Unavailable on this host" else "$scheduledCount configured",
                        "Open",
                        onOpenJobs,
                    )
                }
            }

            if (visibleSections[5]) {
                SettingsSection(SETTINGS_SECTION_ORDER[5]) {
                    ValueRow("Status", status)
                    ValueRow("Endpoint", host)
                    ValueRow("Models", catalogs.models)
                    ValueRow("Skills", catalogs.skills)
                    ValueRow("Toolsets", catalogs.toolsets)
                    ValueRow("Capabilities", capabilities)
                    ValueRow("Active runs", activeRuns.toString())
                }
            }

            if (visibleSections[6]) {
                SettingsSection(SETTINGS_SECTION_ORDER[6]) {
                    if (archivedProjects.isEmpty()) {
                        ValueRow("Archived projects", "None")
                    }
                    archivedProjects.forEach { project ->
                        ArchivedProjectRow(
                            project = project,
                            onRestore = { onRestoreArchived(project.id) },
                            onDelete = { confirmDelete = project },
                        )
                    }
                    ValueRow("Transcript retention", "Deleting app records does not delete gateway transcripts")
                }
            }

            if (visibleSections[7]) {
                SettingsSection(SETTINGS_SECTION_ORDER[7]) {
                    maintenance?.let {
                        ValueRow("Database", formatBytes(it.dbBytes))
                        ValueRow("Projects", "${it.projects} active · ${it.archivedProjects} archived")
                        ValueRow("Runs", "${it.runs} runs · ${it.runEvents} events · ${it.queued} queued")
                    } ?: ValueRow("Statistics", "Unavailable")
                    ActionRow("Run history", "Remove run events older than 24 hours", "Prune", onPrune)
                    ActionRow("Downloaded media", "Clear Android's local media cache", "Clear", onClearCache)
                }
            }

            if (visibleSections[8]) {
                SettingsSection(SETTINGS_SECTION_ORDER[8]) {
                    ValueRow("Version", version)
                    ValueRow("Preferences", "Appearance and chat choices stay on this device")
                }
            }

            if (visibleSections[9]) {
                SettingsSection(SETTINGS_SECTION_ORDER[9]) {
                    ActionRow("Unpair this device", "Revoke credentials and this notification target", "Unpair") {
                        confirmUnpair = true
                    }
                }
            }

            if (visibleSections.none { it }) {
                Text(
                    "No settings found",
                    modifier = Modifier.fillMaxWidth().padding(vertical = 48.dp),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    style = MaterialTheme.typography.bodyLarge,
                )
            }
            Spacer(Modifier.height(36.dp))
        }
    }

    confirmDelete?.let { project ->
        AlertDialog(
            onDismissRequest = { confirmDelete = null },
            title = { Text("Delete ${project.name}?") },
            text = { Text("This removes local Hermes app records. Gateway transcripts are left untouched.") },
            confirmButton = {
                TextButton(onClick = { onDeleteArchived(project.id); confirmDelete = null }) { Text("Delete") }
            },
            dismissButton = { TextButton(onClick = { confirmDelete = null }) { Text("Cancel") } },
        )
    }
    if (confirmUnpair) {
        AlertDialog(
            onDismissRequest = { confirmUnpair = false },
            title = { Text("Unpair this device?") },
            text = { Text("Local projects, chats, cached media, credentials, and this notification target will be removed.") },
            confirmButton = { TextButton(onClick = { confirmUnpair = false; onUnpair() }) { Text("Unpair") } },
            dismissButton = { TextButton(onClick = { confirmUnpair = false }) { Text("Cancel") } },
        )
    }
}

@Composable
private fun SettingsSection(title: String, content: @Composable ColumnScope.() -> Unit) {
    Column(Modifier.fillMaxWidth().padding(bottom = 28.dp)) {
        HermesSectionLabel(title)
        HermesGroup(content = content)
    }
}

@Composable
private fun AgentNameField(value: String, revision: Long, detail: String, onSave: (String) -> Unit) {
    var draft by remember { mutableStateOf(value) }
    var focused by remember { mutableStateOf(false) }
    val focusManager = LocalFocusManager.current
    LaunchedEffect(value, revision) { draft = value }
    fun save() {
        val normalized = draft.trim()
        if (normalized.isNotBlank() && normalized != value) onSave(normalized)
    }
    Column(
        Modifier
            .fillMaxWidth()
            .heightIn(min = 88.dp)
            .padding(horizontal = 18.dp, vertical = 13.dp),
        verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        Text("Agent name", style = MaterialTheme.typography.bodyLarge)
        BasicTextField(
            value = draft,
            onValueChange = { draft = it },
            modifier = Modifier.fillMaxWidth().onFocusChanged {
                if (focused && !it.isFocused) save()
                focused = it.isFocused
            },
            singleLine = true,
            textStyle = MaterialTheme.typography.bodyMedium.copy(color = MaterialTheme.colorScheme.onSurfaceVariant),
            cursorBrush = SolidColor(MaterialTheme.colorScheme.primary),
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
            keyboardActions = KeyboardActions(onDone = { save(); focusManager.clearFocus() }),
        )
        Text(detail, color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall)
    }
    HermesRowDivider()
}

@Composable
private fun <T> ChoiceRow(
    label: String,
    choices: List<T>,
    selected: T,
    labelFor: (T) -> String,
    onSelected: (T) -> Unit,
) {
    var selecting by remember { mutableStateOf(false) }
    HermesRow(label, labelFor(selected), onClick = { selecting = true })
    HermesRowDivider()
    if (selecting) {
        AlertDialog(
            onDismissRequest = { selecting = false },
            title = { Text(label) },
            text = {
                Column {
                    choices.forEach { choice ->
                        Row(
                            Modifier.fillMaxWidth().clickable {
                                onSelected(choice)
                                selecting = false
                            }.padding(vertical = 8.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            RadioButton(selected = choice == selected, onClick = null)
                            Text(labelFor(choice), modifier = Modifier.padding(start = 8.dp))
                        }
                    }
                }
            },
            confirmButton = {},
        )
    }
}

@Composable
private fun SwitchRow(
    label: String,
    detail: String?,
    checked: Boolean,
    enabled: Boolean = true,
    onChecked: (Boolean) -> Unit,
) {
    HermesRow(
        title = label,
        detail = detail,
        onClick = if (enabled) ({ onChecked(!checked) }) else null,
        trailing = { Switch(checked = checked, onCheckedChange = onChecked, enabled = enabled) },
    )
    HermesRowDivider()
}

@Composable
private fun ValueRow(label: String, value: String) {
    HermesRow(label, value)
    HermesRowDivider()
}

@Composable
private fun ActionRow(label: String, detail: String, action: String, onClick: () -> Unit) {
    HermesRow(
        title = label,
        detail = detail,
        onClick = onClick,
        trailing = {
            Text(action, color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Medium)
        },
    )
    HermesRowDivider()
}

@Composable
private fun ArchivedProjectRow(project: ProjectDto, onRestore: () -> Unit, onDelete: () -> Unit) {
    Column(Modifier.fillMaxWidth().padding(horizontal = 18.dp, vertical = 12.dp)) {
        Text("${project.emoji.orEmpty()} ${project.name}".trim(), style = MaterialTheme.typography.bodyLarge)
        Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            TextButton(onClick = onRestore) { Text("Restore") }
            TextButton(onClick = onDelete) { Text("Delete local record") }
        }
    }
    HermesRowDivider()
}

private fun themeLabel(value: ThemePreference): String = when (value) {
    ThemePreference.System -> "System default"
    ThemePreference.Light -> "Light"
    ThemePreference.Dark -> "Dark"
}

private fun disclosureLabel(value: DisclosurePreference): String = when (value) {
    DisclosurePreference.Hidden -> "Hidden"
    DisclosurePreference.Collapsed -> "Minimised"
    DisclosurePreference.Expanded -> "Expanded"
}

private fun notificationKindLabel(kind: NotificationKind): String = when (kind) {
    NotificationKind.Run -> "Run completed"
    NotificationKind.Approval -> "Approval needed"
    NotificationKind.Question -> "Question asked"
    NotificationKind.Job -> "Job completed"
    NotificationKind.JobFailed -> "Job failed"
}

private fun formatBytes(bytes: Long): String = when {
    bytes >= 1_048_576 -> "%.1f MB".format(bytes / 1_048_576.0)
    bytes >= 1_024 -> "%.1f KB".format(bytes / 1_024.0)
    else -> "$bytes bytes"
}
