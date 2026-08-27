package com.haridhayal.hermes.feature.settings

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Slider
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.haridhayal.hermes.core.data.DisplayPreferences
import com.haridhayal.hermes.core.model.ThemePreference

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    host: String,
    agentName: String,
    status: String,
    preferences: DisplayPreferences,
    catalogs: Triple<String, String, String>,
    onPreferences: (DisplayPreferences) -> Unit,
    onSaveAgentName: (String) -> Unit,
    onClearCache: () -> Unit,
    onPrune: () -> Unit,
    onUnpair: () -> Unit,
) {
    var name by remember(agentName) { mutableStateOf(agentName) }
    Scaffold(topBar = { TopAppBar(title = { Text("Settings") }) }) { padding ->
        Column(Modifier.fillMaxSize().padding(padding).padding(16.dp).verticalScroll(rememberScrollState())) {
            Text("Server: $host")
            Text("Connection: $status", Modifier.padding(bottom = 20.dp))
            Text("Appearance")
            PreferenceRow("Use dark theme", preferences.theme == ThemePreference.Dark) {
                onPreferences(preferences.copy(theme = if (it) ThemePreference.Dark else ThemePreference.System))
            }
            Text("Text size ${String.format("%.0f", preferences.textScale * 100)}%")
            Slider(
                value = preferences.textScale,
                onValueChange = { onPreferences(preferences.copy(textScale = it)) },
                valueRange = .85f..1.4f,
            )
            PreferenceRow("Reduced motion", preferences.reducedMotion) { onPreferences(preferences.copy(reducedMotion = it)) }
            PreferenceRow("Show tool activity", preferences.showTools) { onPreferences(preferences.copy(showTools = it)) }
            PreferenceRow("Show reasoning", preferences.showReasoning) { onPreferences(preferences.copy(showReasoning = it)) }
            PreferenceRow("Hardware Enter sends", preferences.hardwareKeyboardSend) { onPreferences(preferences.copy(hardwareKeyboardSend = it)) }
            PreferenceRow("Auto-scroll chat", preferences.autoScroll) { onPreferences(preferences.copy(autoScroll = it)) }
            PreferenceRow("Show durations", preferences.showDurations) { onPreferences(preferences.copy(showDurations = it)) }
            PreferenceRow("Haptics", preferences.haptics) { onPreferences(preferences.copy(haptics = it)) }
            Text("Models: ${catalogs.first}", Modifier.padding(top = 12.dp))
            Text("Skills: ${catalogs.second}", Modifier.padding(top = 8.dp))
            Text("Toolsets: ${catalogs.third}", Modifier.padding(top = 8.dp, bottom = 12.dp))
            OutlinedTextField(name, { name = it }, label = { Text("Agent name") }, modifier = Modifier.fillMaxWidth())
            Button(onClick = { onSaveAgentName(name) }, modifier = Modifier.padding(vertical = 8.dp)) { Text("Save name") }
            OutlinedButton(onClick = onClearCache, modifier = Modifier.padding(vertical = 4.dp)) { Text("Clear downloaded media") }
            OutlinedButton(onClick = onPrune, modifier = Modifier.padding(vertical = 4.dp)) { Text("Prune old run history") }
            OutlinedButton(onClick = onUnpair, modifier = Modifier.padding(top = 20.dp)) { Text("Unpair this device") }
        }
    }
}

@Composable
private fun PreferenceRow(label: String, checked: Boolean, onChecked: (Boolean) -> Unit) {
    androidx.compose.foundation.layout.Row(Modifier.fillMaxWidth(), verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
        Text(label, Modifier.weight(1f))
        Switch(checked = checked, onCheckedChange = onChecked)
    }
}
