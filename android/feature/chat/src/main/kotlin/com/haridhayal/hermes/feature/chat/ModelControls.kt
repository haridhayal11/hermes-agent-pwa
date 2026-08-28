package com.haridhayal.hermes.feature.chat

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ArrowDropDown
import androidx.compose.material.icons.outlined.AutoAwesome
import androidx.compose.material.icons.outlined.Memory
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.haridhayal.hermes.core.model.ModelSelectionDto
import com.haridhayal.hermes.core.model.ModelsResponse
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull

internal data class ModelCapabilities(val reasoning: Boolean, val fast: Boolean)

internal fun ModelsResponse?.capabilitiesFor(
    model: String?,
    provider: String? = null,
): ModelCapabilities {
    if (model == null) return ModelCapabilities(reasoning = false, fast = false)
    val candidates = this?.providers
        ?.asSequence()
        ?.filter { candidate -> provider == null || candidate.slug == provider }
        ?.flatMap { candidate -> candidate.models.asSequence() }
    val found = candidates?.firstOrNull { it.id == model }
    return found?.let { ModelCapabilities(reasoning = it.reasoning, fast = it.fast) }
        // The selected model may predate a cached inventory. Keep controls
        // available rather than silently dropping options Hermes accepts.
        ?: ModelCapabilities(reasoning = true, fast = true)
}

internal fun ModelSelectionDto?.reasoningEffort(): String? {
    val reasoning = this?.options?.get("reasoning") as? JsonObject ?: return null
    if ((reasoning["enabled"] as? JsonPrimitive)?.booleanOrNull == false) return null
    return (reasoning["effort"] as? JsonPrimitive)?.contentOrNull
}

private fun ModelSelectionDto?.fastEnabled(): Boolean =
    (this?.options?.get("fast") as? JsonPrimitive)?.booleanOrNull == true

internal data class ThinkingLevel(
    val value: String?,
    val label: String,
    val hint: String,
)

internal val thinkingLevels = listOf(
    ThinkingLevel(null, "Off", "Answer directly"),
    ThinkingLevel("low", "Low", "A little reasoning"),
    ThinkingLevel("medium", "Medium", "Balanced"),
    ThinkingLevel("high", "High", "Slower, more thorough"),
)

internal fun thinkingLabel(effort: String?): String =
    thinkingLevels.firstOrNull { it.value == effort }?.label ?: effort.orEmpty().ifBlank { "Off" }

@Composable
internal fun ModelModeChip(
    label: String,
    pinned: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    FilterChip(
        selected = pinned,
        onClick = onClick,
        modifier = modifier,
        label = {
            Text(
                text = label,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        },
        leadingIcon = {
            Icon(
                Icons.Outlined.Memory,
                contentDescription = null,
                modifier = Modifier.size(18.dp),
            )
        },
        trailingIcon = {
            Icon(
                Icons.Outlined.ArrowDropDown,
                contentDescription = "Choose model",
                modifier = Modifier.size(18.dp),
            )
        },
    )
}

@Composable
internal fun ThinkingModeChip(
    effort: String?,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    FilterChip(
        selected = effort != null,
        onClick = onClick,
        modifier = modifier,
        label = { Text(thinkingLabel(effort), maxLines = 1) },
        leadingIcon = {
            Icon(
                Icons.Outlined.AutoAwesome,
                contentDescription = null,
                modifier = Modifier.size(18.dp),
            )
        },
        trailingIcon = {
            Icon(
                Icons.Outlined.ArrowDropDown,
                contentDescription = "Choose thinking effort",
                modifier = Modifier.size(18.dp),
            )
        },
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun ThinkingPickerSheet(
    effort: String?,
    onDismiss: () -> Unit,
    onSelect: (String?) -> Unit,
) {
    ModalBottomSheet(onDismissRequest = onDismiss) {
        LazyColumn(
            modifier = Modifier.fillMaxWidth(),
            contentPadding = PaddingValues(bottom = 28.dp),
        ) {
            item {
                ListItem(
                    headlineContent = {
                        Text(
                            "Thinking",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.SemiBold,
                        )
                    },
                    supportingContent = {
                        Text("How hard the model reasons before answering.")
                    },
                    leadingContent = {
                        Icon(
                            Icons.Outlined.AutoAwesome,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.primary,
                        )
                    },
                    colors = ListItemDefaults.colors(containerColor = Color.Transparent),
                )
            }
            items(thinkingLevels, key = { it.value ?: "off" }) { level ->
                ListItem(
                    headlineContent = { Text(level.label) },
                    supportingContent = { Text(level.hint) },
                    leadingContent = {
                        RadioButton(
                            selected = effort == level.value,
                            onClick = null,
                        )
                    },
                    modifier = Modifier.clickable {
                        onSelect(level.value)
                        onDismiss()
                    },
                    colors = ListItemDefaults.colors(containerColor = Color.Transparent),
                )
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun ModelPickerSheet(
    selection: ModelSelectionDto?,
    models: ModelsResponse?,
    refreshing: Boolean,
    onDismiss: () -> Unit,
    onSelect: (provider: String?, model: String?) -> Unit,
    onFastChange: (Boolean) -> Unit,
    onRefresh: () -> Unit,
) {
    val effectiveModel = selection?.model ?: models?.current?.model
    val effectiveProvider = selection?.provider ?: models?.current?.provider
    val capabilities = models.capabilitiesFor(effectiveModel, effectiveProvider)
    val currentProviderName = models?.providers
        ?.firstOrNull { it.slug == models.current.provider }
        ?.name
        ?: models?.current?.provider

    ModalBottomSheet(onDismissRequest = onDismiss) {
        LazyColumn(
            modifier = Modifier
                .fillMaxWidth()
                .fillMaxHeight(0.9f),
            contentPadding = PaddingValues(bottom = 28.dp),
        ) {
            item {
                ListItem(
                    headlineContent = {
                        Text(
                            "Model",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.SemiBold,
                        )
                    },
                    supportingContent = { Text("Choose the model used for this project.") },
                    leadingContent = {
                        Icon(
                            Icons.Outlined.Memory,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.primary,
                        )
                    },
                    colors = ListItemDefaults.colors(containerColor = Color.Transparent),
                )
            }
            item {
                ModelRow(
                    title = "Gateway default",
                    subtitle = models?.current?.model?.let { current ->
                        "$current${currentProviderName?.let { " · $it" }.orEmpty()}"
                    } ?: "Whatever Hermes is configured for",
                    selected = selection?.model == null,
                    onClick = { onSelect(null, null) },
                )
            }
            item {
                Text(
                    text = "Follows the gateway unless you pin a model below.",
                    modifier = Modifier.padding(horizontal = 24.dp, vertical = 4.dp),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    style = MaterialTheme.typography.labelSmall,
                )
            }

            if (models == null) {
                item {
                    Row(
                        modifier = Modifier.padding(24.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp)
                        Text("Loading models…", color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            } else if (models.unavailable) {
                item {
                    Text(
                        "Hermes didn’t return a model catalogue. Gateway default is still available.",
                        modifier = Modifier.padding(24.dp),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
            }

            models?.providers?.forEach { provider ->
                item(key = "provider:${provider.slug}") {
                    Row(
                        modifier = Modifier.padding(start = 24.dp, top = 20.dp, end = 24.dp, bottom = 4.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        Text(
                            provider.name.uppercase(),
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            style = MaterialTheme.typography.labelSmall.copy(
                                fontWeight = FontWeight.SemiBold,
                                letterSpacing = 0.7.sp,
                            ),
                        )
                        if (provider.isCurrent) {
                            Text(
                                "ACTIVE",
                                color = MaterialTheme.colorScheme.onPrimaryContainer,
                                modifier = Modifier
                                    .background(
                                        MaterialTheme.colorScheme.primaryContainer,
                                        MaterialTheme.shapes.small,
                                    )
                                    .padding(horizontal = 6.dp, vertical = 2.dp),
                                style = MaterialTheme.typography.labelSmall,
                            )
                        }
                    }
                }
                provider.warning?.takeIf { !provider.authenticated }?.let { warning ->
                    item(key = "warning:${provider.slug}") {
                        Text(
                            warning,
                            modifier = Modifier.padding(horizontal = 24.dp, vertical = 4.dp),
                            color = MaterialTheme.colorScheme.error,
                            style = MaterialTheme.typography.bodySmall,
                        )
                    }
                }
                items(
                    items = provider.models,
                    key = { model -> "${provider.slug}:${model.id}" },
                ) { model ->
                    ModelRow(
                        title = model.id,
                        selected = selection?.model == model.id && selection.provider == provider.slug,
                        enabled = provider.authenticated,
                        badge = if (
                            model.id == models.current.model &&
                            provider.slug == models.current.provider
                        ) {
                            "gateway"
                        } else {
                            null
                        },
                        mono = true,
                        onClick = { onSelect(provider.slug, model.id) },
                    )
                }
            }

            if (capabilities.fast) {
                item {
                    HorizontalDivider(Modifier.padding(top = 16.dp, bottom = 4.dp))
                    ListItem(
                        headlineContent = { Text("Fast mode") },
                        supportingContent = { Text("Priority processing when supported") },
                        trailingContent = {
                            Switch(
                                checked = selection.fastEnabled(),
                                onCheckedChange = onFastChange,
                            )
                        },
                        modifier = Modifier.clickable { onFastChange(!selection.fastEnabled()) },
                        colors = ListItemDefaults.colors(containerColor = Color.Transparent),
                    )
                }
            }

            item {
                TextButton(
                    onClick = onRefresh,
                    enabled = !refreshing,
                    modifier = Modifier.padding(start = 12.dp, top = 12.dp),
                ) {
                    if (refreshing) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(16.dp),
                            strokeWidth = 2.dp,
                        )
                    }
                    Text(
                        text = if (refreshing) "Refreshing…" else "Refresh from Hermes",
                        modifier = Modifier.padding(start = if (refreshing) 8.dp else 0.dp),
                    )
                }
            }
        }
    }
}

@Composable
private fun ModelRow(
    title: String,
    selected: Boolean,
    onClick: () -> Unit,
    subtitle: String? = null,
    enabled: Boolean = true,
    badge: String? = null,
    mono: Boolean = false,
) {
    ListItem(
        headlineContent = {
            Text(
                text = title,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                style = MaterialTheme.typography.bodyLarge.copy(
                    fontFamily = if (mono) FontFamily.Monospace else FontFamily.Default,
                ),
            )
        },
        supportingContent = subtitle?.let { value ->
            {
                Text(
                    text = value,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        },
        leadingContent = {
            RadioButton(
                selected = selected,
                onClick = null,
                enabled = enabled,
            )
        },
        trailingContent = badge?.let { value ->
            {
                Text(
                    text = value,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier
                        .background(
                            MaterialTheme.colorScheme.surfaceContainerHighest,
                            MaterialTheme.shapes.small,
                        )
                        .padding(horizontal = 7.dp, vertical = 3.dp),
                    style = MaterialTheme.typography.labelSmall,
                )
            }
        },
        modifier = Modifier
            .fillMaxWidth()
            .alpha(if (enabled) 1f else 0.45f)
            .clickable(enabled = enabled, onClick = onClick),
        colors = ListItemDefaults.colors(containerColor = Color.Transparent),
    )
}
