plugins {
    id("hermes.android.library")
    alias(libs.plugins.kotlin.serialization)
}

android { namespace = "com.haridhayal.hermes.core.model" }

dependencies {
    api(libs.kotlinx.serialization.json)
    testImplementation(libs.junit)
}
