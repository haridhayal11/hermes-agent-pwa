package com.haridhayal.hermes.core.database

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Transaction
import kotlinx.coroutines.flow.Flow

@Dao
interface HermesDao {
    @Query("SELECT * FROM projects ORDER BY lastActiveAt DESC")
    fun observeProjects(): Flow<List<ProjectEntity>>

    @Query("SELECT * FROM sessions WHERE projectId = :projectId ORDER BY lastActiveAt DESC")
    fun observeSessions(projectId: String): Flow<List<SessionEntity>>

    @Query("SELECT * FROM sessions ORDER BY lastActiveAt DESC")
    fun observeAllSessions(): Flow<List<SessionEntity>>

    @Query("SELECT * FROM messages WHERE sessionId = :sessionId ORDER BY ordinal")
    fun observeMessages(sessionId: String): Flow<List<MessageEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertProjects(projects: List<ProjectEntity>)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertSessions(sessions: List<SessionEntity>)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertMessages(messages: List<MessageEntity>)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertCursor(cursor: RunCursorEntity)

    @Query("SELECT * FROM run_cursors WHERE sessionId = :sessionId")
    suspend fun cursor(sessionId: String): RunCursorEntity?

    @Query("DELETE FROM projects WHERE id NOT IN (:ids)")
    suspend fun removeMissingProjects(ids: List<String>)

    @Query("DELETE FROM sessions WHERE projectId = :projectId AND id NOT IN (:ids)")
    suspend fun removeMissingSessions(projectId: String, ids: List<String>)

    @Query("DELETE FROM messages WHERE sessionId = :sessionId")
    suspend fun clearMessages(sessionId: String)

    @Query(
        "DELETE FROM messages WHERE sessionId = :sessionId AND ordinal NOT IN " +
            "(SELECT ordinal FROM messages WHERE sessionId = :sessionId ORDER BY ordinal DESC LIMIT :limit)",
    )
    suspend fun pruneMessages(sessionId: String, limit: Int = 500)

    @Insert(onConflict = OnConflictStrategy.ABORT)
    suspend fun insertPrompt(prompt: PendingPromptEntity)

    @Insert(onConflict = OnConflictStrategy.ABORT)
    suspend fun insertAttachments(attachments: List<PendingAttachmentEntity>)

    @Transaction
    suspend fun insertOutbox(
        prompt: PendingPromptEntity,
        attachments: List<PendingAttachmentEntity>,
    ) {
        insertPrompt(prompt)
        insertAttachments(attachments)
    }

    @Query(
        "SELECT * FROM pending_prompts WHERE sessionId = :sessionId " +
            "AND status IN ('queued', 'retrying') ORDER BY createdAt ASC LIMIT 1",
    )
    suspend fun nextPrompt(sessionId: String): PendingPromptEntity?

    @Query("SELECT * FROM pending_attachments WHERE promptId = :promptId ORDER BY id")
    suspend fun attachments(promptId: String): List<PendingAttachmentEntity>

    @Query(
        "UPDATE pending_prompts SET status = :status, errorCode = :code, errorMessage = :message, " +
            "attemptCount = attemptCount + :attemptIncrement WHERE id = :id",
    )
    suspend fun updatePrompt(
        id: String,
        status: String,
        code: String? = null,
        message: String? = null,
        attemptIncrement: Int = 0,
    )

    @Query("UPDATE pending_attachments SET uploadedJson = :json WHERE id = :id")
    suspend fun markAttachmentUploaded(id: String, json: String)

    @Query("DELETE FROM pending_prompts WHERE id = :id")
    suspend fun deletePrompt(id: String)

    @Query("SELECT * FROM pending_prompts ORDER BY createdAt")
    fun observeOutbox(): Flow<List<PendingPromptEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertMedia(entry: MediaCacheEntity)

    @Query("SELECT COALESCE(SUM(size), 0) FROM media_cache")
    suspend fun mediaBytes(): Long

    @Query("SELECT * FROM media_cache ORDER BY lastAccessedAt ASC")
    suspend fun mediaByOldestAccess(): List<MediaCacheEntity>

    @Query("DELETE FROM media_cache WHERE cacheKey = :key")
    suspend fun deleteMedia(key: String)

    @Query("DELETE FROM media_cache")
    suspend fun clearMediaRows()

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertSyncState(state: SyncStateEntity)

    @Query("SELECT cursor FROM sync_state WHERE name = :name")
    suspend fun syncCursor(name: String): Long?

    @Query("DELETE FROM projects")
    suspend fun clearProjects()

    @Query("DELETE FROM pending_prompts")
    suspend fun clearOutbox()

    @Transaction
    suspend fun clearAllProtectedData() {
        clearOutbox()
        clearProjects()
        clearMediaRows()
    }
}
