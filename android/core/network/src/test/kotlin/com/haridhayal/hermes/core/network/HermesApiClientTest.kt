package com.haridhayal.hermes.core.network

import com.haridhayal.hermes.core.model.ConnectionConfig
import com.haridhayal.hermes.core.model.PairingClaimRequest
import com.haridhayal.hermes.core.model.SendMessageRequest
import kotlinx.coroutines.test.runTest
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
}
