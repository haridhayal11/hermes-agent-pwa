plugins { id("hermes.android.library"); id("hermes.android.compose") }
android { namespace = "com.haridhayal.hermes.feature.search" }
dependencies {
    implementation(project(":core:model")); implementation(project(":core:designsystem"))
    implementation(platform(libs.compose.bom)); implementation(libs.compose.material3); implementation(libs.compose.ui)
}
