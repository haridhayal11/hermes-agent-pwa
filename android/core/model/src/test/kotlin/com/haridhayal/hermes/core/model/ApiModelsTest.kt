package com.haridhayal.hermes.core.model

import kotlinx.serialization.json.Json
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.encodeToString
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class ApiModelsTest {
    private val json = Json { ignoreUnknownKeys = true }

    @Test
    fun projectFixtureFallsBackToActiveSessionAndDeprecatedAlias() {
        val project = json.decodeFromString<ProjectDto>(
            """{"id":"p","name":"Project","activeSessionId":"s2","sessionId":"s2","createdAt":1,"lastActiveAt":2}""",
        )
        assertEquals("s2", project.selectedSessionId)
    }

    @Test
    fun unreadScheduledInboxWinsOtherwiseLastChatWins() {
        val unread = json.decodeFromString<ProjectDto>(
            """{"id":"p","name":"Project","activeSessionId":"legacy","lastChatSessionId":"chat","scheduledSessionId":"scheduled","unreadScheduledCount":2,"createdAt":1,"lastActiveAt":2}""",
        )
        val read = unread.copy(unreadScheduledCount = 0)

        assertEquals("scheduled", unread.selectedSessionId)
        assertEquals("chat", read.selectedSessionId)
    }

    @Test
    fun unknownStreamFieldsRemainForwardCompatible() {
        val event = json.decodeFromString<StreamEventDto>(
            """{"type":"future.activity","occurredAt":1,"payload":{"summary":"new"},"future":true}""",
        )
        assertEquals("future.activity", event.type)
    }

    @Test
    fun messagePageAcceptsStringNumericAndMissingIds() {
        val page = json.decodeFromString<MessagePage>(
            """{"messages":[{"id":"m-1","role":"user","content_format":"plain"},{"id":42,"role":"assistant","content_format":"markdown"},{"role":"tool","content_format":"plain"}],"nextCursor":null,"hasMore":false}""",
        )
        assertEquals(listOf("m-1", "42", null), page.messages.map { it.id })
        assertEquals(
            listOf(MessageContentFormat.Plain, MessageContentFormat.Markdown, MessageContentFormat.Plain),
            page.messages.map { it.contentFormat },
        )
    }

    @Test
    fun messageContentFormatIsRequiredByTheNativeContract() {
        assertThrows(SerializationException::class.java) {
            json.decodeFromString<MessageDto>("""{"role":"assistant","content":"Reply"}""")
        }
    }

    @Test
    fun catalogAndJobFixturesDecodeIntoTypedModels() {
        val models = json.decodeFromString<ModelsResponse>(
            """{"providers":[{"slug":"openai","name":"OpenAI","isCurrent":true,"models":[{"id":"gpt-5","fast":true}]}],"current":{"model":"gpt-5","provider":"openai"}}""",
        )
        val skills = json.decodeFromString<SkillsResponse>(
            """{"skills":[{"name":"github","description":"GitHub tools"}]}""",
        )
        val toolsets = json.decodeFromString<ToolsetsResponse>(
            """{"toolsets":[{"name":"web","enabled":true,"tools":["search"]}]}""",
        )
        val jobs = json.decodeFromString<JobsResponse>(
            """{"jobs":[{"id":"job-1","name":"Daily","enabled":false,"state":"paused","schedule":{"kind":"cron","display":"Daily"},"schedule_display":"Daily"}]}""",
        )

        assertEquals("gpt-5", models.current.model)
        assertEquals("github", skills.skills.single().name)
        assertEquals(true, toolsets.toolsets.single().enabled)
        assertEquals(false, jobs.jobs.single().enabled)
    }

    @Test
    fun gatewayDefaultCanCarryReasoningOptions() {
        val project = json.decodeFromString<ProjectDto>(
            """{"id":"p","name":"Project","modelSelection":{"model":null,"options":{"reasoning":{"enabled":true,"effort":"high"}}},"activeSessionId":"s","createdAt":1,"lastActiveAt":2}""",
        )

        assertEquals(null, project.modelSelection?.model)
        val reasoning = project.modelSelection?.options?.get("reasoning")?.jsonObject
        assertEquals(true, reasoning?.get("enabled")?.jsonPrimitive?.booleanOrNull)
        assertEquals("high", reasoning?.get("effort")?.jsonPrimitive?.content)
    }

    @Test
    fun jobWriteUsesTheStableWireNamesAndOmitsAnEditRunLimit() {
        val codec = Json { encodeDefaults = true; explicitNulls = false }
        val request = JobWriteRequest(
            name = "Daily",
            schedule = "0 9 * * *",
            prompt = "Summarise",
            deliver = "local",
            skills = listOf("food-log"),
            repeat = null,
            binding = JobBindingDto(projectId = "project-1"),
        )
        val encoded = codec.encodeToString(request)
        val objectValue = codec.parseToJsonElement(encoded).jsonObject

        assertEquals("project-1", objectValue["binding"]?.jsonObject?.get("project_id")?.jsonPrimitive?.content)
        assertEquals(null, objectValue["repeat"])
        assertEquals("0 9 * * *", objectValue["schedule"]?.jsonPrimitive?.content)
    }
}
