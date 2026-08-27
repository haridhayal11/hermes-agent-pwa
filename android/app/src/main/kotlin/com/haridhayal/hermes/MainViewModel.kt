package com.haridhayal.hermes

import android.net.Uri
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.haridhayal.hermes.core.data.HermesRepository
import com.haridhayal.hermes.core.data.ProjectTree
import com.haridhayal.hermes.core.data.DisplayPreferences
import com.haridhayal.hermes.core.data.UserPreferences
import com.haridhayal.hermes.core.model.CreateProjectRequest
import com.haridhayal.hermes.core.model.JobsResponse
import com.haridhayal.hermes.core.model.MessageDto
import com.haridhayal.hermes.core.model.ProjectDto
import com.haridhayal.hermes.core.model.SearchResponse
import com.haridhayal.hermes.core.model.SessionDto
import com.haridhayal.hermes.core.model.StreamEventDto
import com.haridhayal.hermes.core.model.UpdateProjectRequest
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.retryWhen
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

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
    val error: String? = null,
)

@HiltViewModel
class MainViewModel @Inject constructor(
    private val repository: HermesRepository,
    private val userPreferences: UserPreferences,
) : ViewModel() {
    private val selectedProjectId = MutableStateFlow<String?>(null)
    private val selectedSessionId = MutableStateFlow<String?>(null)
    private val transient = MutableStateFlow(MainUiState())
    private val events = MutableStateFlow<List<StreamEventDto>>(emptyList())
    private val run = MutableStateFlow<Pair<String?, Boolean>>(null to false)
    private var searchJob: Job? = null

    val searchResult = MutableStateFlow<SearchResponse?>(null)
    val jobs = MutableStateFlow(JobsResponse())
    val agentName = MutableStateFlow("Hermes")
    val connectionStatus = MutableStateFlow("Checking…")
    val catalogs = MutableStateFlow(Triple("", "", ""))
    val displayPreferences = userPreferences.values.stateIn(
        viewModelScope,
        SharingStarted.WhileSubscribed(5_000),
        DisplayPreferences(),
    )

    private val messages = selectedSessionId.flatMapLatest { id ->
        if (id == null) flowOf(emptyList()) else repository.messages(id)
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
        @Suppress("UNCHECKED_CAST") val currentMessages = values[2] as List<MessageDto>
        val pending = values[3] as Int
        val local = values[4] as MainUiState
        @Suppress("UNCHECKED_CAST") val activity = values[5] as List<StreamEventDto>
        @Suppress("UNCHECKED_CAST") val runState = values[6] as Pair<String?, Boolean>
        val project = tree.projects.firstOrNull { it.id == selectedProjectId.value }
            ?: tree.projects.firstOrNull()
        val sessionId = selectedSessionId.value
            ?.takeIf { id -> tree.sessions.any { it.id == id && it.projectId == project?.id } }
            ?: project?.selectedSessionId
        val session = tree.sessions.firstOrNull { it.id == sessionId }
        local.copy(
            loading = false,
            paired = connection != null,
            host = connection?.baseUrl.orEmpty(),
            tree = tree,
            selectedProject = project,
            selectedSession = session,
            messages = currentMessages,
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
                    .onSuccess { connectionStatus.value = "Connected" }
                    .onFailure { connectionStatus.value = "Offline" }
            }
        }
        viewModelScope.launch {
            repository.projectTree.collect { tree ->
                val project = tree.projects.firstOrNull { it.id == selectedProjectId.value } ?: tree.projects.firstOrNull()
                if (selectedProjectId.value == null) selectedProjectId.value = project?.id
                val candidate = selectedSessionId.value
                if (candidate == null || tree.sessions.none { it.id == candidate && it.projectId == project?.id }) {
                    selectedSessionId.value = project?.selectedSessionId
                }
            }
        }
        viewModelScope.launch {
            repository.connection.filterNotNull().flatMapLatest {
                repository.changeEvents().retryWhen { cause, _ ->
                    if (repository.requiresPairing(cause)) false
                    else { delay(2_000); true }
                }
            }.collect { repository.refreshAll() }
        }
        viewModelScope.launch {
            combine(selectedProjectId, selectedSessionId) { project, session -> project to session }
                .flatMapLatest { (project, session) ->
                    if (project == null || session == null) flowOf()
                    else repository.sessionEvents(project, session)
                        .retryWhen { cause, _ ->
                            if (repository.requiresPairing(cause)) false
                            else { delay(1_500); true }
                        }
                }
                .catch { setError(it) }
                .collect { event ->
                    events.value = (events.value + event).takeLast(100)
                    val ended = event.type in setOf("run.completed", "run.failed", "run.cancelled", "done", "error")
                    val started = event.type.contains("start") || event.type.contains("status")
                    run.value = event.runId to when { ended -> false; started || event.runId != null -> true; else -> run.value.second }
                    selectedProjectId.value?.let { project -> selectedSessionId.value?.let { repository.refreshSession(project, it) } }
                }
        }
    }

    fun pair(host: String, code: String, deviceName: String) = launchAction(pairing = true) {
        repository.pair(host, code, deviceName, BuildConfig.DEBUG)
    }

    fun select(project: ProjectDto, session: SessionDto) = launchAction {
        selectedProjectId.value = project.id
        selectedSessionId.value = session.id
        events.value = emptyList()
        repository.selectSession(project.id, session.id)
    }

    fun open(projectId: String, sessionId: String) = launchAction {
        selectedProjectId.value = projectId
        selectedSessionId.value = sessionId
        repository.selectSession(projectId, sessionId)
    }

    fun createProject(name: String) = launchAction {
        val project = repository.createProject(CreateProjectRequest(name = name))
        selectedProjectId.value = project.id
        selectedSessionId.value = project.selectedSessionId
    }

    fun createSession(projectId: String? = null) = launchAction {
        val project = projectId?.let { id -> uiState.value.tree.projects.firstOrNull { it.id == id } }
            ?: uiState.value.selectedProject ?: return@launchAction
        selectedProjectId.value = project.id
        val session = repository.createSession(project.id)
        selectedSessionId.value = session.id
        repository.selectSession(project.id, session.id)
    }

    fun forkSession() = launchAction {
        val project = uiState.value.selectedProject ?: return@launchAction
        val session = uiState.value.selectedSession ?: return@launchAction
        selectedSessionId.value = repository.forkSession(project.id, session.id).id
    }

    fun renameSession(title: String) = launchAction {
        val project = uiState.value.selectedProject ?: return@launchAction
        val session = uiState.value.selectedSession ?: return@launchAction
        repository.renameSession(project.id, session.id, title)
    }

    fun deleteSession() = launchAction {
        val project = uiState.value.selectedProject ?: return@launchAction
        val session = uiState.value.selectedSession ?: return@launchAction
        repository.deleteSession(project.id, session.id)
        selectedSessionId.value = null
    }

    fun updateProject(name: String, instructions: String, pinned: Boolean) = launchAction {
        val project = uiState.value.selectedProject ?: return@launchAction
        repository.updateProject(
            project.id,
            UpdateProjectRequest(name = name, instructions = instructions, pinned = pinned),
        )
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

    fun send(text: String, attachments: List<Uri>) = launchAction {
        val project = uiState.value.selectedProject ?: return@launchAction
        val session = uiState.value.selectedSession ?: return@launchAction
        if (attachments.isNotEmpty()) {
            repository.enqueuePrompt(project.id, session.id, text, attachments)
        } else {
            runCatching { repository.sendNow(project.id, session.id, text) }
                .onFailure { repository.enqueuePrompt(project.id, session.id, text, emptyList()) }
        }
    }

    fun approve(runId: String, choice: String, all: Boolean) = launchAction { repository.approve(runId, choice, all) }
    fun stop() = launchAction { uiState.value.runId?.let { repository.stop(it) } }

    fun search(query: String) {
        searchJob?.cancel()
        if (query.length < 2) { searchResult.value = null; return }
        searchJob = viewModelScope.launch {
            delay(250)
            runCatching { repository.search(query) }.onSuccess { searchResult.value = it }.onFailure(::setError)
        }
    }

    fun loadJobs() = launchAction { jobs.value = repository.jobs() }
    fun jobAction(jobId: String, action: String) = launchAction {
        repository.jobAction(jobId, action)
        jobs.value = repository.jobs()
    }
    fun loadSettings() = launchAction {
        agentName.value = repository.agentName().name
        catalogs.value = Triple(
            repository.models().toString(),
            repository.skills().toString(),
            repository.toolsets().toString(),
        )
    }
    fun saveAgentName(name: String) = launchAction { agentName.value = repository.setAgentName(name).name }
    fun clearCache() = launchAction { repository.clearMediaCache() }
    fun prune() = launchAction { repository.pruneServerHistory() }
    fun unpair() = launchAction { repository.unpair() }
    fun setDisplayPreferences(value: DisplayPreferences) = launchAction { userPreferences.update(value) }

    private fun launchAction(pairing: Boolean = false, block: suspend () -> Unit) {
        viewModelScope.launch {
            transient.value = transient.value.copy(pairing = pairing, error = null)
            runCatching { block() }.onFailure(::setError)
            transient.value = transient.value.copy(pairing = false)
        }
    }

    private fun setError(error: Throwable) {
        transient.value = transient.value.copy(error = error.message ?: "Something went wrong")
        if (repository.requiresPairing(error)) connectionStatus.value = "Re-pair required"
    }
}
