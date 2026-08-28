plugins { id("hermes.android.library"); id("hermes.android.compose") }
android { namespace = "com.haridhayal.hermes.feature.chat" }
dependencies {
    implementation(project(":core:model")); implementation(project(":core:data")); implementation(project(":core:designsystem")); implementation(libs.androidx.activity.compose); implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(platform(libs.compose.bom)); implementation(libs.compose.material3); implementation(libs.compose.ui); implementation(libs.compose.foundation); implementation(libs.compose.material.icons)
    testImplementation(libs.junit)
}
