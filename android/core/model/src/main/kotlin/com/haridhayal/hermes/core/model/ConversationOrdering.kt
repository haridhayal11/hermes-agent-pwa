package com.haridhayal.hermes.core.model

/** Stable ordering that never treats a user-editable title as identity. */
fun Iterable<SessionDto>.recentFirst(): List<SessionDto> = sortedWith(
    compareByDescending<SessionDto> { it.lastActiveAt }
        .thenByDescending { it.createdAt }
        .thenBy { it.id },
)
