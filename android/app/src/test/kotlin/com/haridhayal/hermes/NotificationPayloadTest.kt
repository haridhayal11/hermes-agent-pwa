package com.haridhayal.hermes

import com.haridhayal.hermes.notifications.notificationDestination
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class NotificationPayloadTest {
    @Test
    fun encodedChatUrlOpensTheExactProjectAndSession() {
        val target = notificationDestination(
            mapOf("url" to "/p/food%20log/s/morning%2Fbranch"),
        )

        assertEquals("food log", target?.projectId)
        assertEquals("morning/branch", target?.sessionId)
    }

    @Test
    fun directPayloadFieldsTakePrecedence() {
        val target = notificationDestination(
            mapOf(
                "projectId" to "direct-project",
                "sessionId" to "direct-session",
                "url" to "/p/other/s/other",
            ),
        )

        assertEquals("direct-project", target?.projectId)
        assertEquals("direct-session", target?.sessionId)
    }

    @Test
    fun unrelatedUrlsDoNotInventADestination() {
        assertNull(notificationDestination(mapOf("url" to "/settings")))
    }
}
