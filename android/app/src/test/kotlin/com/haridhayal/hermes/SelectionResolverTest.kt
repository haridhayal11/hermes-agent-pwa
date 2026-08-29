package com.haridhayal.hermes

import com.haridhayal.hermes.core.data.ProjectTree
import com.haridhayal.hermes.core.model.MessageDto
import com.haridhayal.hermes.core.model.MessageContentFormat
import com.haridhayal.hermes.core.model.ProjectDto
import com.haridhayal.hermes.core.model.SessionDto
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class SelectionResolverTest {
    private val first = project("p1", "s1", 20)
    private val second = project("p2", "s2", 10)
    private val tree = ProjectTree(
        projects = listOf(first, second),
        sessions = listOf(session("s1", "p1", 20), session("s2", "p2", 10)),
    )

    @Test
    fun coldStartUsesMostRecentProjectsActiveSession() {
        assertEquals(ResolvedSelection("p1", "s1"), resolveSelection(tree, null, null))
    }

    @Test
    fun invalidCachedProjectAndSessionAreCorrectedTogether() {
        assertEquals(ResolvedSelection("p1", "s1"), resolveSelection(tree, "missing", "s2"))
    }

    @Test
    fun explicitSessionSwitchIsPreservedWithinItsProject() {
        assertEquals(ResolvedSelection("p2", "s2"), resolveSelection(tree, "p2", "s2"))
    }

    @Test
    fun explicitScheduledSessionIsPreservedAfterItsUnreadCountIsCleared() {
        val project = ProjectDto(
            id = "p1",
            name = "p1",
            activeSessionId = "chat",
            scheduledSessionId = "p1__scheduled",
            unreadScheduledCount = 0,
            createdAt = 1,
            lastActiveAt = 20,
        )
        val sessions = listOf(
            session("chat", "p1", 20),
            session("p1__scheduled", "p1", 10, kind = "scheduled"),
        )

        assertEquals(
            ResolvedSelection("p1", "p1__scheduled"),
            resolveSelection(ProjectTree(listOf(project), sessions), "p1", "p1__scheduled"),
        )
    }

    @Test
    fun aLaterManualSelectionSupersedesAPendingProjectOpen() {
        val pendingProjectOpen = 1L
        val manualSelection = 2L

        assertFalse(navigationResultIsCurrent(pendingProjectOpen, manualSelection))
        assertTrue(navigationResultIsCurrent(manualSelection, manualSelection))
    }

    @Test
    fun scheduledNotificationTargetMustBelongToTheRequestedProject() {
        val scheduled = session("p1__scheduled", "p1", 10, kind = "scheduled")
        val scheduledTree = ProjectTree(listOf(first, second), tree.sessions + scheduled)

        assertTrue(selectionExists(scheduledTree, "p1", "p1__scheduled"))
        assertFalse(selectionExists(scheduledTree, "p2", "p1__scheduled"))
        assertFalse(selectionExists(tree, "p1", "p1__scheduled"))
    }

    @Test
    fun anotherDevicesFallbackDoesNotOverrideTheLocalSession() {
        val project = project("p1", "s2", 20)
        val sessions = listOf(session("s1", "p1", 10), session("s2", "p1", 20))

        assertEquals(
            ResolvedSelection("p1", "s1"),
            resolveSelection(ProjectTree(listOf(project), sessions), "p1", "s1"),
        )
    }

    @Test
    fun coldStartIgnoresAStaleRememberedChatAndUsesTheMostRecentConversation() {
        val staleProject = project("p1", "old", 20)
        val sessions = listOf(
            session("old", "p1", 10),
            session("recent", "p1", 30),
        )

        assertEquals(
            ResolvedSelection("p1", "recent"),
            resolveSelection(ProjectTree(listOf(staleProject), sessions), null, null),
        )
    }

    @Test
    fun aProjectWithoutSessionsRemainsSelectedWithoutInventingASession() {
        val empty = ProjectTree(listOf(project("empty", "", 1)), emptyList())
        val selection = resolveSelection(empty, null, null)
        assertEquals("empty", selection.projectId)
        assertNull(selection.sessionId)
    }

    @Test
    fun messagesFromThePreviousSessionAreHiddenDuringASelectionChange() {
        val oldMessages = listOf(
            MessageDto(
                role = "assistant",
                content = "Old reply",
                contentFormat = MessageContentFormat.Markdown,
            ),
        )
        val snapshot = SessionMessagesSnapshot("old-session", oldMessages)

        assertEquals(oldMessages, messagesForSession(snapshot, "old-session"))
        assertEquals(emptyList<MessageDto>(), messagesForSession(snapshot, "new-session"))
    }

    private fun project(id: String, activeSessionId: String, lastActiveAt: Long) = ProjectDto(
        id = id,
        name = id,
        activeSessionId = activeSessionId,
        createdAt = 1,
        lastActiveAt = lastActiveAt,
    )

    private fun session(
        id: String,
        projectId: String,
        lastActiveAt: Long,
        kind: String = "chat",
    ) = SessionDto(
        id = id,
        projectId = projectId,
        title = id,
        createdAt = 1,
        lastActiveAt = lastActiveAt,
        kind = kind,
    )
}
