package com.haridhayal.hermes.core.data

import android.content.Context
import androidx.room.Room
import androidx.work.WorkManager
import com.haridhayal.hermes.core.database.HermesDao
import com.haridhayal.hermes.core.database.HermesDatabase
import com.haridhayal.hermes.core.network.HermesApiClient
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton
import kotlinx.serialization.json.Json
import okhttp3.OkHttpClient
import java.util.concurrent.TimeUnit

@Module
@InstallIn(SingletonComponent::class)
object DataModule {
    @Provides
    @Singleton
    fun database(@ApplicationContext context: Context): HermesDatabase =
        Room.databaseBuilder(context, HermesDatabase::class.java, "hermes-cache.db").build()

    @Provides fun dao(database: HermesDatabase): HermesDao = database.dao()

    @Provides
    @Singleton
    fun httpClient(): OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(0, TimeUnit.MILLISECONDS)
        .build()

    @Provides
    @Singleton
    fun apiClient(client: OkHttpClient): HermesApiClient = HermesApiClient(client)

    @Provides
    fun workManager(@ApplicationContext context: Context): WorkManager = WorkManager.getInstance(context)
}
