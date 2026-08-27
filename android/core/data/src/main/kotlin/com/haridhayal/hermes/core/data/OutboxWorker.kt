package com.haridhayal.hermes.core.data

import android.content.Context
import androidx.hilt.work.HiltWorker
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.haridhayal.hermes.core.database.HermesDao
import com.haridhayal.hermes.core.model.AttachmentDto
import com.haridhayal.hermes.core.model.SendMessageRequest
import com.haridhayal.hermes.core.network.HermesApiClient
import com.haridhayal.hermes.core.network.HermesApiException
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject
import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.encodeToString

@HiltWorker
class OutboxWorker @AssistedInject constructor(
    @Assisted context: Context,
    @Assisted params: WorkerParameters,
    private val credentials: CredentialStore,
    private val api: HermesApiClient,
    private val dao: HermesDao,
) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        val targetSession = inputData.getString(SESSION_ID) ?: return@withContext Result.failure()
        val config = credentials.current() ?: return@withContext Result.failure()
        while (true) {
            val prompt = dao.nextPrompt(targetSession) ?: return@withContext Result.success()
            try {
                dao.updatePrompt(prompt.id, "retrying", attemptIncrement = 1)
                val uploaded = dao.attachments(prompt.id).map { attachment ->
                    attachment.uploadedJson?.let {
                        return@map api.json.decodeFromString<AttachmentDto>(it)
                    }
                    val result = api.upload(
                        config,
                        prompt.projectId,
                        File(attachment.localPath),
                        attachment.mimeType,
                        attachment.sha256,
                        "${prompt.id}:${attachment.id}",
                    )
                    dao.markAttachmentUploaded(attachment.id, api.json.encodeToString(result))
                    result
                }
                api.send(
                    config,
                    prompt.projectId,
                    prompt.sessionId,
                    SendMessageRequest(prompt.text, uploaded, "queue"),
                    prompt.id,
                )
                dao.deletePrompt(prompt.id)
                File(applicationContext.noBackupFilesDir, "outbox/${prompt.id}").deleteRecursively()
            } catch (error: HermesApiException) {
                if (error.authenticationFailed) {
                    dao.updatePrompt(prompt.id, "authentication_required", error.code, error.message)
                    return@withContext Result.failure()
                }
                if (error.permanent) {
                    dao.updatePrompt(prompt.id, "failed", error.code, error.message)
                    return@withContext Result.success()
                }
                dao.updatePrompt(prompt.id, "queued", error.code, error.message)
                return@withContext Result.retry()
            } catch (error: Exception) {
                dao.updatePrompt(prompt.id, "queued", "network_error", error.message)
                return@withContext Result.retry()
            }
        }
        @Suppress("UNREACHABLE_CODE")
        Result.success()
    }

    companion object { const val SESSION_ID = "session_id" }
}
