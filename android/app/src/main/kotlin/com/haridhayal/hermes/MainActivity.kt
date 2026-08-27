package com.haridhayal.hermes

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalNavigationDrawer
import androidx.compose.material3.ModalDrawerSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.Switch
import androidx.compose.material3.rememberDrawerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation3.runtime.NavKey
import androidx.navigation3.runtime.entryProvider
import androidx.navigation3.runtime.rememberNavBackStack
import androidx.navigation3.ui.NavDisplay
import com.haridhayal.hermes.core.designsystem.HermesTheme
import com.haridhayal.hermes.feature.chat.ChatScreen
import com.haridhayal.hermes.feature.jobs.JobsScreen
import com.haridhayal.hermes.feature.pairing.PairingScreen
import com.haridhayal.hermes.feature.projects.ProjectTreePanel
import com.haridhayal.hermes.feature.search.SearchScreen
import com.haridhayal.hermes.feature.settings.SettingsScreen
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable

@Serializable private data object ChatRoute : NavKey
@Serializable private data object SearchRoute : NavKey
@Serializable private data object JobsRoute : NavKey
@Serializable private data object SettingsRoute : NavKey

@AndroidEntryPoint
class MainActivity : ComponentActivity() {
    private val viewModel: MainViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            val preferences by viewModel.displayPreferences.collectAsStateWithLifecycle()
            HermesTheme(preferences.theme) { HermesApp(viewModel) }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun HermesApp(viewModel: MainViewModel) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    if (!state.paired) {
        PairingScreen(state.pairing, state.error, viewModel::pair)
        return
    }
    val backStack = rememberNavBackStack(ChatRoute)
    val drawerState = rememberDrawerState(androidx.compose.material3.DrawerValue.Closed)
    val scope = rememberCoroutineScope()
    var newProject by remember { mutableStateOf(false) }
    var projectName by remember { mutableStateOf("") }
    var projectSettings by remember { mutableStateOf(false) }
    var settingsName by remember(state.selectedProject?.id) { mutableStateOf(state.selectedProject?.name.orEmpty()) }
    var settingsInstructions by remember(state.selectedProject?.id) { mutableStateOf(state.selectedProject?.instructions.orEmpty()) }
    var settingsPinned by remember(state.selectedProject?.id) { mutableStateOf(state.selectedProject?.pinned ?: false) }
    val navigate: (NavKey) -> Unit = { route ->
        if (backStack.lastOrNull() != route) backStack.add(route)
        scope.launch { drawerState.close() }
    }
    val sidebar: @Composable () -> Unit = {
        ProjectTreePanel(
            projects = state.tree.projects,
            sessions = state.tree.sessions,
            selectedSessionId = state.selectedSession?.id,
            onSelect = { project, session -> viewModel.select(project, session); navigate(ChatRoute) },
            onNewProject = { newProject = true },
            onNewSession = { project ->
                viewModel.createSession(project.id)
                navigate(ChatRoute)
            },
            onSearch = { navigate(SearchRoute) },
            onJobs = { viewModel.loadJobs(); navigate(JobsRoute) },
            onSettings = { viewModel.loadSettings(); navigate(SettingsRoute) },
        )
    }
    val content: @Composable (Boolean) -> Unit = { persistent ->
        NavDisplay(
            backStack = backStack,
            onBack = { backStack.removeLastOrNull() },
            entryProvider = entryProvider {
                entry<ChatRoute> {
                    ChatScreen(
                        title = state.selectedSession?.title ?: "Hermes",
                        messages = state.messages,
                        activity = state.activity,
                        pendingCount = state.queuedCount,
                        running = state.running,
                        onMenu = { if (!persistent) scope.launch { drawerState.open() } },
                        onSend = viewModel::send,
                        onApproval = viewModel::approve,
                        onStop = viewModel::stop,
                        onNewChat = { viewModel.createSession() },
                        onFork = viewModel::forkSession,
                        onRename = viewModel::renameSession,
                        onDelete = viewModel::deleteSession,
                        onProjectSettings = { projectSettings = true },
                    )
                }
                entry<SearchRoute> { SearchScreen(viewModel.searchResult.collectAsState().value, viewModel::search) { p, s -> viewModel.open(p, s); navigate(ChatRoute) } }
                entry<JobsRoute> { val jobs by viewModel.jobs.collectAsState(); JobsScreen(jobs.jobs, jobs.unavailable, viewModel::jobAction) }
                entry<SettingsRoute> {
                    val name by viewModel.agentName.collectAsState()
                    val status by viewModel.connectionStatus.collectAsState()
                    val preferences by viewModel.displayPreferences.collectAsState()
                    val catalogs by viewModel.catalogs.collectAsState()
                    SettingsScreen(state.host, name, status, preferences, catalogs, viewModel::setDisplayPreferences, viewModel::saveAgentName, viewModel::clearCache, viewModel::prune, viewModel::unpair)
                }
            },
            modifier = Modifier.fillMaxSize(),
        )
    }
    BoxWithConstraints(Modifier.fillMaxSize()) {
        if (maxWidth >= 840.dp) Row(Modifier.fillMaxSize()) { sidebar(); androidx.compose.foundation.layout.Box(Modifier.weight(1f)) { content(true) } }
        else ModalNavigationDrawer(drawerState = drawerState, drawerContent = { ModalDrawerSheet { sidebar() } }) { content(false) }
    }
    if (newProject) {
        AlertDialog(
            onDismissRequest = { newProject = false },
            title = { Text("New project") },
            text = { OutlinedTextField(projectName, { projectName = it }, label = { Text("Name") }) },
            confirmButton = { TextButton(onClick = { viewModel.createProject(projectName); projectName = ""; newProject = false }) { Text("Create") } },
            dismissButton = { TextButton(onClick = { newProject = false }) { Text("Cancel") } },
        )
    }
    if (projectSettings && state.selectedProject != null) {
        AlertDialog(
            onDismissRequest = { projectSettings = false },
            title = { Text("Project settings") },
            text = {
                androidx.compose.foundation.layout.Column {
                    OutlinedTextField(settingsName, { settingsName = it }, label = { Text("Name") })
                    OutlinedTextField(settingsInstructions, { settingsInstructions = it }, label = { Text("Instructions") })
                    androidx.compose.foundation.layout.Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                        Text("Pinned", Modifier.weight(1f))
                        Switch(settingsPinned, { settingsPinned = it })
                    }
                    TextButton(onClick = { viewModel.archiveProject(); projectSettings = false }) { Text("Archive project") }
                    TextButton(onClick = { viewModel.purgeProject(); projectSettings = false }) { Text("Delete project and chats") }
                }
            },
            confirmButton = { TextButton(onClick = { viewModel.updateProject(settingsName, settingsInstructions, settingsPinned); projectSettings = false }) { Text("Save") } },
            dismissButton = { TextButton(onClick = { projectSettings = false }) { Text("Cancel") } },
        )
    }
}
