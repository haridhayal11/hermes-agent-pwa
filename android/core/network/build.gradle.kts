plugins {
    id("hermes.android.library")
    alias(libs.plugins.kotlin.serialization)
}

android { namespace = "com.haridhayal.hermes.core.network" }

dependencies {
    api(project(":core:model"))
    implementation(libs.okhttp)
    implementation(libs.okhttp.sse)
    implementation(libs.retrofit)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.kotlinx.coroutines.android)
    testImplementation(libs.junit)
    testImplementation(libs.okhttp.mockwebserver)
    testImplementation(libs.kotlinx.coroutines.test)
}
