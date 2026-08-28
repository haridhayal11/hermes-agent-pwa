package com.haridhayal.hermes

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ErrorStateTest {
    @Test
    fun ordinaryAndAuthenticationErrorsRetainTheirActionState() {
        val ordinary = uiError(1, IllegalStateException("Offline"), requiresPairing = false)
        val authentication = uiError(2, IllegalStateException("Pair again"), requiresPairing = true)

        assertEquals("Offline", ordinary.message)
        assertFalse(ordinary.requiresPairing)
        assertTrue(authentication.requiresPairing)
    }

    @Test
    fun consumedErrorIsRemovedFromUiState() {
        val state = MainUiState(error = uiError(1, RuntimeException(), requiresPairing = false))
        assertNull(state.copy(error = null).error)
    }
}
