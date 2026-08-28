package com.haridhayal.hermes.feature.chat

import androidx.activity.ComponentActivity
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotDisplayed
import androidx.compose.ui.test.junit4.v2.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import com.haridhayal.hermes.core.data.DevicePreferences
import com.haridhayal.hermes.core.designsystem.HermesTheme
import com.haridhayal.hermes.core.model.CurrentModelDto
import com.haridhayal.hermes.core.model.ModelChoiceDto
import com.haridhayal.hermes.core.model.ModelProviderDto
import com.haridhayal.hermes.core.model.ModelsResponse
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

class ChatScreenTest {
    @get:Rule
    val composeRule = createAndroidComposeRule<ComponentActivity>()

    @Test
    fun headerAndComposerExposeTheNativeControls() {
        showChat(reasoning = true)

        composeRule.onNodeWithTag("project-title").assertIsDisplayed()
        composeRule.onNodeWithTag("session-title").assertIsDisplayed()
        val projectTop = composeRule.onNodeWithTag("project-title")
            .fetchSemanticsNode().boundsInRoot.top
        val sessionTop = composeRule.onNodeWithTag("session-title")
            .fetchSemanticsNode().boundsInRoot.top
        assertTrue(projectTop < sessionTop)

        composeRule.onNodeWithContentDescription("Choose model").fetchSemanticsNode()
        composeRule.onNodeWithContentDescription("Choose thinking effort").fetchSemanticsNode()
        composeRule.onNodeWithContentDescription("Take a photo").assertIsEnabled()
    }

    @Test
    fun modelAndThinkingChoicesDismissTheirSheets() {
        var selectedProvider: String? = null
        var selectedModel: String? = null
        var selectedThinking: String? = null
        showChat(
            reasoning = true,
            onSelectModel = { provider, model ->
                selectedProvider = provider
                selectedModel = model
            },
            onThinkingChange = { selectedThinking = it },
        )

        composeRule.onNodeWithContentDescription("Choose model").performScrollTo().performClick()
        composeRule.onNodeWithText("Model").assertIsDisplayed()
        composeRule.onNodeWithText("reasoner").performClick()
        composeRule.runOnIdle {
            assertEquals("provider", selectedProvider)
            assertEquals("reasoner", selectedModel)
        }
        composeRule.onNodeWithText("Model").assertIsNotDisplayed()

        composeRule.onNodeWithContentDescription("Choose thinking effort").performScrollTo().performClick()
        composeRule.onNodeWithText("Thinking").assertIsDisplayed()
        composeRule.onNodeWithText("High").performClick()
        composeRule.runOnIdle { assertEquals("high", selectedThinking) }
        composeRule.onNodeWithText("Thinking").assertIsNotDisplayed()
    }

    @Test
    fun thinkingControlIsHiddenWhenTheModelDoesNotSupportIt() {
        showChat(reasoning = false)

        composeRule.onNodeWithContentDescription("Choose model").assertIsDisplayed()
        composeRule.onNodeWithContentDescription("Choose thinking effort").assertIsNotDisplayed()
    }

    private fun showChat(
        reasoning: Boolean,
        onSelectModel: (String?, String?) -> Unit = { _, _ -> },
        onThinkingChange: (String?) -> Unit = {},
    ) {
        val models = ModelsResponse(
            providers = listOf(
                ModelProviderDto(
                    slug = "provider",
                    name = "Provider",
                    isCurrent = true,
                    models = listOf(ModelChoiceDto("reasoner", reasoning = reasoning)),
                ),
            ),
            current = CurrentModelDto("reasoner", "provider"),
        )
        composeRule.setContent {
            HermesTheme {
                ChatScreen(
                    projectName = "Project Alpha",
                    sessionTitle = "Session Beta",
                    agentName = "Hermes",
                    preferences = DevicePreferences(haptics = false),
                    modelSelection = null,
                    models = models,
                    modelsRefreshing = false,
                    messages = emptyList(),
                    activity = emptyList(),
                    pendingCount = 0,
                    running = false,
                    scheduled = false,
                    onMenu = {},
                    onScheduledVisible = {},
                    onSend = { _, _ -> },
                    onApproval = { _, _, _ -> true },
                    onStop = {},
                    onRefreshModels = {},
                    onSelectModel = onSelectModel,
                    onThinkingChange = onThinkingChange,
                    onFastChange = {},
                    onNewChat = {},
                    onFork = {},
                    onRename = {},
                    onDelete = {},
                    onProjectSettings = {},
                )
            }
        }
    }
}
