package com.haridhayal.hermes.core.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject

enum class ThemePreference { System, Light, Dark }

@Serializable
data class ApiErrorEnvelope(val error: ApiError)

@Serializable
data class ApiError(
    val code: String,
    val message: String,
    val details: JsonObject? = null,
)

@Serializable
data class DeviceDto(
    val id: String,
    val name: String,
    val platform: String,
    val createdAt: Long,
    val lastSeenAt: Long,
)

@Serializable
data class PairingClaimRequest(
    val code: String,
    val deviceName: String,
    val platform: String = "android",
)

@Serializable
data class PairingCredentials(
    val scheme: String,
    val accessToken: String,
)

@Serializable
data class PairingClaimResponse(
    val device: DeviceDto,
    val credentials: PairingCredentials,
    val apiVersion: Int,
)

@Serializable
data class ModelSelectionDto(
    val model: String,
    val provider: String? = null,
    val options: JsonObject? = null,
)

@Serializable
data class ProjectDto(
    val id: String,
    val name: String,
    val emoji: String? = null,
    val color: String? = null,
    val workingDirectory: String? = null,
    val instructions: String? = null,
    val pinned: Boolean = false,
    val skills: List<String> = emptyList(),
    val modelSelection: ModelSelectionDto? = null,
    val activeSessionId: String? = null,
    @Deprecated("Use activeSessionId") val sessionId: String? = null,
    val createdAt: Long,
    val lastActiveAt: Long,
    val archived: Boolean = false,
) {
    val selectedSessionId: String get() = activeSessionId ?: sessionId.orEmpty()
}

@Serializable
data class ProjectListResponse(val projects: List<ProjectDto>)

@Serializable
data class ProjectResponse(val project: ProjectDto)

@Serializable
data class CreateProjectRequest(
    val name: String,
    val emoji: String? = null,
    val color: String? = null,
    val workingDirectory: String? = null,
    val instructions: String? = null,
    val pinned: Boolean = false,
    val skills: List<String> = emptyList(),
    val template: String? = null,
)

@Serializable
data class UpdateProjectRequest(
    val name: String? = null,
    val emoji: String? = null,
    val color: String? = null,
    val workingDirectory: String? = null,
    val instructions: String? = null,
    val pinned: Boolean? = null,
    val archived: Boolean? = null,
    val skills: List<String>? = null,
    val modelSelection: ModelSelectionDto? = null,
)

@Serializable
data class SessionDto(
    val id: String,
    val projectId: String,
    val title: String,
    val parentSessionId: String? = null,
    val createdAt: Long,
    val lastActiveAt: Long,
    val archived: Boolean = false,
)

@Serializable
data class SessionListResponse(
    val activeSessionId: String,
    val sessions: List<SessionDto>,
)

@Serializable
data class SessionResponse(
    val session: SessionDto,
    val activeSessionId: String? = null,
)

@Serializable
data class CreateSessionRequest(val title: String = "New chat")

@Serializable
data class RenameSessionRequest(val title: String)

@Serializable
data class MessageDto(
    val id: String? = null,
    val role: String,
    val content: String? = null,
    val timestamp: JsonElement? = null,
    val cron: JsonObject? = null,
)

@Serializable
data class MessagePage(
    val messages: List<MessageDto>,
    val nextCursor: String? = null,
    val hasMore: Boolean = false,
)

@Serializable
data class AttachmentDto(
    val kind: String,
    val name: String,
    val path: String? = null,
    val url: String? = null,
    val size: Long? = null,
)

@Serializable
data class SendMessageRequest(
    val text: String = "",
    val attachments: List<AttachmentDto> = emptyList(),
    val prefer: String? = null,
)

@Serializable
data class SendResult(
    val queued: Boolean,
    val mode: String,
    val runId: String,
    val sessionId: String? = null,
)

@Serializable
data class ApprovalRequest(
    val choice: String,
    val all: Boolean = false,
)

@Serializable
data class StreamEventDto(
    val type: String,
    val runId: String? = null,
    val sequence: Long? = null,
    val occurredAt: Long,
    val payload: JsonObject = JsonObject(emptyMap()),
)

@Serializable
data class ChangeEventDto(
    val type: String,
    val sequence: Long? = null,
    val occurredAt: Long,
    val payload: JsonObject = JsonObject(emptyMap()),
)

@Serializable
data class SearchProjectHit(
    val id: String,
    val name: String,
    val emoji: String? = null,
    val snippet: String? = null,
)

@Serializable
data class SearchMessageHit(
    val projectId: String,
    val sessionId: String,
    val projectName: String,
    val projectEmoji: String? = null,
    val runId: String,
    val preview: String,
    val startedAt: Long,
)

@Serializable
data class SearchDeliveryHit(
    val id: String,
    val projectId: String,
    val sessionId: String,
    val projectName: String,
    val projectEmoji: String? = null,
    val jobName: String,
    val snippet: String,
    val ts: Long,
)

@Serializable
data class SearchResponse(
    val projects: List<SearchProjectHit> = emptyList(),
    val messages: List<SearchMessageHit> = emptyList(),
    val deliveries: List<SearchDeliveryHit> = emptyList(),
    val scope: String,
    val q: String,
)

@Serializable
data class CatalogResponse(
    val models: JsonObject? = null,
    val skills: List<JsonObject> = emptyList(),
    val toolsets: List<JsonObject> = emptyList(),
    val unavailable: Boolean = false,
)

@Serializable
data class JobsResponse(val jobs: List<JsonObject> = emptyList(), val unavailable: Boolean = false)

@Serializable
data class AgentNameResponse(val name: String, val max: Int? = null)

@Serializable
data class AgentNameRequest(val name: String)

@Serializable
data class StatusResponse(
    val hermes: JsonObject,
    @SerialName("active_runs") val activeRuns: List<JsonObject> = emptyList(),
)

@Serializable
data class OkResponse(
    val ok: Boolean = true,
    val activeSessionId: String? = null,
)

@Serializable
data class DeviceResponse(
    val device: DeviceDto,
    val apiVersion: Int,
)

@Serializable
data class MaintenanceRequest(val hours: Int)

@Serializable
data class JobActionRequest(val action: String? = null)

data class ConnectionConfig(val baseUrl: String, val accessToken: String)

data class LocalAttachment(
    val name: String,
    val mimeType: String,
    val localPath: String,
    val size: Long,
    val sha256: String,
)
