package com.haridhayal.hermes.notifications

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.hilt.work.HiltWorker
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import androidx.work.workDataOf
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import com.haridhayal.hermes.MainActivity
import com.haridhayal.hermes.R
import com.haridhayal.hermes.core.data.HermesRepository
import com.haridhayal.hermes.core.data.UserPreferences
import com.haridhayal.hermes.core.model.NotificationKind
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject
import java.net.URI
import java.net.URLDecoder
import java.nio.charset.StandardCharsets
import kotlinx.coroutines.flow.first

data class NotificationDestination(val projectId: String, val sessionId: String)

internal fun notificationDestination(data: Map<String, String>): NotificationDestination? {
    val directProject = data[EXTRA_PROJECT_ID]
    val directSession = data[EXTRA_SESSION_ID]
    if (!directProject.isNullOrBlank() && !directSession.isNullOrBlank()) {
        return NotificationDestination(directProject, directSession)
    }
    val segments = runCatching {
        URI(data["url"].orEmpty()).rawPath
            .split('/')
            .filter(String::isNotEmpty)
            .map { URLDecoder.decode(it.replace("+", "%2B"), StandardCharsets.UTF_8) }
    }.getOrDefault(emptyList())
    val projectAt = segments.indexOf("p")
    val sessionAt = segments.indexOf("s")
    if (projectAt < 0 || sessionAt < 0) return null
    return NotificationDestination(
        segments.getOrNull(projectAt + 1)?.takeIf(String::isNotBlank) ?: return null,
        segments.getOrNull(sessionAt + 1)?.takeIf(String::isNotBlank) ?: return null,
    )
}

class HermesMessagingService : FirebaseMessagingService() {
    override fun onRegistered(installationId: String) {
        enqueueNotificationRegistration(this, installationId)
    }

    override fun onMessageReceived(message: RemoteMessage) {
        val data = message.data
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) return
        createActivityChannel(this)
        val destination = notificationDestination(data)
        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
            destination?.let {
                putExtra(EXTRA_PROJECT_ID, it.projectId)
                putExtra(EXTRA_SESSION_ID, it.sessionId)
            }
        }
        val tag = data["tag"].orEmpty().ifBlank { "hermes-${data["kind"].orEmpty().ifBlank { "activity" }}" }
        val pendingIntent = PendingIntent.getActivity(
            this,
            tag.hashCode(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val notification = NotificationCompat.Builder(this, ACTIVITY_CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_launcher_foreground)
            .setContentTitle(data["title"].orEmpty().ifBlank { "Hermes activity" })
            .setContentText(data["body"].orEmpty())
            .setStyle(NotificationCompat.BigTextStyle().bigText(data["body"].orEmpty()))
            .setContentIntent(pendingIntent)
            .setAutoCancel(true)
            .setOnlyAlertOnce(true)
            .setCategory(NotificationCompat.CATEGORY_STATUS)
            .build()
        NotificationManagerCompat.from(this).notify(tag, tag.hashCode(), notification)
    }
}

fun createActivityChannel(context: Context) {
    if (Build.VERSION.SDK_INT < 26) return
    val manager = context.getSystemService(NotificationManager::class.java)
    manager.createNotificationChannel(
        NotificationChannel(
            ACTIVITY_CHANNEL_ID,
            "Hermes activity",
            NotificationManager.IMPORTANCE_DEFAULT,
        ).apply {
            description = "Run, approval, question, and scheduled job activity"
        },
    )
}

fun enqueueNotificationRegistration(context: Context, installationId: String) {
    val request = OneTimeWorkRequestBuilder<NotificationRegistrationWorker>()
        .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
        .setInputData(workDataOf(NotificationRegistrationWorker.INSTALLATION_ID to installationId))
        .build()
    WorkManager.getInstance(context).enqueueUniqueWork(
        NOTIFICATION_REGISTRATION_WORK,
        ExistingWorkPolicy.REPLACE,
        request,
    )
}

@HiltWorker
class NotificationRegistrationWorker @AssistedInject constructor(
    @Assisted context: Context,
    @Assisted params: WorkerParameters,
    private val repository: HermesRepository,
    private val preferences: UserPreferences,
) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val installationId = inputData.getString(INSTALLATION_ID) ?: return Result.failure()
        val local = preferences.values.first()
        if (!local.notificationsEnabled || repository.connection.first() == null) return Result.success()
        return try {
            val state = runCatching { repository.notificationSettings() }.getOrNull()
            val kinds = state?.kinds?.takeIf { state.enabled } ?: NotificationKind.entries
            repository.registerNotifications(installationId, kinds)
            preferences.updateNotifications(true, installationId)
            Result.success()
        } catch (_: Throwable) {
            Result.retry()
        }
    }

    companion object { const val INSTALLATION_ID = "installation_id" }
}

const val ACTIVITY_CHANNEL_ID = "hermes_activity"
const val EXTRA_PROJECT_ID = "projectId"
const val EXTRA_SESSION_ID = "sessionId"
private const val NOTIFICATION_REGISTRATION_WORK = "hermes-notification-registration"
