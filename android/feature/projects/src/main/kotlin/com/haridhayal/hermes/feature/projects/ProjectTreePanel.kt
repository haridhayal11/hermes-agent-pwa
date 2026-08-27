package com.haridhayal.hermes.feature.projects

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.ExpandLess
import androidx.compose.material.icons.outlined.ExpandMore
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationDrawerItem
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.haridhayal.hermes.core.model.ProjectDto
import com.haridhayal.hermes.core.model.SessionDto

@Composable
fun ProjectTreePanel(
    projects: List<ProjectDto>,
    sessions: List<SessionDto>,
    selectedSessionId: String?,
    onSelect: (ProjectDto, SessionDto) -> Unit,
    onNewProject: () -> Unit,
    onNewSession: (ProjectDto) -> Unit,
    onSearch: () -> Unit,
    onJobs: () -> Unit,
    onSettings: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val expanded = remember { mutableStateMapOf<String, Boolean>() }
    Column(modifier.fillMaxHeight().width(320.dp).padding(12.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("Hermes", style = MaterialTheme.typography.titleLarge, modifier = Modifier.weight(1f))
            IconButton(onClick = onNewProject) { Icon(Icons.Outlined.Add, "New project") }
        }
        Column(Modifier.weight(1f).verticalScroll(rememberScrollState())) {
            projects.filterNot { it.archived }.forEach { project ->
                val projectSessions = sessions.filter { it.projectId == project.id }
                val open = expanded[project.id] ?: (project.activeSessionId == selectedSessionId)
                Row(
                    Modifier.fillMaxWidth().clickable { expanded[project.id] = !open }.padding(vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(project.emoji ?: "✦", modifier = Modifier.padding(horizontal = 8.dp))
                    Text(project.name, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Icon(if (open) Icons.Outlined.ExpandLess else Icons.Outlined.ExpandMore, "Expand")
                    IconButton(onClick = { onNewSession(project) }) { Icon(Icons.Outlined.Add, "New chat") }
                }
                if (open) {
                    val byParent = projectSessions.groupBy { it.parentSessionId }
                    byParent[null].orEmpty().forEach { session ->
                        SessionRow(project, session, byParent, selectedSessionId, 0, onSelect)
                    }
                }
            }
        }
        HorizontalDivider()
        NavigationDrawerItem(Icons.Outlined.Search, "Search", onSearch)
        NavigationDrawerItem(null, "Jobs", onJobs)
        NavigationDrawerItem(Icons.Outlined.Settings, "Settings", onSettings)
    }
}

@Composable
private fun SessionRow(
    project: ProjectDto,
    session: SessionDto,
    children: Map<String?, List<SessionDto>>,
    selectedSessionId: String?,
    depth: Int,
    onSelect: (ProjectDto, SessionDto) -> Unit,
) {
    NavigationDrawerItem(
        label = { Text(session.title, maxLines = 1, overflow = TextOverflow.Ellipsis) },
        selected = session.id == selectedSessionId,
        onClick = { onSelect(project, session) },
        modifier = Modifier.padding(start = (12 * depth).dp),
    )
    children[session.id].orEmpty().forEach {
        SessionRow(project, it, children, selectedSessionId, depth + 1, onSelect)
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
