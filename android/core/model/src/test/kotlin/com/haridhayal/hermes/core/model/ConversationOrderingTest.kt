package com.haridhayal.hermes.core.model

import org.junit.Assert.assertEquals
import org.junit.Test

class ConversationOrderingTest {
    @Test
    fun duplicateTitlesRemainDistinctAndRecentFirst() {
        val old = session("old", lastActiveAt = 10, createdAt = 1)
        val recent = session("recent", lastActiveAt = 30, createdAt = 2)

        assertEquals(listOf("recent", "old"), listOf(old, recent).recentFirst().map { it.id })
    }

    @Test
    fun tiesUseCreationTimeThenDurableId() {
        val first = session("a", lastActiveAt = 20, createdAt = 5)
        val second = session("b", lastActiveAt = 20, createdAt = 6)
        val third = session("c", lastActiveAt = 20, createdAt = 6)

        assertEquals(
            listOf("b", "c", "a"),
            listOf(third, first, second).recentFirst().map { it.id },
        )
    }

    private fun session(id: String, lastActiveAt: Long, createdAt: Long) = SessionDto(
        id = id,
        projectId = "project",
        title = "Same title",
        createdAt = createdAt,
        lastActiveAt = lastActiveAt,
    )
}
