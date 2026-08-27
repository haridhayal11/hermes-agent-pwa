plugins {
    id("hermes.android.library")
    alias(libs.plugins.ksp)
}

android { namespace = "com.haridhayal.hermes.core.database" }

dependencies {
    api(project(":core:model"))
    api(libs.androidx.room.runtime)
    implementation(libs.androidx.room.ktx)
    ksp(libs.androidx.room.compiler)
    testImplementation(libs.junit)
}

ksp { arg("room.schemaLocation", "$projectDir/schemas") }
