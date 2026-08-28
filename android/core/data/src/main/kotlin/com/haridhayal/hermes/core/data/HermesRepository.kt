package com.haridhayal.hermes.core.data

import android.content.ContentResolver
import android.content.Context
import android.net.Uri
import androidx.work.Constraints
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.workDataOf
import com.haridhayal.hermes.core.database.HermesDao
import com.haridhayal.hermes.core.database.MediaCacheEntity
import com.haridhayal.hermes.core.database.MessageEntity
import com.haridhayal.hermes.core.database.PendingAttachmentEntity
import com.haridhayal.hermes.core.database.PendingPromptEntity
import com.haridhayal.hermes.core.database.ProjectEntity
import com.haridhayal.hermes.core.database.RunCursorEntity
import com.haridhayal.hermes.core.database.SessionEntity
import com.haridhayal.hermes.core.database.SyncStateEntity
import com.haridhayal.hermes.core.model.ConnectionConfig
import com.haridhayal.hermes.core.model.ChangeEventDto
import com.haridhayal.hermes.core.model.CreateProjectRequest
import com.haridhayal.hermes.core.model.JobWriteRequest
import com.haridhayal.hermes.core.model.LocalAttachment
import com.haridhayal.hermes.core.model.MessageDto
import com.haridhayal.hermes.core.model.NotificationKind
import com.haridhayal.hermes.core.model.NotificationKindsRequest
import com.haridhayal.hermes.core.model.NotificationRegistrationRequest
import com.haridhayal.hermes.core.model.PairingClaimRequest
import com.haridhayal.hermes.core.model.ProjectDto
import com.haridhayal.hermes.core.model.SearchResponse
import com.haridhayal.hermes.core.model.ScheduledReplyRequest
import com.haridhayal.hermes.core.model.ScheduledReplyResult
import com.haridhayal.hermes.core.model.SendMessageRequest
import com.haridhayal.hermes.core.model.SessionDto
import com.haridhayal.hermes.core.model.StreamEventDto
import com.haridhayal.hermes.core.model.UpdateProjectRequest
import com.haridhayal.hermes.core.network.HermesApiClient
import com.haridhayal.hermes.core.network.HermesApiException
import dagger.hilt.android.qualifiers.ApplicationContext
import java.io.File
import java.security.MessageDigest
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.withContext
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

data class ProjectTree(val projects: List<ProjectDto>, val sessions: List<SessionDto>)
data class PendingPromptSummary(val id: String, val sessionId: String, val status: String)

@Singleton
class HermesRepository @Inject constructor(
    @ApplicationContext private val context: Context,
    private val credentials: CredentialStore,
    private val api: HermesApiClient,
    private val dao: HermesDao,
    private val workManager: WorkManager,
) {
    private val json: Json = api.json

    val connection: Flow<ConnectionConfig?> = credentials.connection
    val projectTree: Flow<ProjectTree> = combine(
        dao.observeProjects(),
        dao.observeAllSessions(),
    ) { projects, sessions ->
        ProjectTree(
            projects.mapNotNull { runCatching { json.decodeFromString<ProjectDto>(it.json) }.getOrNull() },
            sessions.mapNotNull { runCatching { json.decodeFromString<SessionDto>(it.json) }.getOrNull() },
        )
    }
    val outbox: Flow<List<PendingPromptSummary>> = dao.observeOutbox().map { prompts ->
        prompts.map { PendingPromptSummary(it.id, it.sessionId, it.status) }
    }

    fun messages(sessionId: String): Flow<List<MessageDto>> = dao.observeMessages(sessionId).map {
        it.mapNotNull { row -> runCatching { json.decodeFromString<MessageDto>(row.json) }.getOrNull() }
    }

    suspend fun pair(host: String, code: String, deviceName: String, allowDebugCleartext: Boolean) {
        val normalized = HermesApiClient.normalizeHost(host, allowDebugCleartext).toString().trimEnd('/')
        val result = withContext(Dispatchers.IO) {
            api.claim(normalized, PairingClaimRequest(code.trim(), deviceName.trim()), allowDebugCleartext)
        }
        val config = ConnectionConfig(normalized, result.credentials.accessToken)
        withContext(Dispatchers.IO) { api.validate(config) }
        credentials.save(config)
        refreshAll()
    }

    suspend fun unpair(revoke: Boolean = true) {
        val config = credentials.current()
        if (revoke && config != null) runCatching { withContext(Dispatchers.IO) { api.unpair(config) } }
        credentials.clear()
        dao.clearAllProtectedData()
        clearCacheFiles()
    }

    suspend fun refreshAll() {
        val config = requireConnection()
        val projects = withContext(Dispatchers.IO) { api.projects(config).projects }
        dao.upsertProjects(projects.map(::projectEntity))
        if (projects.isEmpty()) {
            dao.clearAllMessages()
            dao.clearRunCursors()
            dao.clearProjects()
            return
        }
        dao.removeMissingProjectData(projects.map { it.id })
        projects.forEach { project -> refreshSessions(config, project.id) }
    }

    suspend fun refreshSession(projectId: String, sessionId: String) {
        val config = requireConnection()
        val page = withContext(Dispatchers.IO) { api.messages(config, projectId, sessionId) }
        val messages = page.messages.mapIndexed { index, message ->
            MessageEntity(sessionId, index.toLong(), message.id, json.encodeToString(message))
        }
        dao.replaceMessages(sessionId, messages)
    }

    suspend fun createProject(request: CreateProjectRequest): ProjectDto {
        val project = withContext(Dispatchers.IO) {
            api.createProject(requireConnection(), request, UUID.randomUUID().toString()).project
        }
        refreshAll()
        return project
    }

    suspend fun createSession(projectId: String): SessionDto {
        val result = withContext(Dispatchers.IO) { api.createSession(requireConnection(), projectId) }
        refreshAll()
        return result.session
    }

    suspend fun openProject(projectId: String): SessionDto {
        val result = withContext(Dispatchers.IO) {
            api.openProject(requireConnection(), projectId)
        }
        refreshAll()
        return result.session
    }

    suspend fun selectSession(projectId: String, sessionId: String) {
        withContext(Dispatchers.IO) {
            api.selectSession(requireConnection(), projectId, sessionId)
        }
        refreshAll()
    }

    suspend fun markScheduledRead(projectId: String) {
        withContext(Dispatchers.IO) {
            api.markScheduledRead(requireConnection(), projectId)
        }
        refreshAll()
    }

    suspend fun replyScheduled(
        projectId: String,
        deliveryId: String,
        text: String,
        uris: List<Uri>,
    ): ScheduledReplyResult = withContext(Dispatchers.IO) {
        val requestId = UUID.randomUUID().toString()
        val directory = File(context.noBackupFilesDir, "scheduled-replies/$requestId").apply {
            mkdirs()
        }
        try {
            val config = requireConnection()
            val uploaded = uris.mapIndexed { index, uri ->
                val local = copyAttachment(requestId, index, uri, directory)
                api.upload(
                    config,
                    projectId,
                    File(local.localPath),
                    local.mimeType,
                    local.sha256,
                    "$requestId:$index",
                )
            }
            val result = api.replyScheduled(
                config,
                projectId,
                ScheduledReplyRequest(deliveryId, text, uploaded),
                requestId,
            )
            releaseOwnedCameraCaptures(uris)
            refreshAll()
            result
        } finally {
            directory.deleteRecursively()
        }
    }

    suspend fun forkSession(projectId: String, sessionId: String): SessionDto {
        val result = withContext(Dispatchers.IO) { api.forkSession(requireConnection(), projectId, sessionId) }
        refreshAll()
        return result.session
    }

    suspend fun renameSession(projectId: String, sessionId: String, title: String) {
        withContext(Dispatchers.IO) { api.renameSession(requireConnection(), projectId, sessionId, title) }
        refreshAll()
    }

    suspend fun deleteSession(projectId: String, sessionId: String) {
        withContext(Dispatchers.IO) { api.deleteSession(requireConnection(), projectId, sessionId) }
        refreshAll()
    }

    suspend fun updateProject(projectId: String, request: UpdateProjectRequest) {
        withContext(Dispatchers.IO) { api.updateProject(requireConnection(), projectId, request) }
        refreshAll()
    }

    suspend fun deleteProject(projectId: String, purge: Boolean, deleteSessions: Boolean) {
        withContext(Dispatchers.IO) { api.deleteProject(requireConnection(), projectId, purge, deleteSessions) }
        refreshAll()
    }

    suspend fun sendNow(
        projectId: String,
        sessionId: String,
        text: String,
        attachments: List<com.haridhayal.hermes.core.model.AttachmentDto> = emptyList(),
        prefer: String? = null,
    ) = withContext(Dispatchers.IO) {
        api.send(
            requireConnection(),
            projectId,
            sessionId,
            SendMessageRequest(text, attachments, prefer),
            UUID.randomUUID().toString(),
        )
    }

    suspend fun approve(runId: String, choice: String, all: Boolean) = withContext(Dispatchers.IO) {
        api.approval(requireConnection(), runId, choice, all)
    }

    suspend fun stop(runId: String) = withContext(Dispatchers.IO) {
        api.stop(requireConnection(), runId)
    }

    suspend fun jobs() = withContext(Dispatchers.IO) { api.jobs(requireConnection()) }
    suspend fun createJob(request: JobWriteRequest) = withContext(Dispatchers.IO) {
        api.createJob(requireConnection(), request).job
    }
    suspend fun updateJob(jobId: String, request: JobWriteRequest) = withContext(Dispatchers.IO) {
        api.updateJob(requireConnection(), jobId, request).job
    }
    suspend fun jobAction(jobId: String, action: String) = withContext(Dispatchers.IO) {
        api.jobAction(requireConnection(), jobId, action)
    }
    suspend fun deleteJob(jobId: String) = withContext(Dispatchers.IO) {
        api.deleteJob(requireConnection(), jobId)
    }
    suspend fun models() = withContext(Dispatchers.IO) { api.models(requireConnection()) }
    suspend fun skills() = withContext(Dispatchers.IO) { api.skills(requireConnection()) }
    suspend fun toolsets() = withContext(Dispatchers.IO) { api.toolsets(requireConnection()) }
    suspend fun agentName() = withContext(Dispatchers.IO) { api.agentName(requireConnection()) }
    suspend fun setAgentName(name: String) = withContext(Dispatchers.IO) { api.setAgentName(requireConnection(), name) }
    suspend fun status() = withContext(Dispatchers.IO) { api.validate(requireConnection()) }
    suspend fun archivedProjects() = withContext(Dispatchers.IO) {
        api.projects(requireConnection(), archived = true).projects.filter { it.archived }
    }
    suspend fun restoreProject(projectId: String) {
        withContext(Dispatchers.IO) {
            api.updateProject(requireConnection(), projectId, UpdateProjectRequest(archived = false))
        }
        refreshAll()
    }
    suspend fun deleteArchivedProject(projectId: String) {
        withContext(Dispatchers.IO) {
            api.deleteProject(requireConnection(), projectId, purge = true, deleteSessions = false)
        }
        refreshAll()
    }
    suspend fun maintenanceStatus() = withContext(Dispatchers.IO) {
        api.maintenanceStatus(requireConnection())
    }
    suspend fun pruneServerHistory(hours: Int = 24) = withContext(Dispatchers.IO) {
        api.maintenance(requireConnection(), hours)
    }
    suspend fun notificationSettings() = withContext(Dispatchers.IO) {
        api.notifications(requireConnection())
    }
    suspend fun registerNotifications(installationId: String, kinds: List<NotificationKind>) =
        withContext(Dispatchers.IO) {
            api.registerNotifications(
                requireConnection(),
                NotificationRegistrationRequest(installationId, kinds),
            )
        }
    suspend fun updateNotificationKinds(kinds: List<NotificationKind>) = withContext(Dispatchers.IO) {
        api.updateNotificationKinds(requireConnection(), NotificationKindsRequest(kinds))
    }
    suspend fun disableNotifications() = withContext(Dispatchers.IO) {
        api.disableNotifications(requireConnection())
    }
    suspend fun testNotifications() = withContext(Dispatchers.IO) {
        api.testNotifications(requireConnection())
    }

    fun requiresPairing(error: Throwable): Boolean =
        error is HermesApiException && error.authenticationFailed

    fun changeEvents(): Flow<ChangeEventDto> = flow {
        val cursor = dao.syncCursor("changes")
        api.changes(requireConnection(), cursor).collect { event ->
            event.sequence?.let { dao.upsertSyncState(SyncStateEntity("changes", it)) }
            if (event.type == "sync.reset") refreshAll()
            emit(event)
        }
    }

    suspend fun enqueuePrompt(
        projectId: String,
        sessionId: String,
        text: String,
        uris: List<Uri>,
    ): String = withContext(Dispatchers.IO) {
        val promptId = UUID.randomUUID().toString()
        val directory = File(context.noBackupFilesDir, "outbox/$promptId").apply { mkdirs() }
        val attachments = uris.mapIndexed { index, uri -> copyAttachment(promptId, index, uri, directory) }
        dao.insertOutbox(
            PendingPromptEntity(
                id = promptId,
                projectId = projectId,
                sessionId = sessionId,
                text = text,
                status = "queued",
                errorCode = null,
                errorMessage = null,
                createdAt = System.currentTimeMillis(),
                attemptCount = 0,
            ),
            attachments.map {
                PendingAttachmentEntity(
                    id = UUID.randomUUID().toString(),
                    promptId = promptId,
                    name = it.name,
                    mimeType = it.mimeType,
                    localPath = it.localPath,
                    size = it.size,
                    sha256 = it.sha256,
                    uploadedJson = null,
                )
            },
        )
        releaseOwnedCameraCaptures(uris)
        scheduleOutbox(sessionId)
        promptId
    }

    fun sessionEvents(
        projectId: String,
        sessionId: String,
        initialCursor: String? = null,
    ): Flow<StreamEventDto> {
        var firstCollection = true
        return kotlinx.coroutines.flow.flow {
            // A new screen collector replays the latest run when it has no in-memory
            // cursor. Network retries of that same collector resume from Room.
            val cursor = if (firstCollection) {
                firstCollection = false
                initialCursor
            } else {
                dao.cursor(sessionId)?.let { "${it.runId}:${it.sequence}" }
            }
            api.sessionEvents(requireConnection(), projectId, sessionId, cursor).collect { event ->
                val runId = event.runId
                val sequence = event.sequence
                if (runId != null && sequence != null) {
                    dao.upsertCursor(
                        RunCursorEntity(sessionId, runId, sequence, System.currentTimeMillis()),
                    )
                }
                emit(event)
            }
        }
    }

    suspend fun search(query: String): SearchResponse = withContext(Dispatchers.IO) {
        api.search(requireConnection(), query)
    }

    suspend fun clearMediaCache() = withContext(Dispatchers.IO) {
        File(context.cacheDir, "media").deleteRecursively()
        dao.clearMediaRows()
    }

    suspend fun pruneMediaCache(capBytes: Long = 512L * 1024 * 1024) = withContext(Dispatchers.IO) {
        val entries = dao.mediaByOldestAccess()
        val evictions = mediaKeysToEvict(
            entries.map { CachedMedia(it.cacheKey, it.size, it.lastAccessedAt) },
            capBytes,
        ).toSet()
        entries.filter { it.cacheKey in evictions }.forEach { entry ->
            File(entry.localPath).delete()
            dao.deleteMedia(entry.cacheKey)
        }
    }

    private suspend fun refreshSessions(config: ConnectionConfig, projectId: String) {
        val sessions = withContext(Dispatchers.IO) { api.sessions(config, projectId).sessions }
        dao.replaceSessions(projectId, sessions.map(::sessionEntity))
    }

    private suspend fun requireConnection(): ConnectionConfig =
        credentials.current() ?: throw HermesApiException(401, "pairing_required", "Pair this device first")

    private fun projectEntity(project: ProjectDto) = ProjectEntity(
        project.id,
        json.encodeToString(project),
        project.selectedSessionId,
        project.lastActiveAt,
    )

    private fun sessionEntity(session: SessionDto) = SessionEntity(
        session.id,
        session.projectId,
        session.parentSessionId,
        json.encodeToString(session),
        session.lastActiveAt,
    )

    private fun copyAttachment(
        promptId: String,
        index: Int,
        uri: Uri,
        directory: File,
    ): LocalAttachment {
        val resolver = context.contentResolver
        val mime = resolver.getType(uri) ?: "application/octet-stream"
        val name = "attachment-$index"
        val target = File(directory, name)
        val digest = MessageDigest.getInstance("SHA-256")
        resolver.openInputStream(uri).use { input ->
            requireNotNull(input) { "Unable to read attachment" }
            target.outputStream().use { output ->
                val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
                while (true) {
                    val read = input.read(buffer)
                    if (read < 0) break
                    output.write(buffer, 0, read)
                    digest.update(buffer, 0, read)
                }
            }
        }
        return LocalAttachment(
            name = name,
            mimeType = mime,
            localPath = target.absolutePath,
            size = target.length(),
            sha256 = digest.digest().joinToString("") { "%02x".format(it) },
        )
    }

    private fun scheduleOutbox(sessionId: String) {
        val constraints = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()
        val request = OneTimeWorkRequestBuilder<OutboxWorker>()
            .setConstraints(constraints)
            .setInputData(workDataOf(OutboxWorker.SESSION_ID to sessionId))
            .build()
        workManager.enqueueUniqueWork("hermes-outbox-$sessionId", ExistingWorkPolicy.APPEND_OR_REPLACE, request)
    }

    private fun releaseOwnedCameraCaptures(uris: List<Uri>) {
        uris.filter { isOwnedCameraCaptureUri(context.packageName, it) }.forEach { uri ->
            runCatching { context.contentResolver.delete(uri, null, null) }
        }
    }

    private fun clearCacheFiles() {
        File(context.noBackupFilesDir, "outbox").deleteRecursively()
        File(context.cacheDir, "media").deleteRecursively()
        File(context.cacheDir, "camera-captures").deleteRecursively()
    }
}

internal fun isOwnedCameraCaptureUri(packageName: String, uri: Uri): Boolean =
    isOwnedCameraCaptureLocation(
        packageName = packageName,
        scheme = uri.scheme,
        authority = uri.authority,
        root = uri.pathSegments.firstOrNull(),
    )

internal fun isOwnedCameraCaptureLocation(
    packageName: String,
    scheme: String?,
    authority: String?,
    root: String?,
): Boolean =
    scheme == ContentResolver.SCHEME_CONTENT &&
        authority == "$packageName.fileprovider" &&
        root == "camera-captures"
