package com.haridhayal.hermes.core.network

import com.haridhayal.hermes.core.model.AgentNameRequest
import com.haridhayal.hermes.core.model.AgentNameResponse
import com.haridhayal.hermes.core.model.ApiErrorEnvelope
import com.haridhayal.hermes.core.model.ApprovalRequest
import com.haridhayal.hermes.core.model.AttachmentDto
import com.haridhayal.hermes.core.model.ChangeEventDto
import com.haridhayal.hermes.core.model.ConnectionConfig
import com.haridhayal.hermes.core.model.CreateProjectRequest
import com.haridhayal.hermes.core.model.CreateSessionRequest
import com.haridhayal.hermes.core.model.DeviceResponse
import com.haridhayal.hermes.core.model.JobsResponse
import com.haridhayal.hermes.core.model.MaintenanceRequest
import com.haridhayal.hermes.core.model.MessagePage
import com.haridhayal.hermes.core.model.OkResponse
import com.haridhayal.hermes.core.model.PairingClaimRequest
import com.haridhayal.hermes.core.model.PairingClaimResponse
import com.haridhayal.hermes.core.model.ProjectListResponse
import com.haridhayal.hermes.core.model.ProjectResponse
import com.haridhayal.hermes.core.model.RenameSessionRequest
import com.haridhayal.hermes.core.model.SearchResponse
import com.haridhayal.hermes.core.model.SendMessageRequest
import com.haridhayal.hermes.core.model.SendResult
import com.haridhayal.hermes.core.model.SessionListResponse
import com.haridhayal.hermes.core.model.SessionResponse
import com.haridhayal.hermes.core.model.StatusResponse
import com.haridhayal.hermes.core.model.StreamEventDto
import com.haridhayal.hermes.core.model.UpdateProjectRequest
import java.io.File
import java.io.IOException
import java.net.URLEncoder
import java.nio.charset.StandardCharsets
import java.util.UUID
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.serialization.SerializationException
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import okhttp3.HttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody
import okhttp3.RequestBody.Companion.asRequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.sse.EventSource
import okhttp3.sse.EventSourceListener
import okhttp3.sse.EventSources

class HermesApiException(
    val status: Int,
    val code: String,
    override val message: String,
) : IOException(message) {
    val authenticationFailed: Boolean get() = status == 401
    val permanent: Boolean get() = status in 400..499 && status != 408 && status != 429
}

class HermesApiClient(
    private val client: OkHttpClient,
    val json: Json = Json {
        ignoreUnknownKeys = true
        explicitNulls = false
        encodeDefaults = true
    },
) {
    suspend fun claim(
        host: String,
        request: PairingClaimRequest,
        allowDebugCleartext: Boolean = false,
    ): PairingClaimResponse {
        val base = normalizeHost(host, allowDebugCleartext)
        return execute(base.toString(), null, "api/v1/pairing/claim", "POST", jsonBody(request))
    }

    suspend fun validate(config: ConnectionConfig): StatusResponse = get(config, "api/v1/status")
    suspend fun me(config: ConnectionConfig): DeviceResponse = get(config, "api/v1/me")

    suspend fun unpair(config: ConnectionConfig) {
        executeUnit(config, "api/v1/me", "DELETE", null, idempotencyKey = UUID.randomUUID().toString())
    }

    suspend fun projects(config: ConnectionConfig): ProjectListResponse = get(config, "api/v1/projects")

    suspend fun createProject(
        config: ConnectionConfig,
        request: CreateProjectRequest,
        idempotencyKey: String,
    ): ProjectResponse = write(config, "api/v1/projects", "POST", request, idempotencyKey)

    suspend fun sessions(config: ConnectionConfig, projectId: String): SessionListResponse =
        get(config, "api/v1/projects/${segment(projectId)}/sessions")

    suspend fun createSession(
        config: ConnectionConfig,
        projectId: String,
        title: String = "New chat",
        idempotencyKey: String = UUID.randomUUID().toString(),
    ): SessionResponse = write(
        config,
        "api/v1/projects/${segment(projectId)}/sessions",
        "POST",
        CreateSessionRequest(title),
        idempotencyKey,
    )

    suspend fun selectSession(
        config: ConnectionConfig,
        projectId: String,
        sessionId: String,
        idempotencyKey: String = UUID.randomUUID().toString(),
    ): SessionResponse = write(
        config,
        "api/v1/projects/${segment(projectId)}/sessions/${segment(sessionId)}/select",
        "POST",
        JsonObject(emptyMap()),
        idempotencyKey,
    )

    suspend fun renameSession(
        config: ConnectionConfig,
        projectId: String,
        sessionId: String,
        title: String,
        idempotencyKey: String = UUID.randomUUID().toString(),
    ): SessionResponse = write(
        config,
        "api/v1/projects/${segment(projectId)}/sessions/${segment(sessionId)}",
        "PATCH",
        RenameSessionRequest(title),
        idempotencyKey,
    )

    suspend fun forkSession(
        config: ConnectionConfig,
        projectId: String,
        sessionId: String,
        title: String? = null,
        idempotencyKey: String = UUID.randomUUID().toString(),
    ): SessionResponse = write(
        config,
        "api/v1/projects/${segment(projectId)}/sessions/${segment(sessionId)}/fork",
        "POST",
        buildJsonObject { title?.let { put("title", it) } },
        idempotencyKey,
    )

    suspend fun deleteSession(
        config: ConnectionConfig,
        projectId: String,
        sessionId: String,
        idempotencyKey: String = UUID.randomUUID().toString(),
    ): OkResponse = execute(
        config.baseUrl,
        config.accessToken,
        "api/v1/projects/${segment(projectId)}/sessions/${segment(sessionId)}",
        "DELETE",
        null,
        idempotencyKey,
    )

    suspend fun messages(
        config: ConnectionConfig,
        projectId: String,
        sessionId: String,
        cursor: String? = null,
        limit: Int = 500,
    ): MessagePage {
        val query = buildList {
            add("limit=${limit.coerceIn(1, 500)}")
            cursor?.let { add("cursor=${segment(it)}") }
        }.joinToString("&")
        return get(
            config,
            "api/v1/projects/${segment(projectId)}/sessions/${segment(sessionId)}/messages?$query",
        )
    }

    suspend fun send(
        config: ConnectionConfig,
        projectId: String,
        sessionId: String,
        request: SendMessageRequest,
        idempotencyKey: String,
    ): SendResult = write(
        config,
        "api/v1/projects/${segment(projectId)}/sessions/${segment(sessionId)}/messages",
        "POST",
        request,
        idempotencyKey,
    )

    suspend fun retry(
        config: ConnectionConfig,
        projectId: String,
        sessionId: String,
        idempotencyKey: String = UUID.randomUUID().toString(),
    ): SendResult = write(
        config,
        "api/v1/projects/${segment(projectId)}/sessions/${segment(sessionId)}/retry",
        "POST",
        JsonObject(emptyMap()),
        idempotencyKey,
    )

    suspend fun approval(
        config: ConnectionConfig,
        runId: String,
        choice: String,
        all: Boolean = false,
        idempotencyKey: String = UUID.randomUUID().toString(),
    ): OkResponse = write(
        config,
        "api/v1/runs/${segment(runId)}/approval",
        "POST",
        ApprovalRequest(choice, all),
        idempotencyKey,
    )

    suspend fun stop(
        config: ConnectionConfig,
        runId: String,
        idempotencyKey: String = UUID.randomUUID().toString(),
    ): OkResponse = write(
        config,
        "api/v1/runs/${segment(runId)}/stop",
        "POST",
        JsonObject(emptyMap()),
        idempotencyKey,
    )

    suspend fun upload(
        config: ConnectionConfig,
        projectId: String,
        file: File,
        mimeType: String,
        sha256: String,
        idempotencyKey: String,
    ): AttachmentDto {
        val multipart = MultipartBody.Builder()
            .setType(MultipartBody.FORM)
            .addFormDataPart("projectId", projectId)
            .addFormDataPart(
                "file",
                file.name,
                file.asRequestBody(mimeType.toMediaTypeOrNull()),
            )
            .build()
        return execute(
            config.baseUrl,
            config.accessToken,
            "api/v1/uploads",
            "POST",
            multipart,
            idempotencyKey,
            mapOf("X-Content-SHA256" to sha256),
        )
    }

    suspend fun search(config: ConnectionConfig, query: String): SearchResponse =
        get(config, "api/v1/search?q=${segment(query)}")

    suspend fun jobs(config: ConnectionConfig): JobsResponse = get(config, "api/v1/jobs")

    suspend fun createJob(
        config: ConnectionConfig,
        body: JsonObject,
        idempotencyKey: String = UUID.randomUUID().toString(),
    ): JsonElement = write(config, "api/v1/jobs", "POST", body, idempotencyKey)

    suspend fun updateJob(
        config: ConnectionConfig,
        jobId: String,
        body: JsonObject,
        idempotencyKey: String = UUID.randomUUID().toString(),
    ): JsonElement = write(config, "api/v1/jobs/${segment(jobId)}", "PATCH", body, idempotencyKey)

    suspend fun jobAction(
        config: ConnectionConfig,
        jobId: String,
        action: String,
        idempotencyKey: String = UUID.randomUUID().toString(),
    ): JsonElement = write(
        config,
        "api/v1/jobs/${segment(jobId)}/${segment(action)}",
        "POST",
        JsonObject(emptyMap()),
        idempotencyKey,
    )

    suspend fun deleteJob(
        config: ConnectionConfig,
        jobId: String,
        idempotencyKey: String = UUID.randomUUID().toString(),
    ): JsonElement = execute(
        config.baseUrl,
        config.accessToken,
        "api/v1/jobs/${segment(jobId)}",
        "DELETE",
        null,
        idempotencyKey,
    )
    suspend fun models(config: ConnectionConfig): JsonElement = get(config, "api/v1/models")
    suspend fun skills(config: ConnectionConfig): JsonElement = get(config, "api/v1/skills")
    suspend fun toolsets(config: ConnectionConfig): JsonElement = get(config, "api/v1/toolsets")
    suspend fun agentName(config: ConnectionConfig): AgentNameResponse = get(config, "api/v1/settings/agent")

    suspend fun setAgentName(
        config: ConnectionConfig,
        name: String,
        idempotencyKey: String = UUID.randomUUID().toString(),
    ): AgentNameResponse = write(
        config,
        "api/v1/settings/agent",
        "PUT",
        AgentNameRequest(name),
        idempotencyKey,
    )

    suspend fun maintenance(
        config: ConnectionConfig,
        hours: Int,
        idempotencyKey: String = UUID.randomUUID().toString(),
    ): JsonElement = write(
        config,
        "api/v1/maintenance",
        "POST",
        MaintenanceRequest(hours),
        idempotencyKey,
    )

    suspend fun updateProject(
        config: ConnectionConfig,
        projectId: String,
        body: UpdateProjectRequest,
        idempotencyKey: String = UUID.randomUUID().toString(),
    ): ProjectResponse = write(
        config,
        "api/v1/projects/${segment(projectId)}",
        "PATCH",
        body,
        idempotencyKey,
    )

    suspend fun deleteProject(
        config: ConnectionConfig,
        projectId: String,
        purge: Boolean,
        deleteSessions: Boolean,
        idempotencyKey: String = UUID.randomUUID().toString(),
    ): JsonElement {
        val query = if (purge) "?purge=1&session=${if (deleteSessions) 1 else 0}" else ""
        return execute(
            config.baseUrl,
            config.accessToken,
            "api/v1/projects/${segment(projectId)}$query",
            "DELETE",
            null,
            idempotencyKey,
        )
    }

    fun sessionEvents(
        config: ConnectionConfig,
        projectId: String,
        sessionId: String,
        cursor: String?,
    ): Flow<StreamEventDto> = eventFlow(
        config,
        "api/v1/projects/${segment(projectId)}/sessions/${segment(sessionId)}/events",
        cursor,
    )

    fun changes(config: ConnectionConfig, cursor: Long?): Flow<ChangeEventDto> =
        eventFlow(config, "api/v1/changes", cursor?.toString())

    private inline fun <reified T> eventFlow(
        config: ConnectionConfig,
        path: String,
        cursor: String?,
    ): Flow<T> = callbackFlow {
        val base = normalizeHost(config.baseUrl, true)
        val url = base.newBuilder().addEncodedPathSegments(path).apply {
            cursor?.let { addQueryParameter("cursor", it) }
        }.build()
        val request = Request.Builder()
            .url(url)
            .header("Authorization", "Bearer ${config.accessToken}")
            .header("Accept", "text/event-stream")
            .build()
        val source = EventSources.createFactory(client).newEventSource(
            request,
            object : EventSourceListener() {
                override fun onEvent(eventSource: EventSource, id: String?, type: String?, data: String) {
                    try {
                        trySend(json.decodeFromString<T>(data))
                    } catch (cause: SerializationException) {
                        close(cause)
                    }
                }

                override fun onFailure(
                    eventSource: EventSource,
                    throwable: Throwable?,
                    response: Response?,
                ) {
                    if (response != null) {
                        close(errorFor(response))
                    } else {
                        close(throwable ?: IOException("Event stream disconnected"))
                    }
                }

                override fun onClosed(eventSource: EventSource) {
                    close()
                }
            },
        )
        awaitClose { source.cancel() }
    }

    private suspend inline fun <reified T> get(config: ConnectionConfig, path: String): T =
        execute(config.baseUrl, config.accessToken, path, "GET", null)

    private suspend inline fun <reified RequestType, reified ResponseType> write(
        config: ConnectionConfig,
        path: String,
        method: String,
        request: RequestType,
        idempotencyKey: String,
    ): ResponseType = execute(
        config.baseUrl,
        config.accessToken,
        path,
        method,
        jsonBody(request),
        idempotencyKey,
    )

    private suspend fun executeUnit(
        config: ConnectionConfig,
        path: String,
        method: String,
        body: RequestBody?,
        idempotencyKey: String? = null,
    ) {
        executeResponse(config.baseUrl, config.accessToken, path, method, body, idempotencyKey).use {
            if (!it.isSuccessful) throw errorFor(it)
        }
    }

    private suspend inline fun <reified T> execute(
        host: String,
        token: String?,
        path: String,
        method: String,
        body: RequestBody?,
        idempotencyKey: String? = null,
        headers: Map<String, String> = emptyMap(),
    ): T = executeResponse(host, token, path, method, body, idempotencyKey, headers).use { response ->
        if (!response.isSuccessful) throw errorFor(response)
        val text = response.body?.string().orEmpty()
        if (text.isBlank()) throw IOException("The server returned an empty response")
        try {
            json.decodeFromString<T>(text)
        } catch (cause: SerializationException) {
            throw IOException("The server returned an unsupported response", cause)
        }
    }

    private fun executeResponse(
        host: String,
        token: String?,
        path: String,
        method: String,
        body: RequestBody?,
        idempotencyKey: String?,
        headers: Map<String, String> = emptyMap(),
    ): Response {
        val base = normalizeHost(host, true)
        val request = Request.Builder()
            .url(
                base.newBuilder()
                    .addEncodedPathSegments(path.substringBefore('?'))
                    .apply { path.substringAfter('?', "").takeIf(String::isNotBlank)?.let(::encodedQuery) }
                    .build(),
            )
            .method(method, body)
            .header("Accept", "application/json")
            .apply {
                token?.let { header("Authorization", "Bearer $it") }
                idempotencyKey?.let { header("Idempotency-Key", it) }
                headers.forEach { (name, value) -> header(name, value) }
            }
            .build()
        return client.newCall(request).execute()
    }

    private inline fun <reified T> jsonBody(value: T): RequestBody =
        json.encodeToString(value).toRequestBody(JSON_MEDIA_TYPE)

    private fun errorFor(response: Response): HermesApiException {
        val text = response.body?.string().orEmpty()
        val parsed = runCatching { json.decodeFromString<ApiErrorEnvelope>(text) }.getOrNull()
        return HermesApiException(
            response.code,
            parsed?.error?.code ?: "http_${response.code}",
            parsed?.error?.message ?: response.message.ifBlank { "Request failed" },
        )
    }

    companion object {
        private val JSON_MEDIA_TYPE = "application/json; charset=utf-8".toMediaType()

        fun normalizeHost(input: String, allowDebugCleartext: Boolean): HttpUrl {
            val trimmed = input.trim().trimEnd('/')
            val parsed = trimmed.toHttpUrlOrNull()
                ?: throw IllegalArgumentException("Enter a valid server URL")
            if (parsed.scheme == "https") return parsed
            val debugHost = parsed.host in setOf("localhost", "127.0.0.1", "10.0.2.2")
            if (parsed.scheme == "http" && allowDebugCleartext && debugHost) return parsed
            throw IllegalArgumentException("Hermes requires a trusted HTTPS server")
        }

        private fun segment(value: String): String =
            URLEncoder.encode(value, StandardCharsets.UTF_8.name()).replace("+", "%20")
    }
}
