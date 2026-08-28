package com.haridhayal.hermes.feature.settings

import org.junit.Assert.assertEquals
import org.junit.Test

class SettingsOrderTest {
    @Test
    fun sectionsMatchTheCrossClientInformationArchitecture() {
        assertEquals(
            listOf(
                "Appearance",
                "Agent",
                "Chat",
                "Notifications",
                "Scheduled",
                "Connection",
                "Archived projects",
                "Data",
                "About",
                "Device",
            ),
            SETTINGS_SECTION_ORDER,
        )
    }
}
