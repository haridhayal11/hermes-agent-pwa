package com.haridhayal.hermes.core.data

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.emptyPreferences
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStoreFile
import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import com.haridhayal.hermes.core.model.ConnectionConfig
import dagger.hilt.android.qualifiers.ApplicationContext
import java.io.File
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.first
import java.util.Base64

@Singleton
class CredentialStore @Inject constructor(@ApplicationContext private val context: Context) {
    private val dataStore: DataStore<Preferences> = PreferenceDataStoreFactory.create {
        File(context.noBackupFilesDir, "connection.preferences_pb")
    }

    val connection: Flow<ConnectionConfig?> = dataStore.data
        .catch { emit(emptyPreferences()) }
        .map { preferences ->
            val host = preferences[HOST] ?: return@map null
            val ciphertext = preferences[TOKEN] ?: return@map null
            val iv = preferences[IV] ?: return@map null
            runCatching { ConnectionConfig(host, decrypt(ciphertext, iv)) }.getOrNull()
        }

    suspend fun current(): ConnectionConfig? = connection.first()

    suspend fun save(config: ConnectionConfig) {
        val (ciphertext, iv) = encrypt(config.accessToken)
        dataStore.edit {
            it[HOST] = config.baseUrl.trimEnd('/')
            it[TOKEN] = ciphertext
            it[IV] = iv
        }
    }

    suspend fun clear() {
        dataStore.edit { it.clear() }
        val keyStore = KeyStore.getInstance(KEYSTORE).apply { load(null) }
        if (keyStore.containsAlias(KEY_ALIAS)) keyStore.deleteEntry(KEY_ALIAS)
    }

    private fun key(): SecretKey {
        val keyStore = KeyStore.getInstance(KEYSTORE).apply { load(null) }
        (keyStore.getKey(KEY_ALIAS, null) as? SecretKey)?.let { return it }
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE).run {
            init(
                KeyGenParameterSpec.Builder(
                    KEY_ALIAS,
                    KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
                )
                    .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                    .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                    .setRandomizedEncryptionRequired(true)
                    .build(),
            )
            generateKey()
        }
    }

    private fun encrypt(value: String): Pair<String, String> {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, key())
        return Base64.getEncoder().encodeToString(cipher.doFinal(value.toByteArray())) to
            Base64.getEncoder().encodeToString(cipher.iv)
    }

    private fun decrypt(ciphertext: String, iv: String): String {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(
            Cipher.DECRYPT_MODE,
            key(),
            GCMParameterSpec(128, Base64.getDecoder().decode(iv)),
        )
        return cipher.doFinal(Base64.getDecoder().decode(ciphertext)).toString(Charsets.UTF_8)
    }

    private companion object {
        const val KEYSTORE = "AndroidKeyStore"
        const val KEY_ALIAS = "hermes.device.token.v1"
        const val TRANSFORMATION = "AES/GCM/NoPadding"
        val HOST = stringPreferencesKey("host")
        val TOKEN = stringPreferencesKey("token_ciphertext")
        val IV = stringPreferencesKey("token_iv")
    }
}
