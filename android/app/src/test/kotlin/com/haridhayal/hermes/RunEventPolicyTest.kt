package com.haridhayal.hermes

import kotlinx.coroutines.CancellationException
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class RunEventPolicyTest {
    @Test
    fun deltasToolsAndReasoningNeverRefreshPersistedMessages() {
        listOf(
            "message.delta",
            "assistant.delta",
            "tool.started",
            "tool.progress",
            "tool.completed",
            "reasoning.available",
            "approval.request",
        ).forEach { type ->
            val policy = runEventPolicy(type, hasRunId = true, wasRunning = false)
            assertTrue("$type should keep the run active", policy.running)
            assertFalse("$type should not refresh history", policy.refreshMessages)
        }
    }

    @Test
    fun terminalEventsStopTheRunAndRefreshPersistedMessages() {
        listOf("run.completed", "run.failed", "run.cancelled", "done", "error").forEach { type ->
            val policy = runEventPolicy(type, hasRunId = true, wasRunning = true)
            assertFalse("$type should stop the run", policy.running)
            assertTrue("$type should refresh history", policy.refreshMessages)
        }
    }

    @Test
    fun historicalReplayNeverMarksACompletedRunAsWorking() {
        val policy = runEventPolicy(
            type = "tool.started",
            hasRunId = true,
            wasRunning = false,
            runActive = false,
        )
        assertFalse(policy.running)
        assertFalse(policy.refreshMessages)
    }

    @Test
    fun replayFromAnActiveRunStillShowsWorking() {
        val policy = runEventPolicy(
            type = "tool.started",
            hasRunId = true,
            wasRunning = false,
            runActive = true,
        )
        assertTrue(policy.running)
    }

    @Test
    fun unrelatedProjectEventsPreserveTheCurrentRunState() {
        val whileRunning = runEventPolicy("cron.delivered", hasRunId = false, wasRunning = true)
        val whileIdle = runEventPolicy("cron.delivered", hasRunId = false, wasRunning = false)
        assertTrue(whileRunning.running)
        assertFalse(whileIdle.running)
        assertTrue(whileRunning.refreshMessages)
        assertTrue(whileIdle.refreshMessages)
    }

    @Test
    fun normalStreamCloseSettlesOnlyTheSessionThatIsStillSelected() {
        assertTrue(
            streamCompletionSettlesSelection(
                cause = null,
                streamProjectId = "project",
                streamSessionId = "session",
                selectedProjectId = "project",
                selectedSessionId = "session",
            ),
        )
        assertFalse(
            streamCompletionSettlesSelection(
                cause = CancellationException("switched chats"),
                streamProjectId = "project",
                streamSessionId = "session",
                selectedProjectId = "project",
                selectedSessionId = "session",
            ),
        )
        assertFalse(
            streamCompletionSettlesSelection(
                cause = null,
                streamProjectId = "project",
                streamSessionId = "old-session",
                selectedProjectId = "project",
                selectedSessionId = "new-session",
            ),
        )
    }

    @Test
    fun lateSendResultsOnlyApplyToTheirStillSelectedConversation() {
        assertTrue(
            selectionMatches(
                targetProjectId = "project-a",
                targetSessionId = "session-a",
                selectedProjectId = "project-a",
                selectedSessionId = "session-a",
            ),
        )
        assertFalse(
            selectionMatches(
                targetProjectId = "project-a",
                targetSessionId = "session-a",
                selectedProjectId = "project-a",
                selectedSessionId = "session-b",
            ),
        )
        assertFalse(
            selectionMatches(
                targetProjectId = "project-a",
                targetSessionId = "session-a",
                selectedProjectId = "project-b",
                selectedSessionId = "session-a",
            ),
        )
    }
}
