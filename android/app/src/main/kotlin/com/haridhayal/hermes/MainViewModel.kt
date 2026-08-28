package com.haridhayal.hermes

import android.net.Uri
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.haridhayal.hermes.core.data.HermesRepository
import com.haridhayal.hermes.core.data.ProjectTree
import com.haridhayal.hermes.core.data.DevicePreferences
import com.haridhayal.hermes.core.data.UserPreferences
import com.haridhayal.hermes.core.model.CatalogSummary
import com.haridhayal.hermes.core.model.CreateProjectRequest
import com.haridhayal.hermes.core.model.JobsResponse
import com.haridhayal.hermes.core.model.JobWriteRequest
import com.haridhayal.hermes.core.model.MaintenanceStatusDto
import com.haridhayal.hermes.core.model.MessageDto
import com.haridhayal.hermes.core.model.ModelSelectionDto
import com.haridhayal.hermes.core.model.ModelsResponse
import com.haridhayal.hermes.core.model.NotificationKind
import com.haridhayal.hermes.core.model.NotificationSettingsDto
import com.haridhayal.hermes.core.model.ProjectDto
import com.haridhayal.hermes.core.model.SearchResponse
import com.haridhayal.hermes.core.model.SessionDto
import com.haridhayal.hermes.core.model.SkillsResponse
import com.haridhayal.hermes.core.model.StreamEventDto
import com.haridhayal.hermes.core.model.UpdateProjectRequest
import com.haridhayal.hermes.core.model.recentFirst
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.Job
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.onCompletion
import kotlinx.coroutines.flow.retryWhen
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put

data class UiError(val id: Long, val message: String, val requiresPairing: Boolean = false)

internal fun uiError(id: Long, error: Throwable, requiresPairing: Boolean) = UiError(
    id = id,
    message = error.message ?: "Something went wrong",
    requiresPairing = requiresPairing,
)

internal data class ResolvedSelection(val projectId: String?, val sessionId: String?)

internal data class RunEventPolicy(val running: Boolean, val refreshMessages: Boolean)

internal data class SessionMessagesSnapshot(
    val sessionId: String?,
    val messages: List<MessageDto>,
)

internal fun messagesForSession(
    snapshot: SessionMessagesSnapshot,
    selectedSessionId: String?,
): List<MessageDto> = snapshot.messages.takeIf { snapshot.sessionId == selectedSessionId }.orEmpty()

internal fun runEventPolicy(
    type: String,
    hasRunId: Boolean,
    wasRunning: Boolean,
    runActive: Boolean? = null,
): RunEventPolicy {
    val terminal = type in setOf("run.completed", "run.failed", "run.cancelled", "done", "error")
    val startsOrUpdatesRun = type.contains("start") || type.contains("status") || hasRunId
    return RunEventPolicy(
        running = when {
            terminal -> false
            // The native stream replays the latest run so completed chats can
            // reconstruct tool activity. Those historical frames must not
            // temporarily put the composer back into its live "Working" state.
            runActive == false -> false
            startsOrUpdatesRun -> true
            else -> wasRunning
        },
        refreshMessages = terminal || type == "cron.delivered",
    )
}

internal fun streamCompletionSettlesSelection(
    cause: Throwable?,
    streamProjectId: String,
    streamSessionId: String,
    selectedProjectId: String?,
    selectedSessionId: String?,
): Boolean = cause == null &&
    streamProjectId == selectedProjectId &&
    streamSessionId == selectedSessionId

internal fun resolveSelection(
    tree: ProjectTree,
    requestedProjectId: String?,
    requestedSessionId: String?,
): ResolvedSelection {
    val project = tree.projects.firstOrNull { it.id == requestedProjectId } ?: tree.projects.firstOrNull()
        ?: return ResolvedSelection(null, null)
    val projectSessions = tree.sessions.filter { it.projectId == project.id }.recentFirst()
    val session = projectSessions.firstOrNull { it.id == requestedSessionId }
        ?: project.scheduledSessionId
            ?.takeIf { project.unreadScheduledCount > 0 }
            ?.let { scheduledId -> projectSessions.firstOrNull { it.id == scheduledId } }
        ?: projectSessions.firstOrNull { it.kind == "chat" }
        ?: projectSessions.firstOrNull()
    return ResolvedSelection(project.id, session?.id)
}

data class MainUiState(
    val loading: Boolean = true,
    val pairing: Boolean = false,
    val paired: Boolean = false,
    val host: String = "",
    val tree: ProjectTree = ProjectTree(emptyList(), emptyList()),
    val selectedProject: ProjectDto? = null,
    val selectedSession: SessionDto? = null,
    val messages: List<MessageDto> = emptyList(),
    val activity: List<StreamEventDto> = emptyList(),
    val queuedCount: Int = 0,
    val runId: String? = null,
    val running: Boolean = false,
    val error: UiError? = null,
)

@HiltViewModel
@OptIn(ExperimentalCoroutinesApi::class)
class MainViewModel @Inject constructor(
    private val repository: HermesRepository,
    private val userPreferences: UserPreferences,
) : ViewModel() {
    private val selectedProjectId = MutableStateFlow<String?>(null)
    private val selectedSessionId = MutableStateFlow<String?>(null)
    private val transient = MutableStateFlow(MainUiState())
    private val events = MutableStateFlow<List<StreamEventDto>>(emptyList())
    private val run = MutableStateFlow<Pair<String?, Boolean>>(null to false)
    private val streamRevision = MutableStateFlow(0L)
    private var searchJob: Job? = null
    private var nextErrorId = 0L

    val searchResult = MutableStateFlow<SearchResponse?>(null)
    val jobs = MutableStateFlow(JobsResponse())
    val jobsError = MutableStateFlow<String?>(null)
    val jobSavedRevision = MutableStateFlow(0L)
    val agentName = MutableStateFlow("Hermes")
    val agentSaveRevision = MutableStateFlow(0L)
    val connectionStatus = MutableStateFlow("Checking…")
    val connectionCapabilities = MutableStateFlow("Checking…")
    val activeRunCount = MutableStateFlow(0)
    val catalogs = MutableStateFlow(CatalogSummary())
    val modelCatalog = MutableStateFlow<ModelsResponse?>(null)
    val skillCatalog = MutableStateFlow(SkillsResponse())
    val archivedProjects = MutableStateFlow<List<ProjectDto>>(emptyList())
    val maintenanceStatus = MutableStateFlow<MaintenanceStatusDto?>(null)
    val notificationSettings = MutableStateFlow(NotificationSettingsDto())
    val modelsRefreshing = MutableStateFlow(false)
    val displayPreferences = userPreferences.values.stateIn(
        viewModelScope,
        SharingStarted.WhileSubscribed(5_000),
        DevicePreferences(),
    )

    private val messages = selectedSessionId.flatMapLatest { id ->
        if (id == null) {
            flowOf(SessionMessagesSnapshot(null, emptyList()))
        } else {
            repository.messages(id).map { SessionMessagesSnapshot(id, it) }
        }
    }

    private val queuedCount = combine(repository.outbox, selectedSessionId) { prompts, id ->
        prompts.count { it.sessionId == id }
    }

    val uiState: StateFlow<MainUiState> = combine(
        repository.connection,
        repository.projectTree,
        messages,
        queuedCount,
        transient,
        events,
        run,
    ) { values ->
        val connection = values[0] as com.haridhayal.hermes.core.model.ConnectionConfig?
        val tree = values[1] as ProjectTree
        val messageSnapshot = values[2] as SessionMessagesSnapshot
        val pending = values[3] as Int
        val local = values[4] as MainUiState
        @Suppress("UNCHECKED_CAST") val activity = values[5] as List<StreamEventDto>
        @Suppress("UNCHECKED_CAST") val runState = values[6] as Pair<String?, Boolean>
        val selection = resolveSelection(tree, selectedProjectId.value, selectedSessionId.value)
        val project = tree.projects.firstOrNull { it.id == selection.projectId }
        val session = tree.sessions.firstOrNull { it.id == selection.sessionId }
        local.copy(
            loading = false,
            paired = connection != null,
            host = connection?.baseUrl.orEmpty(),
            tree = tree,
            selectedProject = project,
            selectedSession = session,
            messages = messagesForSession(messageSnapshot, selection.sessionId),
            queuedCount = pending,
            activity = activity,
            runId = runState.first,
            running = runState.second,
        )
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), MainUiState())

    init {
        viewModelScope.launch {
            repository.connection.filterNotNull().collect {
                runCatching { repository.refreshAll() }
                    .onSuccess {
                        connectionStatus.value = "Connected"
                        runCatching { repository.agentName() }
                            .onSuccess { agentName.value = it.name }
                        runCatching { refreshModelCatalog() }
                            .onFailure { modelCatalog.value = ModelsResponse(unavailable = true) }
                    }
                    .onFailure {
                        connectionStatus.value = "Offline"
                        setError(it)
                    }
            }
        }
        viewModelScope.launch {
            combine(repository.projectTree, selectedProjectId, selectedSessionId, ::resolveSelection)
                .distinctUntilChanged()
                .collectLatest { selection ->
                    updateSelection(selection.projectId, selection.sessionId)
                    val projectId = selection.projectId
                    val sessionId = selection.sessionId
                    if (projectId != null && sessionId != null) {
                        refreshSelectedSession(projectId, sessionId)
                    }
                }
        }
        viewModelScope.launch {
            repository.connection.filterNotNull().flatMapLatest {
                repository.changeEvents().retryWhen { cause, _ ->
                    if (repository.requiresPairing(cause)) false
                    else { delay(2_000); true }
                }
            }.collect {
                runCatching { repository.refreshAll() }.onFailure(::setError)
            }
        }
        viewModelScope.launch {
            combine(selectedProjectId, selectedSessionId, streamRevision) { project, session, _ ->
                project to session
            }
                .flatMapLatest { (project, session) ->
                    if (project == null || session == null) flowOf()
                    else {
                        val cursor = events.value
                            .lastOrNull { it.runId != null && it.sequence != null }
                            ?.let { "${it.runId}:${it.sequence}" }
                        repository.sessionEvents(project, session, cursor)
                            .onCompletion { cause ->
                                if (
                                    streamCompletionSettlesSelection(
                                        cause,
                                        project,
                                        session,
                                        selectedProjectId.value,
                                        selectedSessionId.value,
                                    )
                                ) {
                                    run.value = run.value.first to false
                                }
                            }
                    }
                        .retryWhen { cause, _ ->
                            if (repository.requiresPairing(cause)) false
                            else { delay(1_500); true }
                        }
                }
                .catch { setError(it) }
                .collect { event ->
                    // A reply can arrive as hundreds of message.delta frames.
                    // Keep the complete live answer available to the chat UI,
                    // while still bounding a runaway or long-lived stream.
                    val alreadyReceived = event.runId != null && event.sequence != null && events.value.any {
                        it.runId == event.runId && it.sequence == event.sequence
                    }
                    if (!alreadyReceived) events.value = (events.value + event).takeLast(2_000)
                    val policy = runEventPolicy(
                        event.type,
                        event.runId != null,
                        run.value.second,
                        event.runActive,
                    )
                    run.value = event.runId to policy.running
                    if (policy.refreshMessages) {
                        selectedProjectId.value?.let { project ->
                            selectedSessionId.value?.let { refreshSelectedSession(project, it) }
                        }
                    }
                }
        }
    }

    private fun updateSelection(projectId: String?, sessionId: String?) {
        if (selectedProjectId.value != projectId || selectedSessionId.value != sessionId) {
            events.value = emptyList()
            run.value = null to false
        }
        selectedProjectId.value = projectId
        selectedSessionId.value = sessionId
    }

    fun pair(host: String, code: String, deviceName: String) = launchAction(pairing = true) {
        repository.pair(host, code, deviceName, BuildConfig.DEBUG)
    }

    fun select(project: ProjectDto, session: SessionDto) {
        updateSelection(project.id, session.id)
    }

    fun open(projectId: String, sessionId: String) {
        updateSelection(projectId, sessionId)
    }

    fun openProject(project: ProjectDto) = launchAction {
        val session = repository.openProject(project.id)
        updateSelection(project.id, session.id)
    }

    fun markScheduledRead() = launchAction {
        val project = uiState.value.selectedProject ?: return@launchAction
        val session = uiState.value.selectedSession ?: return@launchAction
        if (session.kind != "scheduled") return@launchAction
        repository.markScheduledRead(project.id)
    }

    fun createProject(name: String) = launchAction {
        val project = repository.createProject(CreateProjectRequest(name = name))
        updateSelection(project.id, project.selectedSessionId)
    }

    fun createSession(projectId: String? = null) = launchAction {
        val project = projectId?.let { id -> uiState.value.tree.projects.firstOrNull { it.id == id } }
            ?: uiState.value.selectedProject ?: return@launchAction
        val session = repository.createSession(project.id)
        updateSelection(project.id, session.id)
    }

    fun forkSession() = launchAction {
        val project = uiState.value.selectedProject ?: return@launchAction
        val session = uiState.value.selectedSession ?: return@launchAction
        if (session.kind == "scheduled") return@launchAction
        updateSelection(project.id, repository.forkSession(project.id, session.id).id)
    }

    fun renameSession(title: String) = launchAction {
        val project = uiState.value.selectedProject ?: return@launchAction
        val session = uiState.value.selectedSession ?: return@launchAction
        if (session.kind == "scheduled") return@launchAction
        repository.renameSession(project.id, session.id, title)
    }

    fun deleteSession() = launchAction {
        val project = uiState.value.selectedProject ?: return@launchAction
        val session = uiState.value.selectedSession ?: return@launchAction
        if (session.kind == "scheduled") return@launchAction
        repository.deleteSession(project.id, session.id)
        updateSelection(project.id, null)
    }

    fun updateProject(name: String, instructions: String, pinned: Boolean) = launchAction {
        val project = uiState.value.selectedProject ?: return@launchAction
        repository.updateProject(
            project.id,
            UpdateProjectRequest(name = name, instructions = instructions, pinned = pinned),
        )
    }

    fun refreshModels() = launchAction { refreshModelCatalog() }

    fun selectModel(provider: String?, model: String?) = launchAction {
        val project = uiState.value.selectedProject ?: return@launchAction
        var options = project.modelSelection?.options
        if (model != null) {
            val choice = modelCatalog.value?.providers
                ?.asSequence()
                ?.filter { candidate -> provider == null || candidate.slug == provider }
                ?.flatMap { candidate -> candidate.models.asSequence() }
                ?.firstOrNull { it.id == model }
            if (choice != null && !choice.fast) options = options.without("fast")
        }
        repository.updateProject(
            project.id,
            UpdateProjectRequest(
                modelSelection = ModelSelectionDto(
                    model = model,
                    provider = provider.takeIf { model != null },
                    options = options,
                ),
            ),
        )
    }

    fun setThinkingMode(effort: String?) = launchAction {
        val project = uiState.value.selectedProject ?: return@launchAction
        val options = project.modelSelection?.options.with(
            "reasoning",
            buildJsonObject {
                put("enabled", effort != null)
                if (effort != null) put("effort", effort)
            },
        )
        updateModelOptions(project, options)
    }

    fun setFastMode(enabled: Boolean) = launchAction {
        val project = uiState.value.selectedProject ?: return@launchAction
        val options = if (enabled) {
            project.modelSelection?.options.with("fast", JsonPrimitive(true))
        } else {
            project.modelSelection?.options.without("fast")
        }
        updateModelOptions(project, options)
    }

    fun archiveProject() = launchAction {
        val project = uiState.value.selectedProject ?: return@launchAction
        repository.deleteProject(project.id, purge = false, deleteSessions = false)
        selectedProjectId.value = null
        selectedSessionId.value = null
    }

    fun purgeProject() = launchAction {
        val project = uiState.value.selectedProject ?: return@launchAction
        repository.deleteProject(project.id, purge = true, deleteSessions = true)
        selectedProjectId.value = null
        selectedSessionId.value = null
    }

    fun send(text: String, attachments: List<Uri>) {
        // Capture the visible report before the coroutine is scheduled. A new
        // cron delivery arriving between the tap and the POST must not change
        // which report this reply discusses.
        val snapshot = uiState.value
        val project = snapshot.selectedProject ?: return
        val session = snapshot.selectedSession ?: return
        val visibleDeliveryId = snapshot.messages
            .lastOrNull { it.role == "cron" && it.id != null }
            ?.id
        launchAction {
            if (session.kind == "scheduled") {
                val deliveryId = visibleDeliveryId ?: return@launchAction
                val result = repository.replyScheduled(
                    project.id,
                    deliveryId,
                    text,
                    attachments,
                )
                updateSelection(project.id, result.session.id)
                run.value = result.runId.takeIf(String::isNotBlank) to (result.startupError == null)
                streamRevision.value += 1
                result.startupError?.let { setError(IllegalStateException(it)) }
                return@launchAction
            }
            if (attachments.isNotEmpty()) {
                repository.enqueuePrompt(project.id, session.id, text, attachments)
            } else {
                runCatching { repository.sendNow(project.id, session.id, text) }
                    .onSuccess { result ->
                        run.value = result.runId to true
                        // A session event stream opened before a run exists stays attached to
                        // the idle session. Reconnect after the POST creates/adopts a run so
                        // its replay and live events are delivered immediately.
                        streamRevision.value += 1
                    }
                    .onFailure { repository.enqueuePrompt(project.id, session.id, text, emptyList()) }
            }
        }
    }

    /**
     * The decision card needs to know whether its optimistic dismissal landed.
     * Other actions only need a snackbar on failure, but an approval must stay
     * available until Hermes has actually received the answer.
     */
    suspend fun submitApproval(runId: String, choice: String, all: Boolean): Boolean = try {
        repository.approve(runId, choice, all)
        true
    } catch (cancelled: CancellationException) {
        throw cancelled
    } catch (error: Throwable) {
        setError(error)
        false
    }
    fun stop() = launchAction { uiState.value.runId?.let { repository.stop(it) } }

    fun search(query: String) {
        searchJob?.cancel()
        if (query.length < 2) { searchResult.value = null; return }
        searchJob = viewModelScope.launch {
            delay(250)
            runCatching { repository.search(query) }.onSuccess { searchResult.value = it }.onFailure(::setError)
        }
    }

    fun loadJobs() = launchJobAction { jobs.value = repository.jobs() }
    fun createJob(request: JobWriteRequest) = launchJobAction(markSaved = true) {
        repository.createJob(request)
        jobs.value = repository.jobs()
    }
    fun updateJob(jobId: String, request: JobWriteRequest) = launchJobAction(markSaved = true) {
        repository.updateJob(jobId, request)
        jobs.value = repository.jobs()
    }
    fun jobAction(jobId: String, action: String) = launchJobAction {
        repository.jobAction(jobId, action)
        jobs.value = repository.jobs()
    }
    fun deleteJob(jobId: String) = launchJobAction {
        repository.deleteJob(jobId)
        jobs.value = repository.jobs()
    }
    fun loadSettings() = launchAction {
        agentName.value = repository.agentName().name
        val status = repository.status()
        connectionStatus.value = if (
            status.hermes["reachable"]?.jsonPrimitive?.booleanOrNull != false
        ) "Connected" else "Hermes unreachable"
        activeRunCount.value = status.activeRuns.size
        connectionCapabilities.value = (status.hermes["capabilities"] as? JsonObject)
            ?.keys
            .orEmpty()
            .sorted()
            .joinToString()
            .ifBlank { "Core API" }
        val models = repository.models().also { modelCatalog.value = it }
        val skills = repository.skills().also { skillCatalog.value = it }
        val toolsets = repository.toolsets()
        jobs.value = repository.jobs()
        archivedProjects.value = repository.archivedProjects()
        maintenanceStatus.value = runCatching { repository.maintenanceStatus() }.getOrNull()
        notificationSettings.value = runCatching { repository.notificationSettings() }
            .getOrElse { NotificationSettingsDto(configured = false) }
        val modelCount = models.providers.sumOf { it.models.size }
        val current = listOfNotNull(models.current.provider, models.current.model).joinToString(" / ")
        val enabledToolsets = toolsets.toolsets.count { it.enabled }
        catalogs.value = CatalogSummary(
            models = if (models.unavailable) "Model catalogue unavailable"
            else buildString {
                append("$modelCount models across ${models.providers.size} providers")
                if (current.isNotBlank()) append(" · Current: $current")
            },
            skills = if (skills.unavailable) "Skill catalogue unavailable"
            else "${skills.skills.size} installed",
            toolsets = if (toolsets.unavailable) "Toolset catalogue unavailable"
            else "$enabledToolsets of ${toolsets.toolsets.size} enabled",
        )
    }
    fun saveAgentName(name: String) {
        viewModelScope.launch {
            runCatching { repository.setAgentName(name).name }
                .onSuccess { agentName.value = it }
                .onFailure(::setError)
            agentSaveRevision.value += 1
        }
    }
    fun restoreArchivedProject(projectId: String) = launchAction {
        repository.restoreProject(projectId)
        archivedProjects.value = repository.archivedProjects()
    }
    fun deleteArchivedProject(projectId: String) = launchAction {
        repository.deleteArchivedProject(projectId)
        archivedProjects.value = repository.archivedProjects()
    }
    fun clearCache() = launchAction { repository.clearMediaCache() }
    fun prune() = launchAction {
        repository.pruneServerHistory()
        maintenanceStatus.value = repository.maintenanceStatus()
    }
    fun registerNotifications(installationId: String, kinds: List<NotificationKind> = NotificationKind.entries) =
        launchAction {
            notificationSettings.value = repository.registerNotifications(installationId, kinds)
            userPreferences.updateNotifications(true, installationId)
        }
    fun updateNotificationKinds(kinds: List<NotificationKind>) = launchAction {
        notificationSettings.value = repository.updateNotificationKinds(kinds)
    }
    fun disableNotifications(onDisabled: () -> Unit = {}) = launchAction {
        notificationSettings.value = repository.disableNotifications()
        userPreferences.updateNotifications(false)
        onDisabled()
    }
    fun testNotification() = launchAction { repository.testNotifications() }
    fun unpair() = launchAction {
        repository.unpair()
        userPreferences.updateNotifications(false)
    }
    fun repairPairing() = launchAction { repository.unpair(revoke = false) }
    fun clearError() {
        transient.value = transient.value.copy(error = null)
    }
    fun setDisplayPreferences(value: DevicePreferences) = launchAction { userPreferences.update(value) }

    private fun launchAction(pairing: Boolean = false, block: suspend () -> Unit) {
        viewModelScope.launch {
            transient.value = transient.value.copy(pairing = pairing, error = null)
            runCatching { block() }.onFailure(::setError)
            transient.value = transient.value.copy(pairing = false)
        }
    }

    private fun launchJobAction(markSaved: Boolean = false, block: suspend () -> Unit) {
        viewModelScope.launch {
            jobsError.value = null
            runCatching { block() }
                .onSuccess { if (markSaved) jobSavedRevision.value += 1 }
                .onFailure {
                    jobsError.value = it.message ?: "That job request failed"
                    setError(it)
                }
        }
    }

    private fun setError(error: Throwable) {
        val requiresPairing = repository.requiresPairing(error)
        nextErrorId += 1
        transient.value = transient.value.copy(
            error = uiError(nextErrorId, error, requiresPairing),
        )
        if (requiresPairing) connectionStatus.value = "Re-pair required"
    }

    private suspend fun refreshSelectedSession(projectId: String, sessionId: String) {
        try {
            repository.refreshSession(projectId, sessionId)
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (error: Throwable) {
            setError(error)
        }
    }

    private suspend fun refreshModelCatalog() {
        modelsRefreshing.value = true
        try {
            modelCatalog.value = repository.models()
        } finally {
            modelsRefreshing.value = false
        }
    }

    private suspend fun updateModelOptions(project: ProjectDto, options: JsonObject?) {
        val current = project.modelSelection
        repository.updateProject(
            project.id,
            UpdateProjectRequest(
                modelSelection = ModelSelectionDto(
                    model = current?.model,
                    provider = current?.provider,
                    options = options,
                ),
            ),
        )
    }
}

private fun JsonObject?.with(key: String, value: kotlinx.serialization.json.JsonElement): JsonObject =
    JsonObject(orEmpty() + (key to value))

private fun JsonObject?.without(key: String): JsonObject? {
    val next = orEmpty() - key
    return next.takeIf { it.isNotEmpty() }?.let(::JsonObject)
}
