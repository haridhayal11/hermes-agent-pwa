package com.haridhayal.hermes.feature.projects

import androidx.compose.foundation.clickable
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.ExpandLess
import androidx.compose.material.icons.outlined.ExpandMore
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material.icons.outlined.Schedule
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationDrawerItem
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.haridhayal.hermes.core.model.ProjectDto
import com.haridhayal.hermes.core.model.SessionDto
import com.haridhayal.hermes.core.model.recentFirst

@Composable
fun ProjectTreePanel(
    projects: List<ProjectDto>,
    sessions: List<SessionDto>,
    selectedSessionId: String?,
    onOpenProject: (ProjectDto) -> Unit,
    onSelect: (ProjectDto, SessionDto) -> Unit,
    onNewProject: () -> Unit,
    onNewSession: (ProjectDto) -> Unit,
    onSearch: () -> Unit,
    onJobs: () -> Unit,
    onSettings: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val expanded = remember { mutableStateMapOf<String, Boolean>() }
    Column(
        modifier
            .fillMaxHeight()
            .width(328.dp)
            .background(MaterialTheme.colorScheme.surfaceContainerLow)
            .padding(horizontal = 12.dp, vertical = 8.dp),
    ) {
        Row(Modifier.padding(horizontal = 8.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
            Text("Hermes", style = MaterialTheme.typography.headlineSmall, modifier = Modifier.weight(1f))
            IconButton(onClick = onNewProject) { Icon(Icons.Outlined.Add, "New project") }
        }
        Column(Modifier.weight(1f).verticalScroll(rememberScrollState())) {
            projects.filterNot { it.archived }.forEach { project ->
                val projectSessions = sessions.filter { it.projectId == project.id }.recentFirst()
                val open = expanded[project.id] ?: projectSessions.any { it.id == selectedSessionId }
                Surface(
                    modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp),
                    shape = MaterialTheme.shapes.large,
                    color = MaterialTheme.colorScheme.surfaceContainer,
                ) {
                    Column(Modifier.padding(vertical = 4.dp)) {
                        Row(
                            Modifier.fillMaxWidth().padding(start = 8.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Row(
                                modifier = Modifier
                                    .weight(1f)
                                    .clickable { onOpenProject(project) }
                                    .padding(vertical = 12.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Text(project.emoji ?: "✦", modifier = Modifier.padding(horizontal = 8.dp))
                                Text(
                                    project.name,
                                    fontWeight = FontWeight.SemiBold,
                                    modifier = Modifier.weight(1f),
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                )
                                if (project.unreadScheduledCount > 0) {
                                    UnreadCount(project.unreadScheduledCount)
                                }
                            }
                            IconButton(onClick = { expanded[project.id] = !open }) {
                                Icon(
                                    if (open) Icons.Outlined.ExpandLess else Icons.Outlined.ExpandMore,
                                    if (open) "Collapse" else "Expand",
                                )
                            }
                            IconButton(onClick = { onNewSession(project) }) { Icon(Icons.Outlined.Add, "New chat") }
                        }
                        if (open) {
                            val byParent = projectSessions.groupBy { it.parentSessionId }
                            byParent[null].orEmpty().forEach { session ->
                                key(session.id) {
                                    SessionRow(
                                        project,
                                        session,
                                        byParent,
                                        selectedSessionId,
                                        0,
                                        project.unreadScheduledCount,
                                        onSelect,
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
        Surface(
            modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
            shape = MaterialTheme.shapes.large,
            color = MaterialTheme.colorScheme.surfaceContainer,
        ) {
            Column(Modifier.padding(vertical = 4.dp)) {
                NavigationDrawerItem(Icons.Outlined.Search, "Search", onSearch)
                NavigationDrawerItem(Icons.Outlined.Schedule, "Jobs", onJobs)
                NavigationDrawerItem(Icons.Outlined.Settings, "Settings", onSettings)
            }
        }
    }
}

@Composable
private fun SessionRow(
    project: ProjectDto,
    session: SessionDto,
    children: Map<String?, List<SessionDto>>,
    selectedSessionId: String?,
    depth: Int,
    unreadScheduledCount: Int,
    onSelect: (ProjectDto, SessionDto) -> Unit,
) {
    NavigationDrawerItem(
        label = {
            Row(verticalAlignment = Alignment.CenterVertically) {
                if (session.kind == "scheduled") {
                    Icon(
                        Icons.Outlined.Schedule,
                        contentDescription = null,
                        modifier = Modifier.padding(end = 4.dp).size(18.dp),
                    )
                }
                Text(
                    session.title,
                    modifier = Modifier.weight(1f),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                if (session.kind == "scheduled" && unreadScheduledCount > 0) {
                    UnreadCount(unreadScheduledCount)
                }
            }
        },
        selected = session.id == selectedSessionId,
        onClick = { onSelect(project, session) },
        modifier = Modifier.padding(start = (12 * depth).dp),
    )
    children[session.id].orEmpty().forEach { child ->
        key(child.id) {
            SessionRow(project, child, children, selectedSessionId, depth + 1, unreadScheduledCount, onSelect)
        }
    }
}

@Composable
private fun UnreadCount(count: Int) {
    Surface(
        shape = MaterialTheme.shapes.extraLarge,
        color = MaterialTheme.colorScheme.primary,
        contentColor = MaterialTheme.colorScheme.onPrimary,
    ) {
        Text(
            count.coerceAtMost(99).toString(),
            modifier = Modifier.padding(horizontal = 7.dp, vertical = 2.dp),
            style = MaterialTheme.typography.labelSmall,
        )
    }
}

@Composable
private fun NavigationDrawerItem(
    icon: androidx.compose.ui.graphics.vector.ImageVector?,
    label: String,
    onClick: () -> Unit,
) {
    NavigationDrawerItem(
        label = { Text(label) },
        selected = false,
        onClick = onClick,
        icon = icon?.let { { Icon(it, null) } },
    )
}
