package com.haridhayal.hermes.core.database

import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index

@Entity(tableName = "projects", primaryKeys = ["id"])
data class ProjectEntity(
    val id: String,
    val json: String,
    val activeSessionId: String,
    val lastActiveAt: Long,
)

@Entity(
    tableName = "sessions",
    primaryKeys = ["id"],
    foreignKeys = [
        ForeignKey(
            entity = ProjectEntity::class,
            parentColumns = ["id"],
            childColumns = ["projectId"],
            onDelete = ForeignKey.CASCADE,
        ),
    ],
    indices = [Index("projectId"), Index("parentSessionId")],
)
data class SessionEntity(
    val id: String,
    val projectId: String,
    val parentSessionId: String?,
    val json: String,
    val lastActiveAt: Long,
)

@Entity(
    tableName = "messages",
    primaryKeys = ["sessionId", "ordinal"],
    indices = [Index(value = ["sessionId", "serverId"], unique = false)],
)
data class MessageEntity(
    val sessionId: String,
    val ordinal: Long,
    val serverId: String?,
    val json: String,
)

@Entity(tableName = "run_cursors", primaryKeys = ["sessionId"])
data class RunCursorEntity(
    val sessionId: String,
    val runId: String,
    val sequence: Long,
    val updatedAt: Long,
)

@Entity(
    tableName = "pending_prompts",
    primaryKeys = ["id"],
    indices = [Index(value = ["sessionId", "createdAt"])],
)
data class PendingPromptEntity(
    val id: String,
    val projectId: String,
    val sessionId: String,
    val text: String,
    val status: String,
    val errorCode: String?,
    val errorMessage: String?,
    val createdAt: Long,
    val attemptCount: Int,
)

@Entity(
    tableName = "pending_attachments",
    primaryKeys = ["id"],
    foreignKeys = [
        ForeignKey(
            entity = PendingPromptEntity::class,
            parentColumns = ["id"],
            childColumns = ["promptId"],
            onDelete = ForeignKey.CASCADE,
        ),
    ],
    indices = [Index("promptId")],
)
data class PendingAttachmentEntity(
    val id: String,
    val promptId: String,
    val name: String,
    val mimeType: String,
    val localPath: String,
    val size: Long,
    val sha256: String,
    val uploadedJson: String?,
)

@Entity(tableName = "media_cache", primaryKeys = ["cacheKey"], indices = [Index("lastAccessedAt")])
data class MediaCacheEntity(
    val cacheKey: String,
    val localPath: String,
    val size: Long,
    val lastAccessedAt: Long,
)

@Entity(tableName = "sync_state", primaryKeys = ["name"])
data class SyncStateEntity(val name: String, val cursor: Long)
