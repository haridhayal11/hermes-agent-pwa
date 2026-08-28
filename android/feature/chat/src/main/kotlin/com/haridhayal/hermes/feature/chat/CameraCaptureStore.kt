package com.haridhayal.hermes.feature.chat

import android.content.ContentResolver
import android.content.Context
import android.net.Uri
import androidx.core.content.FileProvider
import java.io.File

private const val CAPTURE_DIRECTORY = "camera-captures"
private const val CAPTURE_ROOT = "camera-captures"
private const val FILE_PROVIDER_SUFFIX = ".fileprovider"
private const val CAPTURE_MAX_AGE_MS = 24L * 60L * 60L * 1_000L

internal object CameraCaptureStore {
    fun createDestination(context: Context): Uri {
        val directory = File(context.cacheDir, CAPTURE_DIRECTORY).apply { mkdirs() }
        val file = File.createTempFile("capture-", ".jpg", directory)
        return FileProvider.getUriForFile(
            context,
            context.packageName + FILE_PROVIDER_SUFFIX,
            file,
        )
    }

    fun delete(context: Context, uri: Uri): Boolean {
        if (!isOwnedCaptureUri(context.packageName, uri)) return false
        return runCatching {
            context.contentResolver.delete(uri, null, null) > 0
        }.getOrDefault(false)
    }

    fun prune(context: Context, now: Long = System.currentTimeMillis()) {
        val directory = File(context.cacheDir, CAPTURE_DIRECTORY)
        directory.listFiles()
            ?.filter { now - it.lastModified() >= CAPTURE_MAX_AGE_MS }
            ?.forEach { it.delete() }
    }
}

internal fun isOwnedCaptureUri(packageName: String, uri: Uri): Boolean =
    uri.scheme == ContentResolver.SCHEME_CONTENT &&
        uri.authority == packageName + FILE_PROVIDER_SUFFIX &&
        uri.pathSegments.firstOrNull() == CAPTURE_ROOT
