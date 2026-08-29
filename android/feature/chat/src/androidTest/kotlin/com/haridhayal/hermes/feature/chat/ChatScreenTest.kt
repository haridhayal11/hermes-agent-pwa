package com.haridhayal.hermes.feature.chat

import androidx.activity.ComponentActivity
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotDisplayed
import androidx.compose.ui.test.junit4.v2.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performTextInput
import com.haridhayal.hermes.core.data.DevicePreferences
import com.haridhayal.hermes.core.designsystem.HermesTheme
import com.haridhayal.hermes.core.model.CurrentModelDto
import com.haridhayal.hermes.core.model.ModelChoiceDto
import com.haridhayal.hermes.core.model.ModelProviderDto
import com.haridhayal.hermes.core.model.ModelsResponse
import com.haridhayal.hermes.core.model.MessageDto
import com.haridhayal.hermes.core.model.MessageContentFormat
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

    @Test
    fun optimisticMessageDoesNotFollowTheUserIntoAnotherSession() {
        val selectedSessionId = mutableStateOf("session-a")
        composeRule.setContent {
            HermesTheme {
                ChatScreen(
                    projectName = "Project Alpha",
                    sessionId = selectedSessionId.value,
                    sessionTitle = selectedSessionId.value,
                    agentName = "Hermes",
                    preferences = DevicePreferences(haptics = false),
                    modelSelection = null,
                    models = models(reasoning = true),
                    modelsRefreshing = false,
                    messages = if (selectedSessionId.value == "session-b") {
                        listOf(
                            MessageDto(
                                id = "b-reply",
                                role = "assistant",
                                content = "Only in session B",
                                contentFormat = MessageContentFormat.Markdown,
                            ),
                        )
                    } else {
                        emptyList()
                    },
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
                    onSelectModel = { _, _ -> },
                    onThinkingChange = {},
                    onFastChange = {},
                    onNewChat = {},
                    onFork = {},
                    onRename = {},
                    onDelete = {},
                    onProjectSettings = {},
                )
            }
        }

        composeRule.onNodeWithTag("message-composer").performTextInput("Sent from session A")
        composeRule.onNodeWithContentDescription("Send").performClick()
        composeRule.onNodeWithText("Sent from session A").assertIsDisplayed()

        composeRule.runOnIdle { selectedSessionId.value = "session-b" }

        composeRule.onNodeWithText("Sent from session A").assertIsNotDisplayed()
        composeRule.onNodeWithText("Only in session B").assertIsDisplayed()
    }

    @Test
    fun sessionSwitchClearsDraftAndOpenSessionDialog() {
        val selectedSessionId = mutableStateOf("session-a")
        composeRule.setContent {
            HermesTheme {
                ChatScreen(
                    projectName = "Project Alpha",
                    sessionId = selectedSessionId.value,
                    sessionTitle = selectedSessionId.value,
                    agentName = "Hermes",
                    preferences = DevicePreferences(haptics = false),
                    modelSelection = null,
                    models = models(reasoning = true),
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
                    onSelectModel = { _, _ -> },
                    onThinkingChange = {},
                    onFastChange = {},
                    onNewChat = {},
                    onFork = {},
                    onRename = {},
                    onDelete = {},
                    onProjectSettings = {},
                )
            }
        }

        composeRule.onNodeWithTag("message-composer").performTextInput("Unsent draft")
        composeRule.onNodeWithContentDescription("Session actions").performClick()
        composeRule.onNodeWithText("Rename").performClick()
        composeRule.onNodeWithText("Rename chat").assertIsDisplayed()

        composeRule.runOnIdle { selectedSessionId.value = "session-b" }

        val composerText = composeRule.onNodeWithTag("message-composer")
            .fetchSemanticsNode()
            .config[SemanticsProperties.EditableText]
            .text
        assertEquals("", composerText)
        composeRule.onNodeWithText("Rename chat").assertIsNotDisplayed()
    }

    @Test
    fun serverDeclaredMarkdownRendersWhilePlainMessagesStayLiteral() {
        showChat(
            reasoning = false,
            messages = listOf(
                MessageDto(
                    id = "assistant-markdown",
                    role = "assistant",
                    content = "**Agent bold** and `agent code`",
                    contentFormat = MessageContentFormat.Markdown,
                ),
                MessageDto(
                    id = "assistant-plain",
                    role = "assistant",
                    content = "**Plain agent stays literal**",
                    contentFormat = MessageContentFormat.Plain,
                ),
                MessageDto(
                    id = "cron-markdown",
                    role = "cron",
                    content = "**Scheduled bold** and `scheduled code`",
                    contentFormat = MessageContentFormat.Markdown,
                ),
                MessageDto(
                    id = "user-plain",
                    role = "user",
                    content = "**User stays literal**",
                    contentFormat = MessageContentFormat.Plain,
                ),
            ),
        )

        composeRule.onNodeWithText("Agent bold and agent code").assertIsDisplayed()
        composeRule.onAllNodesWithText("**Agent bold** and `agent code`").assertCountEquals(0)
        composeRule.onNodeWithText("**Plain agent stays literal**").assertIsDisplayed()
        composeRule.onNodeWithText("Scheduled bold and scheduled code").assertIsDisplayed()
        composeRule.onNodeWithText("**User stays literal**").assertIsDisplayed()
    }

    private fun showChat(
        reasoning: Boolean,
        messages: List<MessageDto> = emptyList(),
        onSelectModel: (String?, String?) -> Unit = { _, _ -> },
        onThinkingChange: (String?) -> Unit = {},
    ) {
        composeRule.setContent {
            HermesTheme {
                ChatScreen(
                    projectName = "Project Alpha",
                    sessionId = "session-beta",
                    sessionTitle = "Session Beta",
                    agentName = "Hermes",
                    preferences = DevicePreferences(haptics = false),
                    modelSelection = null,
                    models = models(reasoning),
                    modelsRefreshing = false,
                    messages = messages,
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

    private fun models(reasoning: Boolean) = ModelsResponse(
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
}
