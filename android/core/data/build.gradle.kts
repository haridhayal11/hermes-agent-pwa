plugins {
    id("hermes.android.library")
    alias(libs.plugins.ksp)
    alias(libs.plugins.hilt)
}

android { namespace = "com.haridhayal.hermes.core.data" }

dependencies {
    api(project(":core:model"))
    implementation(project(":core:network"))
    implementation(project(":core:database"))
    implementation(libs.androidx.datastore)
    implementation(libs.androidx.work.runtime)
    implementation(libs.hilt.android)
    implementation(libs.androidx.hilt.work)
    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.okhttp)
    ksp(libs.hilt.compiler)
    ksp(libs.androidx.hilt.compiler)
    testImplementation(libs.junit)
    testImplementation(libs.kotlinx.coroutines.test)
}
