package com.haridhayal.hermes.feature.chat

import android.content.pm.PackageManager
import android.net.Uri
import android.provider.Settings
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ArrowUpward
import androidx.compose.material.icons.outlined.AttachFile
import androidx.compose.material.icons.outlined.Build
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.Image
import androidx.compose.material.icons.outlined.Menu
import androidx.compose.material.icons.outlined.MoreVert
import androidx.compose.material.icons.outlined.PhotoCamera
import androidx.compose.material.icons.outlined.Stop
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.IconButtonDefaults
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.isShiftPressed
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.LifecycleResumeEffect
import com.haridhayal.hermes.core.data.DevicePreferences
import com.haridhayal.hermes.core.data.DisclosurePreference
import com.haridhayal.hermes.core.model.MessageDto
import com.haridhayal.hermes.core.model.ModelSelectionDto
import com.haridhayal.hermes.core.model.ModelsResponse
import com.haridhayal.hermes.core.model.StreamEventDto
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChatScreen(
    projectName: String,
    sessionTitle: String,
    agentName: String,
    preferences: DevicePreferences,
    modelSelection: ModelSelectionDto?,
    models: ModelsResponse?,
    modelsRefreshing: Boolean,
    messages: List<MessageDto>,
    activity: List<StreamEventDto>,
    pendingCount: Int,
    running: Boolean,
    scheduled: Boolean,
    onMenu: () -> Unit,
    onScheduledVisible: () -> Unit,
    onSend: (String, List<Uri>) -> Unit,
    onApproval: suspend (runId: String, choice: String, all: Boolean) -> Boolean,
    onStop: () -> Unit,
    onRefreshModels: () -> Unit,
    onSelectModel: (provider: String?, model: String?) -> Unit,
    onThinkingChange: (String?) -> Unit,
    onFastChange: (Boolean) -> Unit,
    onNewChat: () -> Unit,
    onFork: () -> Unit,
    onRename: (String) -> Unit,
    onDelete: () -> Unit,
    onProjectSettings: () -> Unit,
) {
    var text by remember { mutableStateOf("") }
    var attachments by remember { mutableStateOf<List<Uri>>(emptyList()) }
    var menu by remember { mutableStateOf(false) }
    var renaming by remember { mutableStateOf(false) }
    var deleting by remember { mutableStateOf(false) }
    var modelPickerOpen by remember { mutableStateOf(false) }
    var thinkingPickerOpen by remember { mutableStateOf(false) }
    var renamedTitle by remember(sessionTitle) { mutableStateOf(sessionTitle) }
    var pendingCaptureUri by rememberSaveable { mutableStateOf<String?>(null) }
    val context = LocalContext.current
    val haptics = LocalHapticFeedback.current
    val scope = rememberCoroutineScope()
    val images = rememberLauncherForActivityResult(ActivityResultContracts.PickMultipleVisualMedia(8)) {
        attachments = attachments + it
    }
    val files = rememberLauncherForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) {
        attachments = attachments + it
    }
    val camera = rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { captured ->
        val uri = pendingCaptureUri?.let(Uri::parse)
        pendingCaptureUri = null
        if (captured && uri != null) {
            attachments = attachments + uri
        } else if (uri != null) {
            scope.launch(Dispatchers.IO) { CameraCaptureStore.delete(context, uri) }
        }
    }
    val colors = composerColors()
    LaunchedEffect(context) {
        withContext(Dispatchers.IO) { CameraCaptureStore.prune(context) }
    }
    val reduceMotion = preferences.reducedMotion || remember(context) {
        Settings.Global.getFloat(context.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f
    }
    val effectiveModel = modelSelection?.model ?: models?.current?.model
    val effectiveProvider = modelSelection?.provider ?: models?.current?.provider
    val modelCapabilities = models.capabilitiesFor(effectiveModel, effectiveProvider)
    val activityState = remember(activity, running) { buildActivityState(activity, running) }
    val visibleMessages = remember(messages) { userVisibleMessages(messages) }
    val latestScheduledReport = remember(visibleMessages) {
        visibleMessages.lastOrNull { it.role == "cron" && it.id != null }
    }
    LifecycleResumeEffect(scheduled, latestScheduledReport?.id) {
        if (scheduled && latestScheduledReport != null) onScheduledVisible()
        onPauseOrDispose { }
    }
    val presentation = remember(visibleMessages, activityState.streaming, running) {
        reconcileTranscript(visibleMessages, activityState.streaming, running)
    }
    val displayMessages = presentation.messages
    var optimisticOutgoing by remember { mutableStateOf<List<PendingOutgoing>>(emptyList()) }
    val transcriptMessages = remember(displayMessages, optimisticOutgoing) {
        withOptimisticOutgoing(displayMessages, optimisticOutgoing)
    }
    LaunchedEffect(displayMessages, running) {
        if (!running) {
            optimisticOutgoing = optimisticOutgoing.filter { pending ->
                displayMessages.count { it.role == "user" && it.content == pending.text } < pending.occurrence
            }
        }
    }
    val displayActivityState = activityState.copy(streaming = presentation.streaming)
    var submittingApprovalRunId by remember { mutableStateOf<String?>(null) }
    var hiddenApprovalRunId by remember { mutableStateOf<String?>(null) }
    var hiddenPinnedQuestionKey by remember { mutableStateOf<String?>(null) }
    val approval = displayActivityState.approval?.takeUnless { it.runId == hiddenApprovalRunId }
    LaunchedEffect(displayActivityState.approval?.runId) {
        // A response event clears the source approval. Forget the optimistic
        // hide at that point so a later approval for this run is visible.
        if (displayActivityState.approval == null) {
            hiddenApprovalRunId = null
            submittingApprovalRunId = null
        }
    }
    val pinnedQuestionCandidate = remember(transcriptMessages, approval, submittingApprovalRunId) {
        if (approval != null || submittingApprovalRunId != null) {
            null
        } else {
            transcriptMessages.lastOrNull()
                ?.takeIf { it.role == "assistant" }
                ?.content
                ?.let(::extractQuestion)
        }
    }
    // A reply is dispatched asynchronously, so hide the card before the next
    // transcript update arrives. The last message content makes a stable key
    // even for older events that do not include an id.
    val pinnedQuestionKey = transcriptMessages.lastOrNull()
        ?.takeIf { it.role == "assistant" }
        ?.let { "${it.id ?: "content"}:${it.content}" }
    val pinnedQuestion = pinnedQuestionCandidate
        ?.takeUnless { pinnedQuestionKey == hiddenPinnedQuestionKey }
    LaunchedEffect(pinnedQuestionKey) {
        if (pinnedQuestionKey == null) hiddenPinnedQuestionKey = null
    }
    val listState = rememberLazyListState()
    var wasRunning by remember { mutableStateOf(running) }
    LaunchedEffect(running, preferences.haptics) {
        if (wasRunning && !running && preferences.haptics) {
            haptics.performHapticFeedback(HapticFeedbackType.LongPress)
        }
        wasRunning = running
    }
    LaunchedEffect(
        transcriptMessages.size,
        displayActivityState.streaming.length,
        displayActivityState.thinking.length,
        displayActivityState.tools.size,
        pendingCount,
        approval,
        pinnedQuestion,
        preferences.autoScroll,
        reduceMotion,
    ) {
        val followMode = followScrollMode(preferences.autoScroll, reduceMotion)
        if (followMode == FollowScrollMode.None) return@LaunchedEffect
        delay(1)
        val last = listState.layoutInfo.totalItemsCount - 1
        if (last >= 0) {
            if (followMode == FollowScrollMode.Instant) listState.scrollToItem(last)
            else listState.animateScrollToItem(last)
        }
    }
    var forceScrollToBottom by remember { mutableStateOf(0L) }
    val sendMessage: (String, List<Uri>) -> Unit = { message, messageAttachments ->
        if (message.isNotBlank()) {
            val occurrence = displayMessages.count { it.role == "user" && it.content == message } +
                optimisticOutgoing.count { it.text == message } + 1
            optimisticOutgoing = optimisticOutgoing + PendingOutgoing(message, occurrence)
        }
        forceScrollToBottom += 1
        onSend(message, messageAttachments)
    }
    LaunchedEffect(forceScrollToBottom) {
        if (forceScrollToBottom > 0) {
            // Wait for the optimistic message/card dismissal to take part in
            // layout, then force the newest conversation state into view.
            delay(1)
            val last = listState.layoutInfo.totalItemsCount - 1
            if (last >= 0) listState.scrollToItem(last)
        }
    }
    Scaffold(
        containerColor = colors.page,
        topBar = {
            TopAppBar(
                title = {
                    Column(verticalArrangement = Arrangement.spacedBy(1.dp)) {
                        Text(
                            projectName,
                            modifier = Modifier.testTag("project-title"),
                            style = MaterialTheme.typography.titleMedium,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        Text(
                            sessionTitle,
                            modifier = Modifier.testTag("session-title"),
                            color = colors.muted,
                            style = MaterialTheme.typography.labelMedium,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                },
                navigationIcon = { IconButton(onClick = onMenu) { Icon(Icons.Outlined.Menu, "Open navigation") } },
                actions = {
                    IconButton(onClick = { menu = true }) { Icon(Icons.Outlined.MoreVert, "Session actions") }
                    DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                        DropdownMenuItem(text = { Text("New chat") }, onClick = { menu = false; onNewChat() })
                        if (!scheduled) {
                            DropdownMenuItem(text = { Text("Fork branch") }, onClick = { menu = false; onFork() })
                            DropdownMenuItem(text = { Text("Rename") }, onClick = { menu = false; renaming = true })
                            DropdownMenuItem(text = { Text("Delete branch") }, onClick = { menu = false; deleting = true })
                        }
                        DropdownMenuItem(text = { Text("Project settings") }, onClick = { menu = false; onProjectSettings() })
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = colors.page,
                    titleContentColor = colors.ink,
                    navigationIconContentColor = colors.ink,
                    actionIconContentColor = colors.ink,
                ),
            )
        },
        bottomBar = {
            Column {
                if (approval != null || pinnedQuestion != null) {
                    DecisionSlot(maxHeight = (LocalConfiguration.current.screenHeightDp * 0.45f).dp) {
                        if (approval != null) {
                            ApprovalCard(
                                approval = approval,
                                agentName = agentName,
                                colors = colors,
                                submitting = submittingApprovalRunId == approval.runId,
                                onRespond = { choice, all ->
                                    if (submittingApprovalRunId == null) {
                                        // Optimistically remove the whole decision slot. A
                                        // failed request restores this exact approval below.
                                        hiddenApprovalRunId = approval.runId
                                        submittingApprovalRunId = approval.runId
                                        forceScrollToBottom += 1
                                        scope.launch {
                                            if (!onApproval(approval.runId, choice, all)) {
                                                hiddenApprovalRunId = null
                                            }
                                            submittingApprovalRunId = null
                                        }
                                    }
                                },
                            )
                        } else if (pinnedQuestion != null) {
                            RecommendationCard(
                                recommendation = pinnedQuestion,
                                colors = colors,
                                onAction = { reply ->
                                    if (preferences.haptics) {
                                        haptics.performHapticFeedback(HapticFeedbackType.LongPress)
                                    }
                                    hiddenPinnedQuestionKey = pinnedQuestionKey
                                    sendMessage(reply, emptyList())
                                },
                            )
                        }
                    }
                }
                ChatComposer(
                    text = text,
                    attachments = attachments,
                    modelLabel = modelSelection?.model ?: "Default",
                    modelPinned = modelSelection?.model != null,
                    supportsThinking = modelCapabilities.reasoning,
                    thinkingEffort = modelSelection.reasoningEffort(),
                    running = running,
                    enabled = !scheduled || latestScheduledReport != null,
                    showModelControls = !scheduled,
                    placeholder = if (scheduled) "Reply to latest report" else null,
                    agentName = agentName,
                    sendOnEnter = preferences.sendOnEnter,
                    textScale = preferences.textSize.scale,
                    onTextChange = { text = it },
                    onChooseImages = {
                        images.launch(
                            PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly),
                        )
                    },
                    onChooseFiles = { files.launch(arrayOf("*/*")) },
                    onTakePhoto = {
                        if (!context.packageManager.hasSystemFeature(PackageManager.FEATURE_CAMERA_ANY)) {
                            Toast.makeText(context, "Camera unavailable", Toast.LENGTH_SHORT).show()
                        } else {
                            runCatching { CameraCaptureStore.createDestination(context) }
                                .onSuccess { uri ->
                                    pendingCaptureUri = uri.toString()
                                    runCatching { camera.launch(uri) }
                                        .onFailure {
                                            pendingCaptureUri = null
                                            scope.launch(Dispatchers.IO) {
                                                CameraCaptureStore.delete(context, uri)
                                            }
                                            Toast.makeText(
                                                context,
                                                "Couldn’t open the camera",
                                                Toast.LENGTH_SHORT,
                                            ).show()
                                        }
                                }
                                .onFailure {
                                    Toast.makeText(
                                        context,
                                        "Couldn’t prepare a photo",
                                        Toast.LENGTH_SHORT,
                                    ).show()
                                }
                        }
                    },
                    onRemoveAttachment = { index ->
                        val removed = attachments.getOrNull(index)
                        attachments = attachments.filterIndexed { at, _ -> at != index }
                        if (removed != null) {
                            scope.launch(Dispatchers.IO) {
                                CameraCaptureStore.delete(context, removed)
                            }
                        }
                    },
                    onPickModel = {
                        modelPickerOpen = true
                        if (models == null) onRefreshModels()
                    },
                    onPickThinking = { thinkingPickerOpen = true },
                    onStop = onStop,
                    onSend = {
                        if (preferences.haptics) haptics.performHapticFeedback(HapticFeedbackType.LongPress)
                        sendMessage(text, attachments)
                        text = ""
                        attachments = emptyList()
                    },
                )
            }
        },
    ) { padding ->
        LazyColumn(
            state = listState,
            modifier = Modifier
                .fillMaxSize()
                .background(colors.page)
                .padding(padding),
            contentPadding = PaddingValues(start = 18.dp, top = 18.dp, end = 18.dp, bottom = 10.dp),
            verticalArrangement = Arrangement.spacedBy(20.dp),
        ) {
            if (transcriptMessages.isEmpty() && !running) {
                item {
                    Text(
                        text = if (scheduled) {
                            "Scheduled reports will appear here after a job runs."
                        } else {
                            "Nothing here yet. This chat stays put — come back whenever."
                        },
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 40.dp),
                        color = colors.muted,
                        style = MaterialTheme.typography.labelLarge,
                        textAlign = TextAlign.Center,
                    )
                }
            }
            itemsIndexed(transcriptMessages) { index, message ->
                val isLast = index == transcriptMessages.lastIndex
                MessageItem(
                    message = message,
                    agentName = agentName,
                    colors = colors,
                    hoistQuestions = isLast && pinnedQuestion != null,
                    onRecommendationAction = if (isLast && !running) {
                        { reply -> sendMessage(reply, emptyList()) }
                    } else {
                        null
                    },
                )
            }
            if (pendingCount > 0) {
                item { QueuedRow(pendingCount, colors) }
            }
            // Live state belongs after every chat message, so working and tool
            // updates always stay at the bottom of the conversation.
            if (shouldShowActivity(
                    toolCount = displayActivityState.tools.size,
                    thinking = displayActivityState.thinking,
                    streaming = displayActivityState.streaming,
                    hasApproval = approval != null,
                    hasFailure = displayActivityState.failure != null,
                    running = displayActivityState.running,
                    toolDisclosure = preferences.toolCalls,
                    thinkingDisclosure = preferences.thinking,
                )
            ) {
                item {
                    LiveActivity(
                        displayActivityState.copy(approval = approval),
                        agentName,
                        preferences.toolCalls,
                        preferences.thinking,
                        preferences.showRunDuration,
                        colors,
                    )
                }
            }
        }
    }
    if (renaming) AlertDialog(
        onDismissRequest = { renaming = false },
        title = { Text("Rename chat") },
        text = { OutlinedTextField(renamedTitle, { renamedTitle = it }, label = { Text("Title") }) },
        confirmButton = { androidx.compose.material3.TextButton(onClick = { onRename(renamedTitle); renaming = false }) { Text("Save") } },
        dismissButton = { androidx.compose.material3.TextButton(onClick = { renaming = false }) { Text("Cancel") } },
    )
    if (deleting) AlertDialog(
        onDismissRequest = { deleting = false },
        title = { Text("Delete this branch?") },
        text = { Text("This removes the selected chat and all child branches.") },
        confirmButton = { androidx.compose.material3.TextButton(onClick = { onDelete(); deleting = false }) { Text("Delete") } },
        dismissButton = { androidx.compose.material3.TextButton(onClick = { deleting = false }) { Text("Cancel") } },
    )
    if (modelPickerOpen) {
        ModelPickerSheet(
            selection = modelSelection,
            models = models,
            refreshing = modelsRefreshing,
            onDismiss = { modelPickerOpen = false },
            onSelect = { provider, model ->
                onSelectModel(provider, model)
                modelPickerOpen = false
            },
            onFastChange = onFastChange,
            onRefresh = onRefreshModels,
        )
    }
    if (thinkingPickerOpen) {
        ThinkingPickerSheet(
            effort = modelSelection.reasoningEffort(),
            onDismiss = { thinkingPickerOpen = false },
            onSelect = onThinkingChange,
        )
    }
}

internal fun userVisibleMessages(messages: List<MessageDto>): List<MessageDto> {
    val visible = mutableListOf<MessageDto>()
    messages.forEach { message ->
        val content = message.content
        if (content.isNullOrEmpty() || message.role !in setOf("user", "assistant", "system", "cron")) {
            return@forEach
        }
        val previous = visible.lastOrNull()
        if (
            message.role == "assistant" &&
            previous?.role == "assistant" &&
            previous.content?.trim() == content.trim()
        ) {
            visible[visible.lastIndex] = message
        } else {
            visible += message
        }
    }
    return visible
}

/** A locally rendered user message waiting for the server transcript to catch up. */
internal data class PendingOutgoing(
    val text: String,
    /** The matching server-message count required before this send is acknowledged. */
    val occurrence: Int,
)

/**
 * Keep an outgoing message visible through a delayed or temporarily stale
 * message refresh. Once the server has rendered the matching occurrence, its
 * copy takes over without producing a duplicate bubble.
 */
internal fun withOptimisticOutgoing(
    messages: List<MessageDto>,
    pending: List<PendingOutgoing>,
): List<MessageDto> = buildList {
    addAll(messages)
    pending.forEach { outgoing ->
        val serverOccurrences = messages.count { it.role == "user" && it.content == outgoing.text }
        if (serverOccurrences < outgoing.occurrence) {
            add(MessageDto(id = "optimistic:${outgoing.occurrence}:${outgoing.text}", role = "user", content = outgoing.text))
        }
    }
}

internal data class TranscriptPresentation(
    val messages: List<MessageDto>,
    val streaming: String,
    val persistedAssistantAfterActivity: Boolean = false,
)

internal fun reconcileTranscript(
    messages: List<MessageDto>,
    streaming: String,
    running: Boolean,
): TranscriptPresentation {
    if (!running || streaming.isBlank()) return TranscriptPresentation(messages, streaming)
    val persisted = messages.lastOrNull()?.takeIf { it.role == "assistant" }?.content
        ?: return TranscriptPresentation(messages, streaming)
    val persistedText = persisted.trim()
    val streamedText = streaming.trim()
    if (persistedText.isEmpty() || streamedText.isEmpty()) return TranscriptPresentation(messages, streaming)
    return when {
        persistedText == streamedText || persistedText.startsWith(streamedText) ->
            TranscriptPresentation(messages, "", persistedAssistantAfterActivity = true)
        streamedText.startsWith(persistedText) ->
            TranscriptPresentation(messages.dropLast(1), streaming)
        else -> TranscriptPresentation(messages, streaming)
    }
}

internal fun toolsInitiallyExpanded(disclosure: DisclosurePreference): Boolean =
    disclosure == DisclosurePreference.Expanded

internal fun shouldShowActivity(
    toolCount: Int,
    thinking: String,
    streaming: String,
    hasApproval: Boolean,
    hasFailure: Boolean,
    running: Boolean,
    toolDisclosure: DisclosurePreference,
    thinkingDisclosure: DisclosurePreference,
): Boolean =
    (toolCount > 0 && toolDisclosure != DisclosurePreference.Hidden) ||
        (thinking.isNotBlank() && thinkingDisclosure != DisclosurePreference.Hidden) ||
        streaming.isNotBlank() || hasApproval || hasFailure || running

internal enum class FollowScrollMode { None, Instant, Animated }

internal fun followScrollMode(enabled: Boolean, reducedMotion: Boolean): FollowScrollMode = when {
    !enabled -> FollowScrollMode.None
    reducedMotion -> FollowScrollMode.Instant
    else -> FollowScrollMode.Animated
}

internal fun shouldSendHardwareEnter(
    enabled: Boolean,
    isEnter: Boolean,
    keyDown: Boolean,
    shiftPressed: Boolean,
    canSend: Boolean,
): Boolean = enabled && isEnter && keyDown && !shiftPressed && canSend

@Composable
private fun ChatComposer(
    text: String,
    attachments: List<Uri>,
    agentName: String,
    sendOnEnter: Boolean,
    textScale: Float,
    modelLabel: String,
    modelPinned: Boolean,
    supportsThinking: Boolean,
    thinkingEffort: String?,
    running: Boolean,
    enabled: Boolean,
    showModelControls: Boolean,
    placeholder: String?,
    onTextChange: (String) -> Unit,
    onChooseImages: () -> Unit,
    onChooseFiles: () -> Unit,
    onTakePhoto: () -> Unit,
    onRemoveAttachment: (Int) -> Unit,
    onPickModel: () -> Unit,
    onPickThinking: () -> Unit,
    onStop: () -> Unit,
    onSend: () -> Unit,
) {
    var attachmentMenu by remember { mutableStateOf(false) }
    val canSend = enabled && (text.isNotBlank() || attachments.isNotEmpty())
    val colors = composerColors()

    Column(
        Modifier
            .fillMaxWidth()
            .background(colors.page)
            .navigationBarsPadding()
            .imePadding()
            .padding(start = 18.dp, top = 8.dp, end = 18.dp, bottom = 12.dp),
    ) {
        Surface(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(24.dp),
            color = colors.surface,
            contentColor = colors.ink,
            border = BorderStroke(1.dp, colors.line),
            shadowElevation = 0.dp,
        ) {
            Column(Modifier.padding(6.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                if (attachments.isNotEmpty()) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .horizontalScroll(rememberScrollState())
                            .padding(start = 4.dp, top = 2.dp, end = 4.dp, bottom = 2.dp),
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        attachments.forEachIndexed { index, uri ->
                            AttachmentChip(
                                uri = uri,
                                index = index,
                                colors = colors,
                                onRemove = { onRemoveAttachment(index) },
                            )
                        }
                    }
                }

                BasicTextField(
                    value = text,
                    onValueChange = onTextChange,
                    enabled = enabled,
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(min = 44.dp, max = 168.dp)
                        .padding(horizontal = 10.dp, vertical = 10.dp)
                        .onPreviewKeyEvent { event ->
                            val enter = event.key == Key.Enter || event.key == Key.NumPadEnter
                            if (shouldSendHardwareEnter(
                                    enabled = sendOnEnter,
                                    isEnter = enter,
                                    keyDown = event.type == KeyEventType.KeyDown,
                                    shiftPressed = event.isShiftPressed,
                                    canSend = canSend,
                                )
                            ) {
                                onSend()
                                true
                            } else {
                                false
                            }
                        },
                    textStyle = MaterialTheme.typography.bodyLarge.copy(
                        color = colors.ink,
                        fontSize = (16f / textScale.coerceAtMost(1f)).sp,
                        lineHeight = (22f / textScale.coerceAtMost(1f)).sp,
                    ),
                    cursorBrush = SolidColor(colors.ink),
                    minLines = 1,
                    maxLines = 6,
                    decorationBox = { input ->
                        Box(contentAlignment = Alignment.CenterStart) {
                            if (text.isEmpty()) {
                                Text(
                                    text = placeholder
                                        ?: if (running) "Steer $agentName…" else "Message $agentName…",
                                    color = colors.muted,
                                    style = MaterialTheme.typography.bodyLarge.copy(
                                        fontSize = (16f / textScale.coerceAtMost(1f)).sp,
                                    ),
                                )
                            }
                            input()
                        }
                    },
                )

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Box {
                        IconButton(
                            onClick = { attachmentMenu = true },
                            enabled = enabled,
                            modifier = Modifier.size(40.dp),
                            colors = IconButtonDefaults.iconButtonColors(contentColor = colors.muted),
                        ) {
                            Icon(
                                Icons.Outlined.AttachFile,
                                contentDescription = "Attach a file",
                                modifier = Modifier.size(18.dp),
                            )
                        }
                        DropdownMenu(
                            expanded = attachmentMenu,
                            onDismissRequest = { attachmentMenu = false },
                        ) {
                            DropdownMenuItem(
                                text = { Text("Photos") },
                                leadingIcon = { Icon(Icons.Outlined.Image, contentDescription = null) },
                                onClick = {
                                    attachmentMenu = false
                                    onChooseImages()
                                },
                            )
                            DropdownMenuItem(
                                text = { Text("Files") },
                                leadingIcon = { Icon(Icons.Outlined.AttachFile, contentDescription = null) },
                                onClick = {
                                    attachmentMenu = false
                                    onChooseFiles()
                                },
                            )
                        }
                    }

                    IconButton(
                        onClick = onTakePhoto,
                        enabled = enabled,
                        modifier = Modifier.size(40.dp),
                        colors = IconButtonDefaults.iconButtonColors(contentColor = colors.muted),
                    ) {
                        Icon(
                            Icons.Outlined.PhotoCamera,
                            contentDescription = "Take a photo",
                            modifier = Modifier.size(19.dp),
                        )
                    }

                    if (showModelControls) {
                        Row(
                            modifier = Modifier
                                .weight(1f)
                                .horizontalScroll(rememberScrollState())
                                .padding(horizontal = 4.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                        ) {
                            ModelModeChip(
                                label = modelLabel,
                                pinned = modelPinned,
                                onClick = onPickModel,
                                modifier = Modifier.widthIn(max = 180.dp),
                            )
                            if (supportsThinking) {
                                ThinkingModeChip(
                                    effort = thinkingEffort,
                                    onClick = onPickThinking,
                                )
                            }
                        }
                    } else {
                        Spacer(Modifier.weight(1f))
                    }

                    if (showModelControls && running) {
                        IconButton(
                            onClick = onStop,
                            modifier = Modifier.size(40.dp),
                            colors = IconButtonDefaults.iconButtonColors(
                                containerColor = colors.field,
                                contentColor = colors.ink,
                            ),
                        ) {
                            Icon(
                                Icons.Outlined.Stop,
                                contentDescription = "Stop run",
                                modifier = Modifier.size(16.dp),
                            )
                        }
                    }

                    IconButton(
                        onClick = onSend,
                        enabled = canSend,
                        modifier = Modifier.size(40.dp),
                        colors = IconButtonDefaults.iconButtonColors(
                            containerColor = colors.action,
                            contentColor = colors.onAction,
                            disabledContainerColor = colors.ink.copy(alpha = 0.12f),
                            disabledContentColor = colors.ink.copy(alpha = 0.38f),
                        ),
                    ) {
                        Icon(
                            Icons.Outlined.ArrowUpward,
                            contentDescription = if (showModelControls && running) "Steer the run" else "Send",
                            modifier = Modifier.size(18.dp),
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun AttachmentChip(
    uri: Uri,
    index: Int,
    colors: ComposerColors,
    onRemove: () -> Unit,
) {
    val label = remember(uri, index) {
        uri.lastPathSegment
            ?.substringAfterLast('/')
            ?.let(Uri::decode)
            ?.takeIf(String::isNotBlank)
            ?: "Attachment ${index + 1}"
    }
    Row(
        modifier = Modifier
            .height(32.dp)
            .clip(RoundedCornerShape(8.dp))
            .background(colors.field)
            .clickable(onClickLabel = "Remove $label", onClick = onRemove)
            .padding(start = 9.dp, end = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(5.dp),
    ) {
        Icon(
            Icons.Outlined.AttachFile,
            contentDescription = null,
            tint = colors.muted,
            modifier = Modifier.size(14.dp),
        )
        Text(
            text = label,
            color = colors.ink,
            style = MaterialTheme.typography.labelMedium,
            maxLines = 1,
        )
        Icon(
            Icons.Outlined.Close,
            contentDescription = null,
            tint = colors.muted,
            modifier = Modifier.size(14.dp),
        )
    }
}

private data class ComposerColors(
    val page: Color,
    val surface: Color,
    val field: Color,
    val ink: Color,
    val muted: Color,
    val line: Color,
    val action: Color,
    val onAction: Color,
    val userSurface: Color,
    val userInk: Color,
    val queuedSurface: Color,
    val queuedInk: Color,
    val completed: Color,
)

@Composable
private fun composerColors(): ComposerColors {
    val scheme = MaterialTheme.colorScheme
    return ComposerColors(
        page = scheme.background,
        surface = scheme.surfaceContainerLow,
        field = scheme.surfaceContainerHighest,
        ink = scheme.onSurface,
        muted = scheme.onSurfaceVariant,
        line = scheme.outlineVariant,
        action = scheme.primary,
        onAction = scheme.onPrimary,
        userSurface = scheme.primaryContainer,
        userInk = scheme.onPrimaryContainer,
        queuedSurface = scheme.secondaryContainer,
        queuedInk = scheme.onSecondaryContainer,
        completed = scheme.tertiary,
    )
}

@Composable
private fun MessageItem(
    message: MessageDto,
    agentName: String,
    colors: ComposerColors,
    hoistQuestions: Boolean = false,
    onRecommendationAction: ((String) -> Unit)? = null,
) {
    when (message.role) {
        "user" -> UserMessage(message.content.orEmpty(), colors)
        "system" -> Text(
            text = message.content.orEmpty(),
            color = colors.muted,
            style = MaterialTheme.typography.labelMedium,
        )
        "cron" -> LabeledMessage(
            label = buildString {
                append("Scheduled")
                message.cron.string("jobName")?.let { append(" · $it") }
                if (message.cron.string("status") == "failed") append(" · failed")
            },
            content = message.content.orEmpty(),
            colors = colors,
        )
        else -> LabeledMessage(
            label = agentName,
            content = message.content.orEmpty(),
            colors = colors,
            hoistQuestions = hoistQuestions,
            onRecommendationAction = onRecommendationAction,
        )
    }
}

@Composable
private fun UserMessage(content: String, colors: ComposerColors) {
    BoxWithConstraints(Modifier.fillMaxWidth(), contentAlignment = Alignment.CenterEnd) {
        Surface(
            modifier = Modifier.widthIn(max = maxWidth * 0.88f),
            shape = RoundedCornerShape(
                topStart = 18.dp,
                topEnd = 18.dp,
                bottomStart = 18.dp,
                bottomEnd = 6.dp,
            ),
            color = colors.userSurface,
            contentColor = colors.userInk,
            border = BorderStroke(1.dp, colors.line),
        ) {
            SelectionContainer {
                Text(
                    text = content,
                    modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp),
                    color = colors.userInk,
                    style = MaterialTheme.typography.bodyLarge.copy(
                        fontSize = 15.sp,
                        lineHeight = 23.sp,
                    ),
                )
            }
        }
    }
}

@Composable
private fun LabeledMessage(
    label: String,
    content: String,
    colors: ComposerColors,
    streaming: Boolean = false,
    hoistQuestions: Boolean = false,
    onRecommendationAction: ((String) -> Unit)? = null,
) {
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(
            text = label.uppercase(),
            color = colors.muted,
            style = MaterialTheme.typography.labelSmall.copy(
                fontWeight = FontWeight.SemiBold,
                fontSize = 11.sp,
                letterSpacing = 0.7.sp,
            ),
        )
        MessageBody(
            content = content,
            colors = colors,
            streaming = streaming,
            hoistQuestions = hoistQuestions,
            onRecommendationAction = onRecommendationAction,
        )
        if (streaming) {
            Box(
                Modifier
                    .size(width = 2.dp, height = 14.dp)
                    .clip(CircleShape)
                    .background(colors.ink),
            )
        }
    }
}

internal data class MessageBlock(
    val text: String,
    val language: String? = null,
    val code: Boolean = false,
)

private val codeFence = Regex("```([\\w+-]*)\\n?([\\s\\S]*?)(?:```|$)")

internal fun messageBlocks(content: String): List<MessageBlock> {
    val blocks = mutableListOf<MessageBlock>()
    var cursor = 0
    codeFence.findAll(content).forEach { match ->
        if (match.range.first > cursor) {
            content.substring(cursor, match.range.first).trim().takeIf(String::isNotEmpty)?.let {
                blocks += MessageBlock(it)
            }
        }
        blocks += MessageBlock(
            text = match.groups[2]?.value.orEmpty(),
            language = match.groups[1]?.value?.takeIf(String::isNotBlank),
            code = true,
        )
        cursor = match.range.last + 1
    }
    if (cursor < content.length) {
        content.substring(cursor).trim().takeIf(String::isNotEmpty)?.let {
            blocks += MessageBlock(it)
        }
    }
    return blocks.ifEmpty { listOf(MessageBlock(content)) }
}

/** The paired PWA's current wire convention; accept the former Hazel tag too. */
private const val RECOMMEND_FENCE = "hermes-recommend"
private val recommendationFences = setOf(RECOMMEND_FENCE, "hazel-recommend")

private fun MessageBlock.isRecommendationFence(): Boolean =
    code && language in recommendationFences

internal enum class RecommendationKind { Recommendation, Question }

internal data class RecommendationAction(
    val label: String,
    val reply: String,
)

internal data class Recommendation(
    val kind: RecommendationKind,
    val title: String,
    val rationale: String? = null,
    val confidence: Double? = null,
    val actions: List<RecommendationAction> = emptyList(),
)

/** Mirrors the PWA's deliberately forgiving `hermes-recommend` contract. */
internal fun parseRecommendation(raw: String): Recommendation? {
    val objectValue = runCatching {
        kotlinx.serialization.json.Json.parseToJsonElement(raw) as? JsonObject
    }.getOrNull() ?: return null
    val title = objectValue.string("title")?.trim().orEmpty()
    if (title.isEmpty()) return null

    val actions = (objectValue["actions"] as? JsonArray)
        ?.mapNotNull { item ->
            val action = item as? JsonObject ?: return@mapNotNull null
            val label = action.string("label")?.trim().orEmpty()
            if (label.isEmpty()) return@mapNotNull null
            val reply = action.string("reply")?.trim().takeUnless { it.isNullOrEmpty() } ?: label
            RecommendationAction(label = label, reply = reply)
        }
        ?.take(4)
        .orEmpty()
    val confidence = (objectValue["confidence"] as? JsonPrimitive)?.doubleOrNull
    val kind = when (objectValue.string("kind")) {
        "question" -> RecommendationKind.Question
        "recommendation" -> RecommendationKind.Recommendation
        else -> if (confidence == null) RecommendationKind.Question else RecommendationKind.Recommendation
    }
    return Recommendation(
        kind = kind,
        title = title,
        rationale = objectValue.string("rationale")?.trim()?.takeIf(String::isNotEmpty),
        confidence = confidence,
        actions = actions,
    )
}

/** The final valid, answerable question in a reply is the one pinned by the chat. */
internal fun extractQuestion(content: String): Recommendation? {
    var latest: Recommendation? = null
    messageBlocks(content).forEach { block ->
        val parsed = block.takeIf(MessageBlock::isRecommendationFence)
            ?.let { parseRecommendation(it.text) }
        if (parsed?.kind == RecommendationKind.Question && parsed.actions.isNotEmpty()) latest = parsed
    }
    return latest
}

private fun questionAt(blocks: List<MessageBlock>): Int {
    var index = -1
    blocks.forEachIndexed { at, block ->
        val parsed = block.takeIf(MessageBlock::isRecommendationFence)
            ?.let { parseRecommendation(it.text) }
        if (parsed?.kind == RecommendationKind.Question && parsed.actions.isNotEmpty()) index = at
    }
    return index
}

@Composable
private fun MessageBody(
    content: String,
    colors: ComposerColors,
    streaming: Boolean = false,
    hoistQuestions: Boolean = false,
    onRecommendationAction: ((String) -> Unit)? = null,
) {
    val blocks = messageBlocks(content)
    val hoisted = if (hoistQuestions) questionAt(blocks) else -1
    SelectionContainer {
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            blocks.forEachIndexed { index, block ->
                if (!block.code) {
                    Text(
                        text = block.text,
                        color = colors.ink,
                        style = MaterialTheme.typography.bodyLarge.copy(
                            fontSize = 15.sp,
                            lineHeight = 23.sp,
                        ),
                    )
                } else if (block.isRecommendationFence()) {
                    // A pinned question is deliberately not duplicated in its
                    // transcript position. While streaming, retain an
                    // incomplete fence until it either becomes a card or a
                    // genuinely malformed completed code block.
                    if (index == hoisted) return@forEachIndexed
                    val recommendation = parseRecommendation(block.text)
                    if (recommendation?.kind == RecommendationKind.Question) {
                        // Questions have one home: the pinned decision slot.
                        // Historical questions stay in the prose transcript,
                        // but never become a second inert picker.
                        return@forEachIndexed
                    } else if (recommendation != null) {
                        RecommendationCard(
                            recommendation = recommendation,
                            colors = colors,
                            onAction = onRecommendationAction,
                        )
                    } else if (!streaming) {
                        CodeBlock(block, colors)
                    }
                } else {
                    CodeBlock(block, colors)
                }
            }
        }
    }
}

@Composable
private fun CodeBlock(block: MessageBlock, colors: ComposerColors) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(14.dp),
        color = colors.surface,
        contentColor = colors.ink,
        border = BorderStroke(1.dp, colors.line),
    ) {
        Column {
            block.language?.let { language ->
                Text(
                    text = language,
                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                    color = colors.muted,
                    style = MaterialTheme.typography.labelSmall.copy(fontFamily = FontFamily.Monospace),
                )
            }
            Text(
                text = block.text.trimEnd(),
                modifier = Modifier
                    .fillMaxWidth()
                    .background(colors.field)
                    .horizontalScroll(rememberScrollState())
                    .padding(horizontal = 12.dp, vertical = 10.dp),
                color = colors.ink,
                softWrap = false,
                style = MaterialTheme.typography.bodySmall.copy(
                    fontFamily = FontFamily.Monospace,
                    lineHeight = 20.sp,
                ),
            )
        }
    }
}

internal data class ToolActivity(
    val id: String,
    val name: String,
    val preview: String?,
    val status: ToolStatus,
)

internal enum class ToolStatus { Running, Completed, Failed }

internal data class LiveActivityState(
    val runId: String? = null,
    val tools: List<ToolActivity> = emptyList(),
    val streaming: String = "",
    val thinking: String = "",
    val approval: PendingApproval? = null,
    val failure: String? = null,
    val running: Boolean = false,
    val startedAt: Long? = null,
)

internal fun buildActivityState(events: List<StreamEventDto>, running: Boolean): LiveActivityState {
    val runId = events.lastOrNull { it.runId != null }?.runId
    val runEvents = if (runId == null) emptyList() else events.filter { it.runId == runId }
    val tools = mutableListOf<ToolActivity>()
    var streaming = ""
    var thinking = ""
    var segmentStart = 0
    var pendingSegment: Pair<String, String>? = null
    runEvents.forEachIndexed { index, event ->
        when (event.type) {
            "message.delta", "assistant.delta" -> streaming += event.string("delta").orEmpty()
            "reasoning.available" -> {
                pendingSegment = streaming.substring(segmentStart) to event.string("text").orEmpty()
                segmentStart = streaming.length
            }
            "tool.progress", "hermes.tool.progress" -> {
                val name = event.string("tool", "tool_name", "name")
                val delta = event.string("delta", "text").orEmpty()
                if (name == "_thinking") thinking += delta
            }
            "tool.started" -> {
                pendingSegment?.let { (slice, fallback) ->
                    val traced = slice.trim().ifBlank { fallback.trim() }
                    if (traced.isNotBlank()) thinking += if (thinking.isBlank()) traced else "\n\n$traced"
                    if (slice.isNotEmpty()) {
                        val cut = (segmentStart - slice.length).coerceAtLeast(0)
                        streaming = streaming.substring(0, cut) + streaming.substring(segmentStart)
                        segmentStart = cut
                    }
                }
                pendingSegment = null
                tools += ToolActivity(
                    id = event.string("tool_call_id", "toolCallId") ?: "$runId:$index",
                    name = event.string("tool", "tool_name", "name") ?: "tool",
                    preview = event.string("preview", "message", "text"),
                    status = ToolStatus.Running,
                )
            }
            "tool.completed", "tool.failed" -> {
                val id = event.string("tool_call_id", "toolCallId")
                val name = event.string("tool", "tool_name", "name")
                val at = when {
                    id != null -> tools.indexOfFirst { it.id == id }
                    name != null -> tools.indexOfFirst { it.name == name && it.status == ToolStatus.Running }
                    else -> tools.indexOfFirst { it.status == ToolStatus.Running }
                }
                if (at >= 0) {
                    val failed = event.type == "tool.failed" || event.boolean("error") == true
                    tools[at] = tools[at].copy(
                        preview = event.string("preview", "message", "text") ?: tools[at].preview,
                        status = if (failed) ToolStatus.Failed else ToolStatus.Completed,
                    )
                }
            }
        }
    }
    val latestApprovalAt = runEvents.indexOfLast { it.type == "approval.request" }
    val approvalAnswered = latestApprovalAt >= 0 && runEvents
        .drop(latestApprovalAt + 1)
        .any { it.type == "approval.responded" }
    val approval = if (latestApprovalAt >= 0 && !approvalAnswered) {
        runEvents[latestApprovalAt].toPendingApproval()
    } else {
        null
    }
    if (!running) streaming = ""
    val failure = runEvents
        .lastOrNull { it.type == "run.failed" || it.type == "error" }
        ?.failureMessage()
    val startedAt = runEvents.minOfOrNull { event ->
        if (event.occurredAt < 1_000_000_000_000L) event.occurredAt * 1_000 else event.occurredAt
    }
    return LiveActivityState(runId, tools, streaming, thinking, approval, failure, running, startedAt)
}

private fun StreamEventDto.failureMessage(): String =
    string("error", "message")
        ?: (payload["error"] as? JsonObject)?.string("message")
        ?: "The run failed before Hermes could reply."

private fun StreamEventDto.string(vararg keys: String): String? = keys.firstNotNullOfOrNull { key ->
    (payload[key] as? JsonPrimitive)?.contentOrNull
}

private fun StreamEventDto.boolean(vararg keys: String): Boolean? = keys.firstNotNullOfOrNull { key ->
    (payload[key] as? JsonPrimitive)?.booleanOrNull
}

private fun kotlinx.serialization.json.JsonObject?.string(key: String): String? =
    (this?.get(key) as? JsonPrimitive)?.contentOrNull

internal data class PendingApproval(
    val runId: String,
    val command: String?,
    val description: String?,
    val patternKey: String?,
    val choices: List<String>,
    val allowPermanent: Boolean,
    val allowSession: Boolean,
    val smartDenied: Boolean,
)

private val knownApprovalChoices = setOf("once", "session", "always", "deny")

/** Match the PWA's event interpretation; server-supplied choices are authoritative. */
internal fun StreamEventDto.toPendingApproval(): PendingApproval? {
    val id = runId ?: return null
    val smartDenied = boolean("smart_denied") == true
    val allowPermanent = boolean("allow_permanent") != false
    val allowSession = boolean("allow_session") != false
    val fallback = when {
        smartDenied -> listOf("once", "deny")
        allowPermanent -> listOf("once", "session", "always", "deny")
        else -> listOf("once", "session", "deny")
    }
    val choices = (payload["choices"] as? JsonArray)
        ?.mapNotNull { (it as? JsonPrimitive)?.contentOrNull }
        ?: fallback
    val commandValue = payload["command"]
    val command = when (commandValue) {
        is JsonPrimitive -> commandValue.contentOrNull
        null -> string("text")
        else -> commandValue.toString()
    }
    return PendingApproval(
        runId = id,
        command = command,
        description = string("description", "message"),
        patternKey = string("pattern_key", "patternKey"),
        choices = choices,
        allowPermanent = allowPermanent,
        allowSession = allowSession,
        smartDenied = smartDenied,
    )
}

internal fun formatDuration(seconds: Long): String = when {
    seconds < 60 -> "${seconds}s"
    seconds < 3_600 -> "${seconds / 60}m ${seconds % 60}s"
    else -> "${seconds / 3_600}h ${(seconds % 3_600) / 60}m"
}

@Composable
private fun LiveActivity(
    state: LiveActivityState,
    agentName: String,
    toolDisclosure: DisclosurePreference,
    thinkingDisclosure: DisclosurePreference,
    showDuration: Boolean,
    colors: ComposerColors,
) {
    var now by remember(state.runId) { mutableStateOf(System.currentTimeMillis()) }
    LaunchedEffect(state.runId, state.running, showDuration) {
        while (state.running && showDuration) {
            now = System.currentTimeMillis()
            delay(250)
        }
    }
    val elapsed = state.startedAt?.let { ((now - it).coerceAtLeast(0) / 1_000) }
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        if (state.thinking.isNotBlank() && thinkingDisclosure != DisclosurePreference.Hidden) {
            ThinkingTrace(state.runId, state.thinking, state.running, thinkingDisclosure, colors)
        }
        if (state.tools.isNotEmpty() && toolDisclosure != DisclosurePreference.Hidden) {
            ToolCallGroup(state.runId, state.tools, toolDisclosure, colors)
        }
        if (state.streaming.isNotBlank()) {
            LabeledMessage(agentName, state.streaming, colors, streaming = true)
        }
        state.failure?.let { RunFailure(it) }
        if (state.running && state.streaming.isBlank() && state.approval == null && state.failure == null) {
            Row(
                modifier = Modifier.heightIn(min = 32.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                CircularProgressIndicator(
                    modifier = Modifier.size(14.dp),
                    color = colors.muted,
                    strokeWidth = 1.5.dp,
                )
                Text(
                    buildString {
                        append("Working")
                        if (showDuration && elapsed != null) append(" · ${formatDuration(elapsed)}")
                    },
                    color = colors.muted,
                    style = MaterialTheme.typography.labelMedium,
                )
            }
        }
    }
}

@Composable
private fun ThinkingTrace(
    runId: String?,
    text: String,
    working: Boolean,
    disclosure: DisclosurePreference,
    colors: ComposerColors,
) {
    var manualExpanded by remember(runId, disclosure) { mutableStateOf<Boolean?>(null) }
    val expanded = manualExpanded ?: (disclosure == DisclosurePreference.Expanded || working)
    Column(Modifier.fillMaxWidth()) {
        Row(
            Modifier.clickable { manualExpanded = !expanded }.padding(vertical = 6.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(if (working) "Thinking" else "Thought", color = colors.muted, style = MaterialTheme.typography.labelMedium)
            Text(if (expanded) "−" else "+", color = colors.muted)
        }
        if (expanded) {
            SelectionContainer {
                Text(
                    text,
                    Modifier.padding(start = 16.dp, bottom = 4.dp),
                    color = colors.muted,
                    style = MaterialTheme.typography.bodyMedium,
                )
            }
        }
    }
}

@Composable
private fun RunFailure(message: String) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        color = MaterialTheme.colorScheme.errorContainer,
        contentColor = MaterialTheme.colorScheme.onErrorContainer,
    ) {
        Column(
            modifier = Modifier.padding(horizontal = 14.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Text("RUN FAILED", style = MaterialTheme.typography.labelSmall)
            Text(message, style = MaterialTheme.typography.bodyMedium)
        }
    }
}

@Composable
private fun ToolCallGroup(
    runId: String?,
    tools: List<ToolActivity>,
    disclosure: DisclosurePreference,
    colors: ComposerColors,
) {
    var expanded by remember(runId, disclosure) {
        mutableStateOf(toolsInitiallyExpanded(disclosure))
    }
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(
            text = "${tools.size} tool call${if (tools.size == 1) "" else "s"}",
            modifier = Modifier.clickable { expanded = !expanded }.padding(vertical = 6.dp),
            color = colors.muted,
            style = MaterialTheme.typography.labelMedium,
        )
        if (expanded) tools.forEach { tool ->
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = 32.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Icon(
                    Icons.Outlined.Build,
                    contentDescription = null,
                    tint = colors.muted,
                    modifier = Modifier.size(16.dp),
                )
                Text(
                    text = tool.name,
                    color = colors.ink,
                    style = MaterialTheme.typography.labelMedium.copy(
                        fontFamily = FontFamily.Monospace,
                        fontWeight = FontWeight.Medium,
                    ),
                )
                tool.preview?.takeIf(String::isNotBlank)?.let { preview ->
                    Text(
                        text = preview,
                        modifier = Modifier
                            .weight(1f)
                            .clip(RoundedCornerShape(8.dp))
                            .background(colors.field)
                            .padding(horizontal = 8.dp, vertical = 5.dp),
                        color = colors.muted,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        style = MaterialTheme.typography.labelSmall.copy(fontFamily = FontFamily.Monospace),
                    )
                } ?: Box(Modifier.weight(1f))
                when (tool.status) {
                    ToolStatus.Running -> CircularProgressIndicator(
                        modifier = Modifier.size(12.dp),
                        color = colors.muted,
                        strokeWidth = 1.5.dp,
                    )
                    ToolStatus.Completed, ToolStatus.Failed -> Box(
                        Modifier
                            .size(8.dp)
                            .clip(CircleShape)
                            .background(
                                if (tool.status == ToolStatus.Failed) {
                                    MaterialTheme.colorScheme.error
                                } else {
                                    colors.completed
                                },
                            ),
                    )
                }
            }
        }
    }
}

@Composable
private fun DecisionSlot(
    maxHeight: androidx.compose.ui.unit.Dp,
    content: @Composable () -> Unit,
) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(max = maxHeight)
            .verticalScroll(rememberScrollState())
            .padding(start = 18.dp, top = 4.dp, end = 18.dp, bottom = 2.dp),
    ) {
        content()
    }
}

@Composable
private fun RecommendationCard(
    recommendation: Recommendation,
    colors: ComposerColors,
    onAction: ((String) -> Unit)? = null,
) {
    val asking = recommendation.kind == RecommendationKind.Question
    val accent = if (asking) MaterialTheme.colorScheme.tertiary else colors.action
    val accentSurface = if (asking) MaterialTheme.colorScheme.tertiaryContainer else MaterialTheme.colorScheme.primaryContainer
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        color = colors.surface,
        contentColor = colors.ink,
        border = BorderStroke(1.dp, colors.line),
        shadowElevation = 2.dp,
    ) {
        Column(
            modifier = Modifier.padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.Top,
            ) {
                Box(
                    modifier = Modifier
                        .size(22.dp)
                        .clip(CircleShape)
                        .background(accentSurface),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        text = if (asking) "?" else "!",
                        color = accent,
                        style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.Bold),
                    )
                }
                Text(
                    text = recommendation.title,
                    modifier = Modifier.weight(1f),
                    color = colors.ink,
                    style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.Medium),
                )
            }
            recommendation.rationale?.let {
                Text(it, color = colors.muted, style = MaterialTheme.typography.bodyMedium)
            }
            recommendation.confidence?.let { value ->
                val clamped = value.coerceIn(0.0, 1.0).toFloat()
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text("Confidence", color = colors.muted, style = MaterialTheme.typography.labelSmall)
                        Text(
                            "${(clamped * 100).toInt()}%",
                            color = colors.muted,
                            style = MaterialTheme.typography.labelSmall,
                        )
                    }
                    LinearProgressIndicator(
                        progress = { clamped },
                        modifier = Modifier.fillMaxWidth(),
                        color = accent,
                        trackColor = colors.field,
                    )
                }
            }
            recommendation.actions.forEachIndexed { index, action ->
                if (onAction != null) {
                    Button(
                        onClick = { onAction(action.reply) },
                        modifier = Modifier
                            .fillMaxWidth()
                            .heightIn(min = 36.dp),
                        shape = RoundedCornerShape(10.dp),
                        colors = if (index == 0) {
                            ButtonDefaults.buttonColors(
                                containerColor = colors.ink,
                                contentColor = colors.page,
                            )
                        } else {
                            ButtonDefaults.buttonColors(
                                containerColor = colors.field,
                                contentColor = colors.ink,
                            )
                        },
                    ) { Text(action.label, maxLines = 1, overflow = TextOverflow.Ellipsis) }
                } else {
                    Surface(
                        modifier = Modifier
                            .fillMaxWidth()
                            .heightIn(min = 36.dp),
                        shape = RoundedCornerShape(10.dp),
                        color = colors.field,
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            Text(
                                action.label,
                                modifier = Modifier.padding(horizontal = 12.dp),
                                color = colors.muted,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                                style = MaterialTheme.typography.labelLarge,
                            )
                        }
                    }
                }
            }
            if (asking && onAction != null && recommendation.actions.isNotEmpty()) {
                Text(
                    "or type your own answer",
                    color = colors.muted,
                    style = MaterialTheme.typography.labelSmall,
                )
            }
        }
    }
}

private data class ApprovalChoiceCopy(val label: String, val hint: String)

private val approvalChoiceCopy = mapOf(
    "once" to ApprovalChoiceCopy("Allow once", "This call only"),
    "session" to ApprovalChoiceCopy("Allow for session", "Until this session ends"),
    "always" to ApprovalChoiceCopy("Always allow", "Remembered across sessions"),
    "deny" to ApprovalChoiceCopy("Deny", "Refuse and continue"),
)

@Composable
private fun ApprovalCard(
    approval: PendingApproval,
    agentName: String,
    colors: ComposerColors,
    submitting: Boolean,
    onRespond: (choice: String, all: Boolean) -> Unit,
) {
    var applyToAll by remember(approval.runId) { mutableStateOf(false) }
    val choices = approval.choices.filter { it in knownApprovalChoices }
        .ifEmpty { listOf("once", "deny") }
    val persists = choices.contains("always") && !approval.patternKey.isNullOrBlank()
    val surfaceColor = if (approval.smartDenied) MaterialTheme.colorScheme.errorContainer else colors.surface
    val ink = if (approval.smartDenied) MaterialTheme.colorScheme.onErrorContainer else colors.ink
    val statusColor = if (approval.smartDenied) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.tertiary
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        color = surfaceColor,
        contentColor = ink,
        border = BorderStroke(1.dp, colors.line),
        shadowElevation = 2.dp,
    ) {
        Column(
            modifier = Modifier.padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
                verticalAlignment = Alignment.Top,
            ) {
                Text(
                    text = if (approval.smartDenied) {
                        "$agentName was blocked and is asking you to override"
                    } else {
                        "$agentName wants to run something"
                    },
                    modifier = Modifier.weight(1f),
                    color = ink,
                    style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.Medium),
                )
                Surface(shape = RoundedCornerShape(8.dp), color = statusColor) {
                    Text(
                        text = if (approval.smartDenied) "Blocked" else "Waiting",
                        modifier = Modifier.padding(horizontal = 7.dp, vertical = 3.dp),
                        color = MaterialTheme.colorScheme.onPrimary,
                        style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.Medium),
                    )
                }
            }
            approval.description?.takeIf(String::isNotBlank)?.let {
                Text(it, color = ink, style = MaterialTheme.typography.bodyMedium)
            }
            approval.command?.takeIf(String::isNotBlank)?.let { command ->
                SelectionContainer {
                    Text(
                        text = command,
                        modifier = Modifier
                            .fillMaxWidth()
                            .heightIn(max = 160.dp)
                            .clip(RoundedCornerShape(10.dp))
                            .background(colors.field)
                            .verticalScroll(rememberScrollState())
                            .padding(horizontal = 10.dp, vertical = 8.dp),
                        color = ink,
                        style = MaterialTheme.typography.bodySmall.copy(fontFamily = FontFamily.Monospace),
                    )
                }
            }
            if (persists) {
                Text(
                    text = "“Always” remembers ${approval.patternKey}",
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(10.dp))
                        .background(colors.field)
                        .padding(horizontal = 10.dp, vertical = 7.dp),
                    color = ink,
                    style = MaterialTheme.typography.labelSmall.copy(fontFamily = FontFamily.Monospace),
                )
            }
            choices.forEach { choice ->
                val copy = approvalChoiceCopy.getValue(choice)
                val deny = choice == "deny"
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(10.dp))
                        .clickable(enabled = !submitting) { onRespond(choice, applyToAll) }
                        .padding(horizontal = 4.dp, vertical = 7.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(9.dp),
                ) {
                    Box(
                        modifier = Modifier
                            .size(22.dp)
                            .clip(CircleShape)
                            .background(if (deny) MaterialTheme.colorScheme.error else colors.completed),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(
                            text = if (deny) "×" else "✓",
                            color = MaterialTheme.colorScheme.onPrimary,
                            style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.Bold),
                        )
                    }
                    Text(
                        copy.label,
                        modifier = Modifier.weight(1f),
                        color = ink,
                        style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.Medium),
                    )
                    Text(copy.hint, color = colors.muted, style = MaterialTheme.typography.labelSmall)
                }
            }
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(10.dp))
                    .clickable(enabled = !submitting) { applyToAll = !applyToAll }
                    .padding(horizontal = 4.dp, vertical = 7.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(9.dp),
            ) {
                Box(
                    modifier = Modifier
                        .size(18.dp)
                        .clip(RoundedCornerShape(4.dp))
                        .background(if (applyToAll) ink else Color.Transparent)
                        .border(1.dp, colors.line, RoundedCornerShape(4.dp)),
                    contentAlignment = Alignment.Center,
                ) {
                    if (applyToAll) {
                        Text("✓", color = surfaceColor, style = MaterialTheme.typography.labelSmall)
                    }
                }
                Text(
                    "Apply to every approval waiting on this turn",
                    color = colors.muted,
                    style = MaterialTheme.typography.labelSmall,
                )
            }
            if (submitting) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                    CircularProgressIndicator(modifier = Modifier.size(14.dp), color = colors.muted, strokeWidth = 1.5.dp)
                    Text("Sending decision…", color = colors.muted, style = MaterialTheme.typography.labelSmall)
                }
            }
        }
    }
}

@Composable
private fun QueuedRow(count: Int, colors: ComposerColors) {
    Surface(
        shape = RoundedCornerShape(8.dp),
        color = colors.queuedSurface,
        contentColor = colors.queuedInk,
        border = BorderStroke(1.dp, colors.line),
    ) {
        Text(
            text = "$count queued",
            modifier = Modifier.padding(horizontal = 9.dp, vertical = 6.dp),
            style = MaterialTheme.typography.labelMedium,
        )
    }
}
