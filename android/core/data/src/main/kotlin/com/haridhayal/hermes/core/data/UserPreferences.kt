package com.haridhayal.hermes.core.data

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.floatPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import com.haridhayal.hermes.core.model.ThemePreference
import dagger.hilt.android.qualifiers.ApplicationContext
import java.io.File
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

enum class TextSizePreference(val scale: Float) {
    Small(.92f),
    Normal(1f),
    Large(1.14f),
}

enum class DisclosurePreference { Hidden, Collapsed, Expanded }

data class DevicePreferences(
    val theme: ThemePreference = ThemePreference.Dark,
    val textSize: TextSizePreference = TextSizePreference.Normal,
    val reducedMotion: Boolean = false,
    val toolCalls: DisclosurePreference = DisclosurePreference.Expanded,
    val thinking: DisclosurePreference = DisclosurePreference.Collapsed,
    val sendOnEnter: Boolean = true,
    val autoScroll: Boolean = true,
    val showRunDuration: Boolean = true,
    val haptics: Boolean = true,
    /** Local opt-in intent. Server registration and OS permission remain authoritative. */
    val notificationsEnabled: Boolean = false,
    val installationId: String? = null,
)

@Singleton
class UserPreferences @Inject constructor(@ApplicationContext context: Context) {
    private val store: DataStore<Preferences> = PreferenceDataStoreFactory.create {
        File(context.noBackupFilesDir, "display.preferences_pb")
    }

    val values: Flow<DevicePreferences> = store.data.map { value ->
        DevicePreferences(
            theme = value[THEME]
                ?.let { runCatching { ThemePreference.valueOf(it) }.getOrNull() }
                ?: ThemePreference.Dark,
            textSize = value[TEXT_SIZE]
                ?.let { runCatching { TextSizePreference.valueOf(it) }.getOrNull() }
                ?: value[LEGACY_TEXT_SCALE]?.let(::textSizeFromLegacy)
                ?: TextSizePreference.Normal,
            reducedMotion = value[REDUCED_MOTION] ?: false,
            toolCalls = value[TOOL_CALLS]
                ?.let { runCatching { DisclosurePreference.valueOf(it) }.getOrNull() }
                ?: value[LEGACY_SHOW_TOOLS]?.let(::disclosureFromLegacy)
                ?: DisclosurePreference.Expanded,
            thinking = value[THINKING]
                ?.let { runCatching { DisclosurePreference.valueOf(it) }.getOrNull() }
                ?: value[LEGACY_SHOW_REASONING]?.let(::disclosureFromLegacy)
                ?: DisclosurePreference.Collapsed,
            sendOnEnter = value[SEND_ON_ENTER] ?: true,
            autoScroll = value[AUTO_SCROLL] ?: true,
            showRunDuration = value[SHOW_RUN_DURATION] ?: true,
            haptics = value[HAPTICS] ?: true,
            notificationsEnabled = value[NOTIFICATIONS_ENABLED] ?: false,
            installationId = value[INSTALLATION_ID],
        )
    }

    suspend fun update(value: DevicePreferences) {
        store.edit {
            it[THEME] = value.theme.name
            it[TEXT_SIZE] = value.textSize.name
            it[REDUCED_MOTION] = value.reducedMotion
            it[TOOL_CALLS] = value.toolCalls.name
            it[THINKING] = value.thinking.name
            it[SEND_ON_ENTER] = value.sendOnEnter
            it[AUTO_SCROLL] = value.autoScroll
            it[SHOW_RUN_DURATION] = value.showRunDuration
            it[HAPTICS] = value.haptics
            it[NOTIFICATIONS_ENABLED] = value.notificationsEnabled
            value.installationId?.let { id -> it[INSTALLATION_ID] = id } ?: it.remove(INSTALLATION_ID)
            it.remove(LEGACY_TEXT_SCALE)
            it.remove(LEGACY_SHOW_TOOLS)
            it.remove(LEGACY_SHOW_REASONING)
        }
    }

    suspend fun updateNotifications(enabled: Boolean, installationId: String? = null) {
        store.edit {
            it[NOTIFICATIONS_ENABLED] = enabled
            if (installationId != null) it[INSTALLATION_ID] = installationId
            else if (!enabled) it.remove(INSTALLATION_ID)
        }
    }

    private companion object {
        val THEME = stringPreferencesKey("theme")
        val TEXT_SIZE = stringPreferencesKey("text_size")
        val REDUCED_MOTION = booleanPreferencesKey("reduced_motion")
        val TOOL_CALLS = stringPreferencesKey("tool_calls")
        val THINKING = stringPreferencesKey("thinking")
        val SEND_ON_ENTER = booleanPreferencesKey("hardware_keyboard_send")
        val AUTO_SCROLL = booleanPreferencesKey("auto_scroll")
        val SHOW_RUN_DURATION = booleanPreferencesKey("show_durations")
        val HAPTICS = booleanPreferencesKey("haptics")
        val NOTIFICATIONS_ENABLED = booleanPreferencesKey("notifications_enabled")
        val INSTALLATION_ID = stringPreferencesKey("firebase_installation_id")
        val LEGACY_TEXT_SCALE = floatPreferencesKey("text_scale")
        val LEGACY_SHOW_TOOLS = booleanPreferencesKey("show_tools")
        val LEGACY_SHOW_REASONING = booleanPreferencesKey("show_reasoning")
    }
}

internal fun textSizeFromLegacy(scale: Float): TextSizePreference =
    TextSizePreference.entries.minBy { kotlin.math.abs(it.scale - scale) }

internal fun disclosureFromLegacy(enabled: Boolean): DisclosurePreference =
    if (enabled) DisclosurePreference.Expanded else DisclosurePreference.Hidden
