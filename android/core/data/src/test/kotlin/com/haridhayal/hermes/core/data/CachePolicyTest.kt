package com.haridhayal.hermes.core.data

import org.junit.Assert.assertEquals
import org.junit.Test

class CachePolicyTest {
    @Test fun evictsLeastRecentlyUsedUntilUnderCap() {
        val entries = listOf(
            CachedMedia("old", 6, 1),
            CachedMedia("middle", 5, 2),
            CachedMedia("new", 4, 3),
        )
        assertEquals(listOf("old"), mediaKeysToEvict(entries, 10))
    }

    @Test fun keepsEverythingAlreadyUnderCap() {
        assertEquals(emptyList<String>(), mediaKeysToEvict(listOf(CachedMedia("a", 5, 1)), 10))
    }
}
