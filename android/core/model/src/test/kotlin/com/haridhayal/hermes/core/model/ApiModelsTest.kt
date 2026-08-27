package com.haridhayal.hermes.core.model

import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Test

class ApiModelsTest {
    private val json = Json { ignoreUnknownKeys = true }

    @Test
    fun projectFixtureKeepsActiveSessionAndDeprecatedAlias() {
        val project = json.decodeFromString<ProjectDto>(
            """{"id":"p","name":"Project","activeSessionId":"s2","sessionId":"s2","createdAt":1,"lastActiveAt":2}""",
        )
        assertEquals("s2", project.selectedSessionId)
    }

    @Test
    fun unknownStreamFieldsRemainForwardCompatible() {
        val event = json.decodeFromString<StreamEventDto>(
            """{"type":"future.activity","occurredAt":1,"payload":{"summary":"new"},"future":true}""",
        )
        assertEquals("future.activity", event.type)
    }
}
