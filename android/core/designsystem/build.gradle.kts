plugins {
    id("hermes.android.library")
    id("hermes.android.compose")
}

android { namespace = "com.haridhayal.hermes.core.designsystem" }

dependencies {
    implementation(project(":core:model"))
    implementation(platform(libs.compose.bom))
    api(libs.compose.material3)
    api(libs.compose.ui)
    api(libs.compose.material.icons)
    implementation(libs.compose.ui.tooling.preview)
}
