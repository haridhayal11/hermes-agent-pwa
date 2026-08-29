plugins { id("hermes.android.library"); id("hermes.android.compose") }
android { namespace = "com.haridhayal.hermes.feature.chat" }
dependencies {
    implementation(project(":core:model")); implementation(project(":core:data")); implementation(project(":core:designsystem")); implementation(libs.androidx.core.ktx); implementation(libs.androidx.activity.compose); implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(platform(libs.compose.bom)); implementation(libs.compose.material3); implementation(libs.compose.ui); implementation(libs.compose.foundation); implementation(libs.compose.material.icons); implementation(libs.commonmark)
    testImplementation(libs.junit)
    androidTestImplementation(platform(libs.compose.bom)); androidTestImplementation(libs.compose.ui.test); androidTestImplementation(libs.androidx.junit); androidTestImplementation(libs.androidx.espresso)
    debugImplementation(libs.compose.ui.test.manifest)
}
