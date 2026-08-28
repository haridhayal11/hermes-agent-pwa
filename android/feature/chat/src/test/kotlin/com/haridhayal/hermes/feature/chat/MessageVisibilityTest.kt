package com.haridhayal.hermes.feature.chat

import com.haridhayal.hermes.core.model.MessageDto
import org.junit.Assert.assertEquals
import org.junit.Test

class MessageVisibilityTest {
    @Test
    fun rawToolPayloadsAreExcludedFromTheTranscript() {
        val messages = listOf(
            MessageDto(role = "user", content = "What's on today's food log?"),
            MessageDto(role = "tool", content = "{\"linked_files\":[\"references/menu.md\"]}"),
            MessageDto(role = "assistant", content = "There are no entries for today."),
            MessageDto(role = "future_internal_role", content = "internal payload"),
            MessageDto(role = "assistant", content = ""),
        )

        assertEquals(
            listOf("user", "assistant"),
            userVisibleMessages(messages).map { it.role },
        )
    }

    @Test
    fun supportedHistoryRolesRemainVisible() {
        val messages = listOf(
            MessageDto(role = "user", content = "User"),
            MessageDto(role = "assistant", content = "Assistant"),
            MessageDto(role = "system", content = "System"),
            MessageDto(role = "cron", content = "Scheduled result"),
        )

        assertEquals(messages, userVisibleMessages(messages))
    }

    @Test
    fun consecutiveDuplicateAssistantRecordsCollapseToTheLaterRecord() {
        val messages = listOf(
            MessageDto(role = "user", content = "Log my coffee"),
            MessageDto(id = "draft", role = "assistant", content = "Logged."),
            MessageDto(role = "tool", content = "internal result"),
            MessageDto(id = "persisted", role = "assistant", content = "Logged."),
        )

        assertEquals(
            listOf("user" to null, "assistant" to "persisted"),
            userVisibleMessages(messages).map { it.role to it.id },
        )
    }

    @Test
    fun equalAssistantRepliesSeparatedByAUserMessageRemainVisible() {
        val messages = listOf(
            MessageDto(role = "user", content = "First"),
            MessageDto(role = "assistant", content = "Done"),
            MessageDto(role = "user", content = "Second"),
            MessageDto(role = "assistant", content = "Done"),
        )

        assertEquals(messages, userVisibleMessages(messages))
    }

    @Test
    fun optimisticOutgoingMessageStaysVisibleUntilTheMatchingServerMessageArrives() {
        val pending = listOf(PendingOutgoing(text = "Choose option A", occurrence = 1))

        assertEquals(
            listOf("Earlier reply", "Choose option A"),
            withOptimisticOutgoing(
                listOf(MessageDto(role = "assistant", content = "Earlier reply")),
                pending,
            ).mapNotNull { it.content },
        )
        assertEquals(
            listOf("Choose option A"),
            withOptimisticOutgoing(
                listOf(MessageDto(role = "user", content = "Choose option A")),
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
                listOf(MessageDto(role = "user", content = "Yes")),
                pending,
            ).mapNotNull { it.content },
        )
    }
}
