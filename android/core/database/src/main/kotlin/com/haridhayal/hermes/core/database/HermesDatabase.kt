package com.haridhayal.hermes.core.database

import androidx.room.Database
import androidx.room.RoomDatabase

@Database(
    entities = [
        ProjectEntity::class,
        SessionEntity::class,
        MessageEntity::class,
        RunCursorEntity::class,
        PendingPromptEntity::class,
        PendingAttachmentEntity::class,
        MediaCacheEntity::class,
        SyncStateEntity::class,
    ],
    version = 1,
    exportSchema = true,
)
abstract class HermesDatabase : RoomDatabase() {
    abstract fun dao(): HermesDao
}
