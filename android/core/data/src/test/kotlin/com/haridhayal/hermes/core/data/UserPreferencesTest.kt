package com.haridhayal.hermes.core.data

import com.haridhayal.hermes.core.model.ThemePreference
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class UserPreferencesTest {
    @Test
    fun freshInstallDefaultsMatchThePwa() {
        val value = DevicePreferences()
        assertEquals(ThemePreference.Dark, value.theme)
        assertEquals(TextSizePreference.Normal, value.textSize)
        assertEquals(DisclosurePreference.Expanded, value.toolCalls)
        assertEquals(DisclosurePreference.Collapsed, value.thinking)
        assertFalse(value.reducedMotion)
        assertTrue(value.sendOnEnter)
        assertTrue(value.autoScroll)
        assertTrue(value.showRunDuration)
        assertTrue(value.haptics)
        assertFalse(value.notificationsEnabled)
    }

    @Test
    fun legacyScaleMapsToTheNearestNamedSize() {
        assertEquals(TextSizePreference.Small, textSizeFromLegacy(.9f))
        assertEquals(TextSizePreference.Normal, textSizeFromLegacy(1.02f))
        assertEquals(TextSizePreference.Large, textSizeFromLegacy(1.2f))
    }

    @Test
    fun legacyDisclosurePreservesEnabledState() {
        assertEquals(DisclosurePreference.Expanded, disclosureFromLegacy(true))
        assertEquals(DisclosurePreference.Hidden, disclosureFromLegacy(false))
    }
}
