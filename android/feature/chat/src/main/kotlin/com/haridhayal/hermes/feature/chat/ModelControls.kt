package com.haridhayal.hermes.feature.chat

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AutoAwesome
import androidx.compose.material.icons.outlined.Memory
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
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
    val found = candidates
        ?.firstOrNull { it.id == model }
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

private data class ThinkingLevel(
    val value: String?,
    val label: String,
    val hint: String,
)

private val thinkingLevels = listOf(
    ThinkingLevel(null, "Off", "answer directly"),
    ThinkingLevel("low", "Low", "a little"),
    ThinkingLevel("medium", "Medium", "balanced"),
    ThinkingLevel("high", "High", "slower, costs more"),
)

@Composable
internal fun ThinkingModeChip(
    effort: String?,
    onChange: (String?) -> Unit,
    modifier: Modifier = Modifier,
) {
    var expanded by remember { mutableStateOf(false) }
    Box(modifier) {
        TextButton(
            onClick = { expanded = true },
            modifier = Modifier.height(40.dp),
            contentPadding = PaddingValues(horizontal = 7.dp),
            colors = ButtonDefaults.textButtonColors(
                contentColor = if (effort == null) {
                    MaterialTheme.colorScheme.onSurfaceVariant
                } else {
                    MaterialTheme.colorScheme.primary
                },
            ),
        ) {
            Icon(
                Icons.Outlined.AutoAwesome,
                contentDescription = null,
                modifier = Modifier.size(15.dp),
            )
            Text(
                text = when (effort) {
                    null -> "off"
                    "medium" -> "med"
                    else -> effort
                },
                modifier = Modifier.padding(start = 4.dp),
                style = MaterialTheme.typography.labelSmall.copy(fontFamily = FontFamily.Monospace),
            )
        }
        DropdownMenu(
            expanded = expanded,
            onDismissRequest = { expanded = false },
        ) {
            Text(
                text = "How hard the model reasons before answering.",
                modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                style = MaterialTheme.typography.labelSmall,
            )
            thinkingLevels.forEach { level ->
                DropdownMenuItem(
                    text = {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(level.label, modifier = Modifier.weight(1f))
                            Text(
                                level.hint,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                style = MaterialTheme.typography.labelSmall,
                            )
                        }
                    },
                    leadingIcon = {
                        RadioButton(
                            selected = effort == level.value,
                            onClick = null,
                            modifier = Modifier.size(20.dp),
                        )
                    },
                    onClick = {
                        onChange(level.value)
                        expanded = false
                    },
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
            contentPadding = PaddingValues(start = 8.dp, end = 8.dp, bottom = 28.dp),
        ) {
            item {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 8.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Icon(
                        Icons.Outlined.Memory,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.primary,
                    )
                    Text(
                        "Model",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                    )
                }
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
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    style = MaterialTheme.typography.labelSmall,
                )
            }

            if (models == null) {
                item {
                    Row(
                        modifier = Modifier.padding(16.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp)
                        Text("Loading models…", color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            } else if (models.unavailable) {
                item {
                    Text(
                        "Hermes didn’t return a model catalogue. Gateway default is still available.",
                        modifier = Modifier.padding(16.dp),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
            }

            models?.providers?.forEach { provider ->
                item(key = "provider:${provider.slug}") {
                    Row(
                        modifier = Modifier.padding(start = 16.dp, top = 18.dp, end = 16.dp, bottom = 4.dp),
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
                            modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp),
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
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { onFastChange(!selection.fastEnabled()) }
                            .padding(horizontal = 16.dp, vertical = 10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        Column(Modifier.weight(1f)) {
                            Text("Fast mode", style = MaterialTheme.typography.bodyMedium)
                            Text(
                                "Priority processing when supported",
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                style = MaterialTheme.typography.labelSmall,
                            )
                        }
                        Switch(
                            checked = selection.fastEnabled(),
                            onCheckedChange = onFastChange,
                        )
                    }
                }
            }

            item {
                TextButton(
                    onClick = onRefresh,
                    enabled = !refreshing,
                    modifier = Modifier.padding(top = 12.dp),
                ) {
                    if (refreshing) {
                        CircularProgressIndicator(
                            modifier = Modifier
                                .size(16.dp)
                                .padding(end = 4.dp),
                            strokeWidth = 2.dp,
                        )
                    }
                    Text(if (refreshing) "Refreshing…" else "Refresh from Hermes")
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
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .alpha(if (enabled) 1f else 0.45f)
            .clickable(enabled = enabled, onClick = onClick)
            .padding(horizontal = 8.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        RadioButton(selected = selected, onClick = null, enabled = enabled)
        Column(Modifier.weight(1f)) {
            Text(
                text = title,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                style = MaterialTheme.typography.bodyMedium.copy(
                    fontFamily = if (mono) FontFamily.Monospace else FontFamily.Default,
                ),
            )
            subtitle?.let {
                Text(
                    text = it,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    style = MaterialTheme.typography.labelSmall,
                )
            }
        }
        badge?.let {
            Text(
                text = it,
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
    }
}
