package com.haridhayal.hermes.feature.chat

import com.haridhayal.hermes.core.model.MessageDto
import com.haridhayal.hermes.core.model.MessageContentFormat
import org.junit.Assert.assertEquals
import org.junit.Test

class MessageVisibilityTest {
    @Test
    fun rawToolPayloadsAreExcludedFromTheTranscript() {
        val messages = listOf(
            message("user", "What's on today's food log?"),
            message("tool", "{\"linked_files\":[\"references/menu.md\"]}"),
            message("assistant", "There are no entries for today."),
            message("future_internal_role", "internal payload"),
            message("assistant", ""),
        )

        assertEquals(
            listOf("user", "assistant"),
            userVisibleMessages(messages).map { it.role },
        )
    }

    @Test
    fun supportedHistoryRolesRemainVisible() {
        val messages = listOf(
            message("user", "User"),
            message("assistant", "Assistant"),
            message("system", "System"),
            message("cron", "Scheduled result"),
        )

        assertEquals(messages, userVisibleMessages(messages))
    }

    @Test
    fun consecutiveDuplicateAssistantRecordsCollapseToTheLaterRecord() {
        val messages = listOf(
            message("user", "Log my coffee"),
            message("assistant", "Logged.", id = "draft"),
            message("tool", "internal result"),
            message("assistant", "Logged.", id = "persisted"),
        )

        assertEquals(
            listOf("user" to null, "assistant" to "persisted"),
            userVisibleMessages(messages).map { it.role to it.id },
        )
    }

    @Test
    fun equalAssistantRepliesSeparatedByAUserMessageRemainVisible() {
        val messages = listOf(
            message("user", "First"),
            message("assistant", "Done"),
            message("user", "Second"),
            message("assistant", "Done"),
        )

        assertEquals(messages, userVisibleMessages(messages))
    }

    @Test
    fun optimisticOutgoingMessageStaysVisibleUntilTheMatchingServerMessageArrives() {
        val pending = listOf(PendingOutgoing(text = "Choose option A", occurrence = 1))

        assertEquals(
            listOf("Earlier reply", "Choose option A"),
            withOptimisticOutgoing(
                listOf(message("assistant", "Earlier reply")),
                pending,
            ).mapNotNull { it.content },
        )
        assertEquals(
            listOf("Choose option A"),
            withOptimisticOutgoing(
                listOf(message("user", "Choose option A")),
                pending,
            ).mapNotNull { it.content },
        )
    }

    @Test
    fun matchingOptimisticMessagesRemainDistinctUntilEachServerCopyArrives() {
        val pending = listOf(
            PendingOutgoing(text = "Yes", occurrence = 1),
            PendingOutgoing(text = "Yes", occurrence = 2),
        )

        assertEquals(
            listOf("Yes", "Yes"),
            withOptimisticOutgoing(emptyList(), pending).mapNotNull { it.content },
        )
        assertEquals(
            listOf("Yes", "Yes"),
            withOptimisticOutgoing(
                listOf(message("user", "Yes")),
                pending,
            ).mapNotNull { it.content },
        )
    }

    @Test
    fun activityResultsOnlyBelongToTheSessionThatLaunchedThem() {
        assertEquals(true, activityResultBelongsToSession("session-a", "session-a"))
        assertEquals(false, activityResultBelongsToSession("session-a", "session-b"))
        assertEquals(false, activityResultBelongsToSession(null, "session-a"))
    }

    @Test
    fun transcriptKeysAreStableWithinASessionAndDistinctAcrossSessions() {
        val message = message("assistant", "Reply", id = "message-1")

        assertEquals(
            transcriptMessageKey("session-a", message, 0),
            transcriptMessageKey("session-a", message, 3),
        )
        assertEquals(
            false,
            transcriptMessageKey("session-a", message, 0) == transcriptMessageKey("session-b", message, 0),
        )
    }

    private fun message(role: String, content: String, id: String? = null) = MessageDto(
        id = id,
        role = role,
        content = content,
        contentFormat = if (role == "assistant" || role == "cron") {
            MessageContentFormat.Markdown
        } else {
            MessageContentFormat.Plain
        },
    )
}
