package com.haridhayal.hermes.feature.chat

import com.haridhayal.hermes.core.model.CurrentModelDto
import com.haridhayal.hermes.core.model.ModelChoiceDto
import com.haridhayal.hermes.core.model.ModelProviderDto
import com.haridhayal.hermes.core.model.ModelSelectionDto
import com.haridhayal.hermes.core.model.ModelsResponse
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.junit.Assert.assertEquals
import org.junit.Test

class ModelControlsTest {
    @Test
    fun capabilitiesRespectTheSelectedProvider() {
        val models = ModelsResponse(
            providers = listOf(
                ModelProviderDto("first", "First", models = listOf(ModelChoiceDto("shared"))),
                ModelProviderDto(
                    "second",
                    "Second",
                    models = listOf(ModelChoiceDto("shared", fast = true, reasoning = true)),
                ),
            ),
            current = CurrentModelDto("shared", "first"),
        )

        assertEquals(ModelCapabilities(false, false), models.capabilitiesFor("shared", "first"))
        assertEquals(ModelCapabilities(true, true), models.capabilitiesFor("shared", "second"))
    }

    @Test
    fun thinkingEffortReadsProjectOptions() {
        val selection = ModelSelectionDto(
            model = null,
            options = buildJsonObject {
                put("reasoning", buildJsonObject {
                    put("enabled", true)
                    put("effort", "high")
                })
            },
        )

        assertEquals("high", selection.reasoningEffort())
    }
}
