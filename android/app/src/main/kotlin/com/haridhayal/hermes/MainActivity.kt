package com.haridhayal.hermes

import android.Manifest
import android.app.NotificationManager
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalNavigationDrawer
import androidx.compose.material3.ModalDrawerSheet
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SnackbarDuration
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.SnackbarResult
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.Switch
import androidx.compose.material3.rememberDrawerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.lifecycleScope
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.navigation3.runtime.NavKey
import androidx.navigation3.runtime.entryProvider
import androidx.navigation3.runtime.rememberNavBackStack
import androidx.navigation3.ui.NavDisplay
import com.haridhayal.hermes.core.designsystem.HermesTheme
import com.haridhayal.hermes.core.data.UserPreferences
import com.haridhayal.hermes.core.model.ThemePreference
import com.haridhayal.hermes.feature.chat.ChatScreen
import com.haridhayal.hermes.feature.jobs.JobsScreen
import com.haridhayal.hermes.feature.pairing.PairingScreen
import com.haridhayal.hermes.feature.projects.ProjectTreePanel
import com.haridhayal.hermes.feature.search.SearchScreen
import com.haridhayal.hermes.feature.settings.SettingsScreen
import com.haridhayal.hermes.notifications.ACTIVITY_CHANNEL_ID
import com.haridhayal.hermes.notifications.EXTRA_PROJECT_ID
import com.haridhayal.hermes.notifications.EXTRA_SESSION_ID
import com.haridhayal.hermes.notifications.NotificationDestination
import com.haridhayal.hermes.notifications.createActivityChannel
import com.google.firebase.messaging.FirebaseMessaging
import dagger.hilt.android.AndroidEntryPoint
import javax.inject.Inject
import kotlinx.coroutines.launch
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.serialization.Serializable

@Serializable private data object ChatRoute : NavKey
@Serializable private data object SearchRoute : NavKey
@Serializable private data object JobsRoute : NavKey
@Serializable private data object SettingsRoute : NavKey

@AndroidEntryPoint
class MainActivity : ComponentActivity() {
    private val viewModel: MainViewModel by viewModels()
    @Inject lateinit var userPreferences: UserPreferences
    private val notificationTarget = MutableStateFlow<NotificationDestination?>(null)
    private var notificationsBlocked by mutableStateOf(false)
    private val notificationPermission = registerForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { granted ->
        refreshNotificationBlocking()
        if (granted) activateNotifications()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        notificationTarget.value = destinationFrom(intent)
        enableEdgeToEdge()
        setContent {
            val preferences by viewModel.displayPreferences.collectAsStateWithLifecycle()
            val darkBars = when (preferences.theme) {
                ThemePreference.System -> isSystemInDarkTheme()
                ThemePreference.Light -> false
                ThemePreference.Dark -> true
            }
            SideEffect {
                val barStyle = if (darkBars) {
                    SystemBarStyle.dark(android.graphics.Color.TRANSPARENT)
                } else {
                    SystemBarStyle.light(android.graphics.Color.TRANSPARENT, android.graphics.Color.TRANSPARENT)
                }
                enableEdgeToEdge(statusBarStyle = barStyle, navigationBarStyle = barStyle)
            }
            HermesTheme(preferences.theme, preferences.textSize.scale) {
                HermesApp(
                    viewModel = viewModel,
                    notificationTarget = notificationTarget,
                    notificationsBlocked = notificationsBlocked,
                    onEnableNotifications = ::enableNotifications,
                    onDisableNotifications = ::disableNotifications,
                    onOpenNotificationSettings = ::openNotificationSettings,
                    onUnpair = ::unpair,
                    onNotificationConsumed = { notificationTarget.value = null },
                )
            }
        }
    }

    override fun onResume() {
        super.onResume()
        refreshNotificationBlocking()
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        notificationTarget.value = destinationFrom(intent)
    }

    private fun enableNotifications() {
        if (!BuildConfig.FIREBASE_CONFIGURED) return
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            notificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
        } else {
            activateNotifications()
        }
    }

    private fun activateNotifications() {
        if (!BuildConfig.FIREBASE_CONFIGURED) return
        createActivityChannel(this)
        lifecycleScope.launch {
            userPreferences.updateNotifications(true)
            FirebaseMessaging.getInstance().apply { isAutoInitEnabled = true }.register()
                .addOnCompleteListener {
                    lifecycleScope.launch {
                        delay(1_500)
                        viewModel.loadSettings()
                    }
                }
        }
    }

    private fun disableNotifications() {
        viewModel.disableNotifications {
            if (BuildConfig.FIREBASE_CONFIGURED) {
                FirebaseMessaging.getInstance().apply { isAutoInitEnabled = false }.unregister()
            }
        }
    }

    private fun unpair() {
        if (BuildConfig.FIREBASE_CONFIGURED) {
            FirebaseMessaging.getInstance().apply { isAutoInitEnabled = false }.unregister()
        }
        viewModel.unpair()
    }

    private fun refreshNotificationBlocking() {
        val manager = NotificationManagerCompat.from(this)
        val channelBlocked = if (Build.VERSION.SDK_INT >= 26) {
            getSystemService(NotificationManager::class.java)
                .getNotificationChannel(ACTIVITY_CHANNEL_ID)
                ?.importance == NotificationManager.IMPORTANCE_NONE
        } else false
        val permissionBlocked = Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        notificationsBlocked = !manager.areNotificationsEnabled() || channelBlocked || permissionBlocked
    }

    private fun openNotificationSettings() {
        startActivity(
            Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                .putExtra(Settings.EXTRA_APP_PACKAGE, packageName),
        )
    }

    private fun destinationFrom(intent: Intent?): NotificationDestination? {
        val project = intent?.getStringExtra(EXTRA_PROJECT_ID)
        val session = intent?.getStringExtra(EXTRA_SESSION_ID)
        return if (!project.isNullOrBlank() && !session.isNullOrBlank()) {
            NotificationDestination(project, session)
        } else null
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun HermesApp(
    viewModel: MainViewModel,
    notificationTarget: MutableStateFlow<NotificationDestination?>,
    notificationsBlocked: Boolean,
    onEnableNotifications: () -> Unit,
    onDisableNotifications: () -> Unit,
    onOpenNotificationSettings: () -> Unit,
    onUnpair: () -> Unit,
    onNotificationConsumed: () -> Unit,
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val models by viewModel.modelCatalog.collectAsStateWithLifecycle()
    val modelsRefreshing by viewModel.modelsRefreshing.collectAsStateWithLifecycle()
    val preferences by viewModel.displayPreferences.collectAsStateWithLifecycle()
    val sharedAgentName by viewModel.agentName.collectAsStateWithLifecycle()
    val pendingNotification by notificationTarget.collectAsStateWithLifecycle()
    if (!state.paired) {
        PairingScreen(state.pairing, state.error?.message, viewModel::pair)
        return
    }
    val backStack = rememberNavBackStack(ChatRoute)
    val drawerState = rememberDrawerState(androidx.compose.material3.DrawerValue.Closed)
    val snackbarHostState = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()
    val focusManager = LocalFocusManager.current
    val keyboardController = LocalSoftwareKeyboardController.current
    var newProject by remember { mutableStateOf(false) }
    var projectName by remember { mutableStateOf("") }
    var projectSettings by remember { mutableStateOf(false) }
    var settingsName by remember(state.selectedProject?.id) { mutableStateOf(state.selectedProject?.name.orEmpty()) }
    var settingsInstructions by remember(state.selectedProject?.id) { mutableStateOf(state.selectedProject?.instructions.orEmpty()) }
    var settingsPinned by remember(state.selectedProject?.id) { mutableStateOf(state.selectedProject?.pinned ?: false) }
    LaunchedEffect(state.error?.id) {
        val error = state.error ?: return@LaunchedEffect
        val result = snackbarHostState.showSnackbar(
            message = error.message,
            actionLabel = if (error.requiresPairing) "Pair again" else null,
            duration = if (error.requiresPairing) SnackbarDuration.Indefinite else SnackbarDuration.Long,
        )
        viewModel.clearError()
        if (result == SnackbarResult.ActionPerformed && error.requiresPairing) viewModel.repairPairing()
    }
    val navigate: (NavKey) -> Unit = { route ->
        if (backStack.lastOrNull() != route) backStack.add(route)
        scope.launch { drawerState.close() }
    }
    LaunchedEffect(pendingNotification) {
        pendingNotification?.let { destination ->
            viewModel.open(destination.projectId, destination.sessionId)
            navigate(ChatRoute)
            onNotificationConsumed()
        }
    }
    val sidebar: @Composable () -> Unit = {
        ProjectTreePanel(
            projects = state.tree.projects,
            sessions = state.tree.sessions,
            selectedSessionId = state.selectedSession?.id,
            onOpenProject = { project -> viewModel.openProject(project); navigate(ChatRoute) },
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
                        projectName = state.selectedProject?.name ?: "Hermes",
                        sessionTitle = state.selectedSession?.title ?: "Chat",
                        agentName = sharedAgentName,
                        preferences = preferences,
                        modelSelection = state.selectedProject?.modelSelection,
                        models = models,
                        modelsRefreshing = modelsRefreshing,
                        messages = state.messages,
                        activity = state.activity,
                        pendingCount = state.queuedCount,
                        running = state.running,
                        scheduled = state.selectedSession?.kind == "scheduled",
                        onMenu = {
                            if (!persistent) {
                                focusManager.clearFocus(force = true)
                                keyboardController?.hide()
                                scope.launch { drawerState.open() }
                            }
                        },
                        onScheduledVisible = viewModel::markScheduledRead,
                        onSend = viewModel::send,
                        onApproval = viewModel::submitApproval,
                        onStop = viewModel::stop,
                        onRefreshModels = viewModel::refreshModels,
                        onSelectModel = viewModel::selectModel,
                        onThinkingChange = viewModel::setThinkingMode,
                        onFastChange = viewModel::setFastMode,
                        onNewChat = { viewModel.createSession() },
                        onFork = viewModel::forkSession,
                        onRename = viewModel::renameSession,
                        onDelete = viewModel::deleteSession,
                        onProjectSettings = { projectSettings = true },
                    )
                }
                entry<SearchRoute> {
                    SearchScreen(
                        result = viewModel.searchResult.collectAsState().value,
                        onSearch = viewModel::search,
                        onOpen = { p, s -> viewModel.open(p, s); navigate(ChatRoute) },
                        onBack = { backStack.removeLastOrNull() },
                    )
                }
                entry<JobsRoute> {
                    val jobs by viewModel.jobs.collectAsState()
                    val skills by viewModel.skillCatalog.collectAsState()
                    val error by viewModel.jobsError.collectAsState()
                    val savedRevision by viewModel.jobSavedRevision.collectAsState()
                    JobsScreen(
                        jobs = jobs.jobs,
                        unavailable = jobs.unavailable,
                        projects = state.tree.projects,
                        skills = skills.skills,
                        error = error,
                        savedRevision = savedRevision,
                        onBack = { backStack.removeLastOrNull() },
                        onCreate = viewModel::createJob,
                        onUpdate = viewModel::updateJob,
                        onAction = viewModel::jobAction,
                        onDelete = viewModel::deleteJob,
                    )
                }
                entry<SettingsRoute> {
                    val name by viewModel.agentName.collectAsState()
                    val nameRevision by viewModel.agentSaveRevision.collectAsState()
                    val status by viewModel.connectionStatus.collectAsState()
                    val preferences by viewModel.displayPreferences.collectAsState()
                    val catalogs by viewModel.catalogs.collectAsState()
                    val capabilities by viewModel.connectionCapabilities.collectAsState()
                    val activeRuns by viewModel.activeRunCount.collectAsState()
                    val jobs by viewModel.jobs.collectAsState()
                    val archived by viewModel.archivedProjects.collectAsState()
                    val maintenance by viewModel.maintenanceStatus.collectAsState()
                    val notifications by viewModel.notificationSettings.collectAsState()
                    SettingsScreen(
                        host = state.host,
                        agentName = name,
                        agentSaveRevision = nameRevision,
                        status = status,
                        preferences = preferences,
                        catalogs = catalogs,
                        capabilities = capabilities,
                        activeRuns = activeRuns,
                        scheduledCount = jobs.jobs.size,
                        scheduledUnavailable = jobs.unavailable,
                        archivedProjects = archived,
                        maintenance = maintenance,
                        notifications = notifications,
                        firebaseAvailable = BuildConfig.FIREBASE_CONFIGURED,
                        notificationsBlocked = notificationsBlocked,
                        version = BuildConfig.VERSION_NAME,
                        onBack = { backStack.removeLastOrNull() },
                        onPreferences = viewModel::setDisplayPreferences,
                        onSaveAgentName = viewModel::saveAgentName,
                        onNotificationsEnabled = { enabled ->
                            if (enabled) onEnableNotifications() else onDisableNotifications()
                        },
                        onNotificationKinds = viewModel::updateNotificationKinds,
                        onTestNotification = viewModel::testNotification,
                        onOpenNotificationSettings = onOpenNotificationSettings,
                        onOpenJobs = { viewModel.loadJobs(); navigate(JobsRoute) },
                        onRestoreArchived = viewModel::restoreArchivedProject,
                        onDeleteArchived = viewModel::deleteArchivedProject,
                        onClearCache = viewModel::clearCache,
                        onPrune = viewModel::prune,
                        onUnpair = onUnpair,
                    )
                }
            },
            modifier = Modifier.fillMaxSize(),
        )
    }
    Box(Modifier.fillMaxSize()) {
        BoxWithConstraints(Modifier.fillMaxSize()) {
            if (maxWidth >= 840.dp) Row(Modifier.fillMaxSize()) { sidebar(); Box(Modifier.weight(1f)) { content(true) } }
            else ModalNavigationDrawer(
                drawerState = drawerState,
                drawerContent = {
                    ModalDrawerSheet(drawerContainerColor = MaterialTheme.colorScheme.surfaceContainerLow) { sidebar() }
                },
            ) { content(false) }
        }
        SnackbarHost(snackbarHostState, Modifier.align(Alignment.BottomCenter))
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
