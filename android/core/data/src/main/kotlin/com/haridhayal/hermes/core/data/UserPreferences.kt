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

data class DisplayPreferences(
    val theme: ThemePreference = ThemePreference.System,
    val textScale: Float = 1f,
    val reducedMotion: Boolean = false,
    val showTools: Boolean = true,
    val showReasoning: Boolean = false,
    val hardwareKeyboardSend: Boolean = true,
    val autoScroll: Boolean = true,
    val showDurations: Boolean = true,
    val haptics: Boolean = true,
)

@Singleton
class UserPreferences @Inject constructor(@ApplicationContext context: Context) {
    private val store: DataStore<Preferences> = PreferenceDataStoreFactory.create {
        File(context.noBackupFilesDir, "display.preferences_pb")
    }

    val values: Flow<DisplayPreferences> = store.data.map { value ->
        DisplayPreferences(
            theme = runCatching { ThemePreference.valueOf(value[THEME] ?: "System") }.getOrDefault(ThemePreference.System),
            textScale = value[TEXT_SCALE] ?: 1f,
            reducedMotion = value[REDUCED_MOTION] ?: false,
            showTools = value[SHOW_TOOLS] ?: true,
            showReasoning = value[SHOW_REASONING] ?: false,
            hardwareKeyboardSend = value[HARDWARE_SEND] ?: true,
            autoScroll = value[AUTO_SCROLL] ?: true,
            showDurations = value[SHOW_DURATIONS] ?: true,
            haptics = value[HAPTICS] ?: true,
        )
    }

    suspend fun update(value: DisplayPreferences) {
        store.edit {
            it[THEME] = value.theme.name
            it[TEXT_SCALE] = value.textScale.coerceIn(.85f, 1.4f)
            it[REDUCED_MOTION] = value.reducedMotion
            it[SHOW_TOOLS] = value.showTools
            it[SHOW_REASONING] = value.showReasoning
            it[HARDWARE_SEND] = value.hardwareKeyboardSend
            it[AUTO_SCROLL] = value.autoScroll
            it[SHOW_DURATIONS] = value.showDurations
            it[HAPTICS] = value.haptics
        }
    }

    private companion object {
        val THEME = stringPreferencesKey("theme")
        val TEXT_SCALE = floatPreferencesKey("text_scale")
        val REDUCED_MOTION = booleanPreferencesKey("reduced_motion")
        val SHOW_TOOLS = booleanPreferencesKey("show_tools")
        val SHOW_REASONING = booleanPreferencesKey("show_reasoning")
        val HARDWARE_SEND = booleanPreferencesKey("hardware_keyboard_send")
        val AUTO_SCROLL = booleanPreferencesKey("auto_scroll")
        val SHOW_DURATIONS = booleanPreferencesKey("show_durations")
        val HAPTICS = booleanPreferencesKey("haptics")
    }
}
