package com.haridhayal.hermes.feature.chat

import com.haridhayal.hermes.core.data.DisclosurePreference
import com.haridhayal.hermes.core.model.MessageDto
import com.haridhayal.hermes.core.model.StreamEventDto
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ChatPresentationTest {
    private val user = MessageDto(role = "user", content = "Question")

    @Test
    fun exactPersistedAndLiveRepliesRenderAsOnePersistedReply() {
        val assistant = MessageDto(role = "assistant", content = "Complete reply")

        val result = reconcileTranscript(listOf(user, assistant), "Complete reply", running = true)

        assertEquals(listOf(user, assistant), result.messages)
        assertEquals("", result.streaming)
        assertTrue(result.persistedAssistantAfterActivity)
    }

    @Test
    fun moreCompletePersistedReplyReplacesItsLivePrefix() {
        val assistant = MessageDto(role = "assistant", content = "Complete reply from history")

        val result = reconcileTranscript(listOf(user, assistant), "Complete reply", running = true)

        assertEquals(listOf(user, assistant), result.messages)
        assertEquals("", result.streaming)
        assertTrue(result.persistedAssistantAfterActivity)
    }

    @Test
    fun moreCompleteLiveReplyReplacesItsPersistedPrefix() {
        val assistant = MessageDto(role = "assistant", content = "Complete reply")

        val result = reconcileTranscript(
            listOf(user, assistant),
            "Complete reply still streaming",
            running = true,
        )

        assertEquals(listOf(user), result.messages)
        assertEquals("Complete reply still streaming", result.streaming)
        assertFalse(result.persistedAssistantAfterActivity)
    }

    @Test
    fun completedRunsLeavePersistedHistoryUntouched() {
        val assistant = MessageDto(role = "assistant", content = "Complete reply")

        val result = reconcileTranscript(listOf(user, assistant), "Complete reply", running = false)

        assertEquals(listOf(user, assistant), result.messages)
        assertEquals("Complete reply", result.streaming)
    }

    @Test
    fun hiddenCollapsedAndExpandedToolPresentationBehaveAsConfigured() {
        assertFalse(toolsInitiallyExpanded(DisclosurePreference.Hidden))
        assertFalse(toolsInitiallyExpanded(DisclosurePreference.Collapsed))
        assertTrue(toolsInitiallyExpanded(DisclosurePreference.Expanded))

        assertFalse(toolOnlyActivityIsVisible(DisclosurePreference.Hidden))
        assertTrue(toolOnlyActivityIsVisible(DisclosurePreference.Collapsed))
        assertTrue(toolOnlyActivityIsVisible(DisclosurePreference.Expanded))
    }

    @Test
    fun hiddenToolsDoNotSuppressRunStatusOrActionableActivity() {
        assertTrue(toolOnlyActivityIsVisible(DisclosurePreference.Hidden, running = true))
        assertTrue(toolOnlyActivityIsVisible(DisclosurePreference.Hidden, hasApproval = true))
        assertTrue(toolOnlyActivityIsVisible(DisclosurePreference.Hidden, hasFailure = true))
        assertTrue(toolOnlyActivityIsVisible(DisclosurePreference.Hidden, streaming = "Reply"))
    }

    @Test
    fun reasoningBoundaryMovesPreToolNarrationOutOfTheAnswer() {
        val events = listOf(
            event("message.delta", 1) { put("delta", "I will inspect that.") },
            event("reasoning.available", 2) { put("text", "I will inspect that.") },
            event("tool.started", 3) { put("tool", "search") },
            event("tool.progress", 4) { put("tool", "_thinking"); put("delta", "Checking evidence.") },
            event("message.delta", 5) { put("delta", "Here is the answer.") },
        )

        val state = buildActivityState(events, running = true)

        assertEquals("I will inspect that.Checking evidence.", state.thinking)
        assertEquals("Here is the answer.", state.streaming)
    }

    @Test
    fun hardwareEnterOnlySendsTheUnshiftedKeyDownWithContent() {
        assertTrue(shouldSendHardwareEnter(true, true, true, false, true))
        assertFalse(shouldSendHardwareEnter(true, true, true, true, true))
        assertFalse(shouldSendHardwareEnter(true, true, false, false, true))
        assertFalse(shouldSendHardwareEnter(false, true, true, false, true))
    }

    @Test
    fun reducedMotionSelectsInstantFollowWithoutDisablingProgress() {
        assertEquals(FollowScrollMode.Animated, followScrollMode(true, false))
        assertEquals(FollowScrollMode.Instant, followScrollMode(true, true))
        assertEquals(FollowScrollMode.None, followScrollMode(false, false))
    }

    @Test
    fun durationFormattingStaysCompact() {
        assertEquals("8s", formatDuration(8))
        assertEquals("2m 5s", formatDuration(125))
        assertEquals("1h 1m", formatDuration(3_660))
    }

    @Test
    fun approvalUsesTheServerChoicesAndClearsAfterItsResponse() {
        val request = event("approval.request", 1) {
            put("description", "Install the package")
            put("command", "npm install")
            put("pattern_key", "npm install *")
            put("choices", buildJsonArray {
                add(JsonPrimitive("once"))
                add(JsonPrimitive("session"))
                add(JsonPrimitive("deny"))
            })
        }

        val pending = buildActivityState(listOf(request), running = true).approval
        assertEquals("Install the package", pending?.description)
        assertEquals("npm install", pending?.command)
        assertEquals(listOf("once", "session", "deny"), pending?.choices)

        val answered = event("approval.responded", 2) { }
        assertEquals(null, buildActivityState(listOf(request, answered), running = true).approval)
    }

    @Test
    fun approvalFallbackMatchesThePwaForBlockedAndPermanentDisabledRequests() {
        val blocked = event("approval.request", 1) { put("smart_denied", true) }.toPendingApproval()
        val temporary = event("approval.request", 2) { put("allow_permanent", false) }.toPendingApproval()

        assertEquals(listOf("once", "deny"), blocked?.choices)
        assertEquals(listOf("once", "session", "deny"), temporary?.choices)
    }

    private fun event(
        type: String,
        sequence: Long,
        payload: kotlinx.serialization.json.JsonObjectBuilder.() -> Unit,
    ) = StreamEventDto(
        type = type,
        runId = "run-1",
        sequence = sequence,
        occurredAt = sequence,
        payload = buildJsonObject(payload),
    )

    private fun toolOnlyActivityIsVisible(
        disclosure: DisclosurePreference,
        running: Boolean = false,
        hasApproval: Boolean = false,
        hasFailure: Boolean = false,
        streaming: String = "",
    ) = shouldShowActivity(
        toolCount = 1,
        thinking = "",
        streaming = streaming,
        hasApproval = hasApproval,
        hasFailure = hasFailure,
        running = running,
        toolDisclosure = disclosure,
        thinkingDisclosure = DisclosurePreference.Hidden,
    )
}
