package com.haridhayal.hermes.core.database

import androidx.room.Room
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class ProjectUpsertTest {
    private lateinit var database: HermesDatabase
    private lateinit var dao: HermesDao

    @Before
    fun createDatabase() {
        database = Room.inMemoryDatabaseBuilder(
            InstrumentationRegistry.getInstrumentation().targetContext,
            HermesDatabase::class.java,
        ).build()
        dao = database.dao()
    }

    @After
    fun closeDatabase() {
        database.close()
    }

    @Test
    fun replacingAProjectTreePreservesItsSessionsAsOneSnapshot() = runBlocking {
        dao.replaceProjectTree(
            projects = listOf(project(json = "before")),
            sessionsByProject = mapOf(PROJECT_ID to listOf(session())),
        )

        dao.replaceProjectTree(
            projects = listOf(project(json = "after")),
            sessionsByProject = mapOf(PROJECT_ID to listOf(session())),
        )

        assertEquals("after", dao.observeProjects().first().single().json)
        assertEquals(listOf(session()), dao.observeSessions(PROJECT_ID).first())
    }

    private fun project(json: String) = ProjectEntity(
        id = PROJECT_ID,
        json = json,
        activeSessionId = SESSION_ID,
        lastActiveAt = 1,
    )

    private fun session() = SessionEntity(
        id = SESSION_ID,
        projectId = PROJECT_ID,
        parentSessionId = null,
        json = "scheduled",
        lastActiveAt = 1,
    )

    private companion object {
        const val PROJECT_ID = "project"
        const val SESSION_ID = "project__scheduled"
    }
}
