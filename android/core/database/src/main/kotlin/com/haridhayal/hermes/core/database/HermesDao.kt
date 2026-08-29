package com.haridhayal.hermes.core.database

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Transaction
import androidx.room.Upsert
import kotlinx.coroutines.flow.Flow

@Dao
interface HermesDao {
    @Query("SELECT * FROM projects ORDER BY lastActiveAt DESC, id ASC")
    fun observeProjects(): Flow<List<ProjectEntity>>

    @Query("SELECT * FROM sessions WHERE projectId = :projectId ORDER BY lastActiveAt DESC, id ASC")
    fun observeSessions(projectId: String): Flow<List<SessionEntity>>

    @Query("SELECT * FROM sessions ORDER BY lastActiveAt DESC, id ASC")
    fun observeAllSessions(): Flow<List<SessionEntity>>

    @Query("SELECT * FROM messages WHERE sessionId = :sessionId ORDER BY ordinal")
    fun observeMessages(sessionId: String): Flow<List<MessageEntity>>

    @Upsert
    suspend fun upsertProjects(projects: List<ProjectEntity>)

    @Upsert
    suspend fun upsertSessions(sessions: List<SessionEntity>)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertMessages(messages: List<MessageEntity>)

    @Transaction
    suspend fun replaceMessages(sessionId: String, messages: List<MessageEntity>) {
        clearMessages(sessionId)
        upsertMessages(messages)
        pruneMessages(sessionId)
    }

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertCursor(cursor: RunCursorEntity)

    @Query("SELECT * FROM run_cursors WHERE sessionId = :sessionId")
    suspend fun cursor(sessionId: String): RunCursorEntity?

    @Query("DELETE FROM projects WHERE id NOT IN (:ids)")
    suspend fun removeMissingProjects(ids: List<String>)

    @Query("DELETE FROM messages WHERE sessionId IN (SELECT id FROM sessions WHERE projectId NOT IN (:projectIds))")
    suspend fun clearMessagesForMissingProjects(projectIds: List<String>)

    @Query("DELETE FROM run_cursors WHERE sessionId IN (SELECT id FROM sessions WHERE projectId NOT IN (:projectIds))")
    suspend fun clearCursorsForMissingProjects(projectIds: List<String>)

    @Transaction
    suspend fun removeMissingProjectData(projectIds: List<String>) {
        clearMessagesForMissingProjects(projectIds)
        clearCursorsForMissingProjects(projectIds)
        removeMissingProjects(projectIds)
    }

    @Query("DELETE FROM sessions WHERE projectId = :projectId AND id NOT IN (:ids)")
    suspend fun removeMissingSessions(projectId: String, ids: List<String>)

    @Query("DELETE FROM sessions WHERE projectId = :projectId")
    suspend fun clearSessions(projectId: String)

    @Query("DELETE FROM messages WHERE sessionId IN (SELECT id FROM sessions WHERE projectId = :projectId AND id NOT IN (:ids))")
    suspend fun clearMessagesForMissingSessions(projectId: String, ids: List<String>)

    @Query("DELETE FROM run_cursors WHERE sessionId IN (SELECT id FROM sessions WHERE projectId = :projectId AND id NOT IN (:ids))")
    suspend fun clearCursorsForMissingSessions(projectId: String, ids: List<String>)

    @Query("DELETE FROM messages WHERE sessionId IN (SELECT id FROM sessions WHERE projectId = :projectId)")
    suspend fun clearMessagesForProject(projectId: String)

    @Query("DELETE FROM run_cursors WHERE sessionId IN (SELECT id FROM sessions WHERE projectId = :projectId)")
    suspend fun clearCursorsForProject(projectId: String)

    @Transaction
    suspend fun replaceSessions(projectId: String, sessions: List<SessionEntity>) {
        upsertSessions(sessions)
        if (sessions.isEmpty()) {
            clearMessagesForProject(projectId)
            clearCursorsForProject(projectId)
            clearSessions(projectId)
        } else {
            val ids = sessions.map { it.id }
            clearMessagesForMissingSessions(projectId, ids)
            clearCursorsForMissingSessions(projectId, ids)
            removeMissingSessions(projectId, ids)
        }
    }

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

    @Query("DELETE FROM messages")
    suspend fun clearAllMessages()

    @Query("DELETE FROM run_cursors")
    suspend fun clearRunCursors()

    @Transaction
    suspend fun replaceProjectTree(
        projects: List<ProjectEntity>,
        sessionsByProject: Map<String, List<SessionEntity>>,
    ) {
        if (projects.isEmpty()) {
            clearAllMessages()
            clearRunCursors()
            clearProjects()
            return
        }
        upsertProjects(projects)
        removeMissingProjectData(projects.map { it.id })
        projects.forEach { project ->
            replaceSessions(project.id, sessionsByProject[project.id].orEmpty())
        }
    }

    @Query("DELETE FROM sync_state")
    suspend fun clearSyncState()

    @Query("DELETE FROM pending_prompts")
    suspend fun clearOutbox()

    @Transaction
    suspend fun clearAllProtectedData() {
        clearOutbox()
        clearAllMessages()
        clearRunCursors()
        clearSyncState()
        clearProjects()
        clearMediaRows()
    }
}
