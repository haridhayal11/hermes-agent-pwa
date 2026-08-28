package com.haridhayal.hermes.core.network

import com.haridhayal.hermes.core.model.ConnectionConfig
import com.haridhayal.hermes.core.model.JobWriteRequest
import com.haridhayal.hermes.core.model.NotificationKind
import com.haridhayal.hermes.core.model.NotificationRegistrationRequest
import com.haridhayal.hermes.core.model.PairingClaimRequest
import com.haridhayal.hermes.core.model.SendMessageRequest
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class HermesApiClientTest {
    private lateinit var server: MockWebServer
    private lateinit var api: HermesApiClient

    @Before fun setUp() {
        server = MockWebServer()
        server.start()
        api = HermesApiClient(OkHttpClient())
    }

    @After fun tearDown() = server.shutdown()

    @Test fun pairingParsesCredentials() = runTest {
        server.enqueue(
            MockResponse().setResponseCode(201).setHeader("Content-Type", "application/json").setBody(
                """{"device":{"id":"d","name":"Phone","platform":"android","createdAt":1,"lastSeenAt":1},"credentials":{"scheme":"Bearer","accessToken":"secret"},"apiVersion":1}""",
            ),
        )
        val result = api.claim(server.url("/").toString(), PairingClaimRequest("code", "Phone"), true)
        assertEquals("secret", result.credentials.accessToken)
        assertEquals("/api/v1/pairing/claim", server.takeRequest().path)
    }

    @Test fun sendCarriesBearerAndIdempotencyHeaders() = runTest {
        server.enqueue(
            MockResponse().setResponseCode(202).setHeader("Content-Type", "application/json")
                .setBody("""{"queued":false,"mode":"started","runId":"r","sessionId":"s"}"""),
        )
        api.send(
            ConnectionConfig(server.url("/").toString(), "token"),
            "p",
            "s",
            SendMessageRequest(text = "hello"),
            "prompt-123",
        )
        val request = server.takeRequest()
        assertEquals("Bearer token", request.getHeader("Authorization"))
        assertEquals("prompt-123", request.getHeader("Idempotency-Key"))
        assertEquals("/api/v1/projects/p/sessions/s/messages", request.path)
    }

    @Test fun approvalKeepsChoiceAndApplyAllIndependent() = runTest {
        server.enqueue(
            MockResponse().setResponseCode(200).setHeader("Content-Type", "application/json")
                .setBody("""{"ok":true}"""),
        )

        api.approval(
            ConnectionConfig(server.url("/").toString(), "token"),
            runId = "run-1",
            choice = "always",
            all = false,
            idempotencyKey = "approval-123",
        )

        val request = server.takeRequest()
        val body = api.json.parseToJsonElement(request.body.readUtf8()).jsonObject
        assertEquals("/api/v1/runs/run-1/approval", request.path)
        assertEquals("always", body["choice"]?.jsonPrimitive?.content)
        assertEquals("false", body["all"]?.jsonPrimitive?.content)
        assertEquals("approval-123", request.getHeader("Idempotency-Key"))
    }

    @Test fun structured401RequestsRepairing() = runTest {
        server.enqueue(
            MockResponse().setResponseCode(401).setHeader("Content-Type", "application/json")
                .setBody("""{"error":{"code":"invalid_credentials","message":"Pair again"}}"""),
        )
        val failure = runCatching {
            api.validate(ConnectionConfig(server.url("/").toString(), "bad"))
        }.exceptionOrNull() as HermesApiException
        assertEquals("invalid_credentials", failure.code)
        assertTrue(failure.authenticationFailed)
    }

    @Test fun jobCreateUsesTypedWriteContract() = runTest {
        server.enqueue(
            MockResponse().setHeader("Content-Type", "application/json")
                .setBody("""{"job":{"id":"j","name":"Daily","schedule_display":"every day"}}"""),
        )
        api.createJob(
            ConnectionConfig(server.url("/").toString(), "token"),
            JobWriteRequest("Daily", "every 1d", "Summarise", "local", listOf("notes")),
            "job-create-01",
        )
        val request = server.takeRequest()
        val body = api.json.parseToJsonElement(request.body.readUtf8()).jsonObject
        assertEquals("/api/v1/jobs", request.path)
        assertEquals("every 1d", body["schedule"]?.jsonPrimitive?.content)
        assertEquals(null, body["repeat"])
    }

    @Test fun archivedProjectsAndNotificationRegistrationUseStableRoutes() = runTest {
        server.enqueue(
            MockResponse().setHeader("Content-Type", "application/json").setBody("""{"projects":[]}"""),
        )
        server.enqueue(
            MockResponse().setHeader("Content-Type", "application/json")
                .setBody("""{"configured":true,"enabled":true,"kinds":["run"],"subscriptions":1}"""),
        )
        val config = ConnectionConfig(server.url("/").toString(), "token")
        api.projects(config, archived = true)
        api.registerNotifications(
            config,
            NotificationRegistrationRequest("fid-1234567890", listOf(NotificationKind.Run)),
            "notification-01",
        )

        assertEquals("/api/v1/projects?archived=true", server.takeRequest().path)
        val registration = server.takeRequest()
        assertEquals("/api/v1/notifications", registration.path)
        assertTrue(registration.body.readUtf8().contains("\"installationId\":\"fid-1234567890\""))
    }
}
