package com.haridhayal.hermes.core.data

data class CachedMedia(val key: String, val size: Long, val lastAccessedAt: Long)

fun mediaKeysToEvict(entries: List<CachedMedia>, capBytes: Long): List<String> {
    var total = entries.sumOf { it.size }
    if (total <= capBytes) return emptyList()
    return buildList {
        entries.sortedBy { it.lastAccessedAt }.forEach { entry ->
            if (total > capBytes) {
                add(entry.key)
                total -= entry.size
            }
        }
    }
}
