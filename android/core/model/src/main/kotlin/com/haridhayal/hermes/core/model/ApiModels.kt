package com.haridhayal.hermes.core.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.KSerializer
import kotlinx.serialization.SerializationException
import kotlinx.serialization.descriptors.PrimitiveKind
import kotlinx.serialization.descriptors.PrimitiveSerialDescriptor
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.json.JsonDecoder
import kotlinx.serialization.json.JsonEncoder
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.longOrNull

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
    /** null follows the gateway default while still allowing per-run options. */
    val model: String? = null,
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
    val lastChatSessionId: String? = null,
    val scheduledSessionId: String? = null,
    val unreadScheduledCount: Int = 0,
    val createdAt: Long,
    val lastActiveAt: Long,
    val archived: Boolean = false,
) {
    val selectedSessionId: String get() = when {
        unreadScheduledCount > 0 && scheduledSessionId != null -> scheduledSessionId
        lastChatSessionId != null -> lastChatSessionId
        else -> activeSessionId ?: sessionId.orEmpty()
    }
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
    val kind: String = "chat",
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
data class OpenProjectResponse(
    val session: SessionDto,
    val sessionId: String,
)

@Serializable
data class ScheduledReadResponse(
    val ok: Boolean = true,
    val markedRead: Int = 0,
)

@Serializable
data class MessageDto(
    @Serializable(with = NullableStringOrNumberSerializer::class)
    val id: String? = null,
    val role: String,
    val content: String? = null,
    val timestamp: JsonElement? = null,
    val cron: JsonObject? = null,
)

object NullableStringOrNumberSerializer : KSerializer<String?> {
    override val descriptor: SerialDescriptor =
        PrimitiveSerialDescriptor("NullableStringOrNumber", PrimitiveKind.STRING)

    override fun deserialize(decoder: Decoder): String? {
        val jsonDecoder = decoder as? JsonDecoder
            ?: throw SerializationException("Message ids require JSON decoding")
        return when (val value = jsonDecoder.decodeJsonElement()) {
            JsonNull -> null
            is JsonPrimitive -> when {
                value.isString -> value.content
                value.booleanOrNull != null -> throw SerializationException("Message id cannot be a boolean")
                value.longOrNull != null || value.doubleOrNull != null -> value.content
                else -> throw SerializationException("Message id must be a string or number")
            }
            else -> throw SerializationException("Message id must be a string or number")
        }
    }

    override fun serialize(encoder: Encoder, value: String?) {
        val jsonEncoder = encoder as? JsonEncoder
            ?: throw SerializationException("Message ids require JSON encoding")
        jsonEncoder.encodeJsonElement(value?.let(::JsonPrimitive) ?: JsonNull)
    }
}

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
data class ScheduledReplyRequest(
    val deliveryId: String,
    val text: String,
    val attachments: List<AttachmentDto> = emptyList(),
)

@Serializable
data class ScheduledReplyResult(
    val session: SessionDto,
    val queued: Boolean,
    val mode: String,
    val runId: String,
    val startupError: String? = null,
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
    val runActive: Boolean? = null,
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
data class ModelChoiceDto(
    val id: String,
    val fast: Boolean = false,
    val reasoning: Boolean = false,
    val featured: Boolean = false,
)

@Serializable
data class ModelProviderDto(
    val slug: String,
    val name: String,
    val authenticated: Boolean = true,
    val warning: String? = null,
    val isCurrent: Boolean = false,
    val models: List<ModelChoiceDto> = emptyList(),
)

@Serializable
data class CurrentModelDto(val model: String? = null, val provider: String? = null)

@Serializable
data class ModelsResponse(
    val providers: List<ModelProviderDto> = emptyList(),
    val current: CurrentModelDto = CurrentModelDto(),
    val unavailable: Boolean = false,
)

@Serializable
data class SkillDto(
    val name: String,
    val description: String? = null,
    val category: String? = null,
)

@Serializable
data class SkillsResponse(
    val skills: List<SkillDto> = emptyList(),
    val unavailable: Boolean = false,
)

@Serializable
data class ToolsetDto(
    val name: String,
    val label: String? = null,
    val description: String? = null,
    val enabled: Boolean = false,
    val configured: Boolean? = null,
    val tools: List<String> = emptyList(),
)

@Serializable
data class ToolsetsResponse(
    val toolsets: List<ToolsetDto> = emptyList(),
    val unavailable: Boolean = false,
)

data class CatalogSummary(
    val models: String = "Loading…",
    val skills: String = "Loading…",
    val toolsets: String = "Loading…",
)

@Serializable
data class JobScheduleDto(
    val kind: String = "",
    val display: String? = null,
    @SerialName("run_at") val runAt: String? = null,
    val minutes: Int? = null,
    val expr: String? = null,
)

@Serializable
data class JobBindingDto(
    @SerialName("job_id") val jobId: String? = null,
    @SerialName("project_id") val projectId: String,
    @SerialName("project_name") val projectName: String? = null,
)

@Serializable
data class JobRepeatDto(
    val times: Int? = null,
    val completed: Int = 0,
)

@Serializable
data class JobDto(
    val id: String,
    val name: String,
    val enabled: Boolean = true,
    val state: String = "",
    val schedule: JobScheduleDto = JobScheduleDto(),
    @SerialName("schedule_display") val scheduleDisplay: String = "",
    @SerialName("next_run_at") val nextRunAt: String? = null,
    @SerialName("last_status") val lastStatus: String? = null,
    @SerialName("last_error") val lastError: String? = null,
    val prompt: String = "",
    val deliver: String = "local",
    val skills: List<String> = emptyList(),
    val repeat: JobRepeatDto? = null,
    val binding: JobBindingDto? = null,
)

@Serializable
data class JobsResponse(val jobs: List<JobDto> = emptyList(), val unavailable: Boolean = false)

@Serializable
data class JobWriteRequest(
    val name: String,
    val schedule: String,
    val prompt: String,
    val deliver: String,
    val skills: List<String> = emptyList(),
    val repeat: Int? = null,
    val binding: JobBindingDto? = null,
)

@Serializable
data class JobResponse(val job: JobDto)

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
enum class NotificationKind {
    @SerialName("run") Run,
    @SerialName("approval") Approval,
    @SerialName("question") Question,
    @SerialName("job") Job,
    @SerialName("job-failed") JobFailed,
}

@Serializable
data class NotificationSettingsDto(
    val configured: Boolean = false,
    val enabled: Boolean = false,
    val kinds: List<NotificationKind> = NotificationKind.entries,
    val subscriptions: Int = 0,
)

@Serializable
data class NotificationRegistrationRequest(
    val installationId: String,
    val kinds: List<NotificationKind> = NotificationKind.entries,
)

@Serializable
data class NotificationKindsRequest(val kinds: List<NotificationKind>)

@Serializable
data class NotificationSendResult(
    val sent: Int = 0,
    val failed: Int = 0,
    val error: String? = null,
)

@Serializable
data class MaintenanceStatusDto(
    val dbPath: String = "",
    val dbBytes: Long = 0,
    val projects: Int = 0,
    val archivedProjects: Int = 0,
    val runs: Int = 0,
    val runEvents: Int = 0,
    val queued: Int = 0,
    val pushSubscriptions: Int = 0,
    val hermesUrl: String = "",
)

@Serializable
data class MaintenanceResultDto(
    val removed: Int = 0,
    val runEvents: Int = 0,
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
