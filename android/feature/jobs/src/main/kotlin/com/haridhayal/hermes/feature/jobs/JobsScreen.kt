package com.haridhayal.hermes.feature.jobs

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Checkbox
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.haridhayal.hermes.core.model.JobBindingDto
import com.haridhayal.hermes.core.model.JobDto
import com.haridhayal.hermes.core.model.JobWriteRequest
import com.haridhayal.hermes.core.model.ProjectDto
import com.haridhayal.hermes.core.model.SkillDto
import com.haridhayal.hermes.core.designsystem.HermesGroup
import com.haridhayal.hermes.core.designsystem.HermesRow
import com.haridhayal.hermes.core.designsystem.HermesSectionLabel
import com.haridhayal.hermes.core.designsystem.HermesTopBar

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun JobsScreen(
    jobs: List<JobDto>,
    unavailable: Boolean,
    projects: List<ProjectDto>,
    skills: List<SkillDto>,
    error: String?,
    savedRevision: Long,
    onBack: () -> Unit,
    onCreate: (JobWriteRequest) -> Unit,
    onUpdate: (String, JobWriteRequest) -> Unit,
    onAction: (String, String) -> Unit,
    onDelete: (String) -> Unit,
) {
    var editing by remember { mutableStateOf<JobDto?>(null) }
    var creating by remember { mutableStateOf(false) }
    var deleting by remember { mutableStateOf<JobDto?>(null) }
    var awaitingSave by remember { mutableStateOf(false) }
    LaunchedEffect(savedRevision) {
        if (awaitingSave) {
            awaitingSave = false
            creating = false
            editing = null
        }
    }
    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = { HermesTopBar("Scheduled jobs", onBack) },
        floatingActionButton = {
            if (!unavailable) FloatingActionButton(onClick = { creating = true }) { Text("+") }
        },
    ) { padding ->
        LazyColumn(Modifier.fillMaxSize().padding(padding).padding(horizontal = 18.dp)) {
            item { androidx.compose.foundation.layout.Spacer(Modifier.padding(top = 10.dp)) }
            if (unavailable) item {
                HermesGroup(Modifier.padding(vertical = 8.dp)) {
                    HermesRow("Scheduled jobs unavailable", "This Hermes host does not advertise job support")
                }
            }
            error?.let { item { Text(it, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(8.dp)) } }
            if (!unavailable && jobs.isEmpty()) item {
                HermesGroup(Modifier.padding(vertical = 8.dp)) {
                    HermesRow("No scheduled jobs", "Create one with the + button")
                }
            }
            if (jobs.isNotEmpty()) item { HermesSectionLabel("Jobs", Modifier.padding(top = 12.dp)) }
            items(jobs, key = { it.id }) { job ->
                Surface(
                    modifier = Modifier.fillMaxWidth().padding(bottom = 12.dp).clickable { editing = job },
                    shape = MaterialTheme.shapes.large,
                    color = MaterialTheme.colorScheme.surfaceContainer,
                ) {
                    Column(Modifier.padding(horizontal = 18.dp, vertical = 16.dp), verticalArrangement = Arrangement.spacedBy(5.dp)) {
                        Text(job.name, style = MaterialTheme.typography.titleMedium)
                        Text(
                            job.scheduleDisplay.ifBlank { job.schedule.display ?: job.schedule.kind.ifBlank { "Schedule unavailable" } },
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        Text(
                            if (job.enabled) job.state.ifBlank { "Enabled" }.replace('_', ' ') else "Paused",
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            style = MaterialTheme.typography.bodyMedium,
                        )
                        job.binding?.projectName?.let {
                            Text("Reports to $it", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodyMedium)
                        }
                        job.lastError?.takeIf(String::isNotBlank)?.let {
                            Text("Last error: $it", color = MaterialTheme.colorScheme.error)
                        }
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                            TextButton(onClick = { onAction(job.id, "run") }) { Text("Run now") }
                            TextButton(onClick = { onAction(job.id, if (job.enabled) "pause" else "resume") }) {
                                Text(if (job.enabled) "Pause" else "Resume")
                            }
                        }
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                            TextButton(onClick = { editing = job }) { Text("Edit") }
                            TextButton(onClick = { deleting = job }) { Text("Delete") }
                        }
                    }
                }
            }
        }
    }
    if (creating || editing != null) {
        JobEditor(
            job = editing,
            projects = projects,
            skills = skills,
            serverError = error,
            onDismiss = { awaitingSave = false; creating = false; editing = null },
            onSave = { request ->
                awaitingSave = true
                editing?.let { onUpdate(it.id, request) } ?: onCreate(request)
            },
        )
    }
    deleting?.let { job ->
        AlertDialog(
            onDismissRequest = { deleting = null },
            title = { Text("Delete ${job.name}?") },
            text = { Text("Hermes will delete the job and its run records. Messages already delivered to projects remain.") },
            confirmButton = { TextButton(onClick = { onDelete(job.id); deleting = null }) { Text("Delete") } },
            dismissButton = { TextButton(onClick = { deleting = null }) { Text("Keep") } },
        )
    }
}

@Composable
private fun JobEditor(
    job: JobDto?,
    projects: List<ProjectDto>,
    skills: List<SkillDto>,
    serverError: String?,
    onDismiss: () -> Unit,
    onSave: (JobWriteRequest) -> Unit,
) {
    var name by remember(job?.id) { mutableStateOf(job?.name.orEmpty()) }
    var schedule by remember(job?.id) { mutableStateOf(job?.scheduleDisplay.orEmpty()) }
    var prompt by remember(job?.id) { mutableStateOf(job?.prompt.orEmpty()) }
    var chosenSkills by remember(job?.id) { mutableStateOf(job?.skills.orEmpty()) }
    var destination by remember(job?.id) {
        mutableStateOf(job?.binding?.projectId ?: if (job != null && job.deliver != "local") "gateway" else "")
    }
    var gateway by remember(job?.id) { mutableStateOf(job?.deliver?.takeIf { it != "local" }.orEmpty()) }
    var repeat by remember(job?.id) { mutableStateOf("") }
    var validation by remember(job?.id) { mutableStateOf<String?>(null) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (job == null) "New job" else "Edit job") },
        text = {
            Column(
                Modifier.fillMaxWidth().heightIn(max = 560.dp).verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                OutlinedTextField(name, { name = it }, label = { Text("Name") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(
                    schedule,
                    { schedule = it },
                    label = { Text("Schedule") },
                    supportingText = { Text("Examples: every 30m, 0 9 * * *, 2026-02-03T14:00, or 2h once") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    prompt,
                    { prompt = it },
                    label = { Text("Prompt") },
                    minLines = 4,
                    modifier = Modifier.fillMaxWidth(),
                )
                Text("Skills", style = MaterialTheme.typography.titleSmall)
                if (skills.isEmpty()) Text("No installed skills", style = MaterialTheme.typography.bodySmall)
                skills.forEach { skill ->
                    Row(
                        Modifier.fillMaxWidth().clickable {
                            chosenSkills = if (skill.name in chosenSkills) chosenSkills - skill.name else chosenSkills + skill.name
                        },
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Checkbox(skill.name in chosenSkills, onCheckedChange = null)
                        Column { Text(skill.name); skill.description?.let { Text(it, style = MaterialTheme.typography.bodySmall) } }
                    }
                }
                Text("Report to", style = MaterialTheme.typography.titleSmall)
                DestinationRow("Nowhere — keep output on disk", destination == "") { destination = "" }
                projects.forEach { project ->
                    DestinationRow("${project.emoji.orEmpty()} ${project.name}".trim(), destination == project.id) {
                        destination = project.id
                    }
                }
                DestinationRow("Hermes gateway", destination == "gateway") { destination = "gateway" }
                if (destination == "gateway") {
                    OutlinedTextField(
                        gateway,
                        { gateway = it },
                        label = { Text("Gateway target") },
                        placeholder = { Text("telegram or telegram:-100123:17") },
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
                if (job == null) {
                    OutlinedTextField(
                        repeat,
                        { repeat = it.filter(Char::isDigit) },
                        label = { Text("Run at most") },
                        supportingText = { Text("Leave blank to run forever. This cannot be changed later.") },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        modifier = Modifier.fillMaxWidth(),
                    )
                } else {
                    val completed = job.repeat?.completed ?: 0
                    val limit = job.repeat?.times?.let { " of $it" }.orEmpty()
                    Text("Runs: $completed$limit. Run limits are create-only.", style = MaterialTheme.typography.bodySmall)
                }
                (validation ?: serverError)?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            }
        },
        confirmButton = {
            TextButton(onClick = {
                val limit = repeat.toIntOrNull()
                validation = when {
                    name.isBlank() -> "A name is required."
                    schedule.isBlank() -> "A schedule is required."
                    destination == "gateway" && gateway.isBlank() -> "Enter a gateway target."
                    repeat.isNotBlank() && (limit == null || limit < 1) -> "The run limit must be a positive number."
                    else -> null
                }
                if (validation == null) {
                    val project = projects.firstOrNull { it.id == destination }
                    onSave(
                        JobWriteRequest(
                            name = name.trim(),
                            schedule = schedule.trim(),
                            prompt = prompt,
                            deliver = if (destination == "gateway") gateway.trim() else "local",
                            skills = chosenSkills,
                            repeat = if (job == null) limit else null,
                            binding = project?.let { JobBindingDto(projectId = it.id, projectName = it.name) },
                        ),
                    )
                }
            }) { Text("Save") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

@Composable
private fun DestinationRow(label: String, selected: Boolean, onSelect: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clickable(onClick = onSelect),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        RadioButton(selected, onClick = onSelect)
        Text(label)
    }
}
