plugins {
    `kotlin-dsl`
}

group = "com.haridhayal.hermes.buildlogic"

dependencies {
    implementation("com.android.tools.build:gradle:9.2.1")
    implementation("org.jetbrains.kotlin:kotlin-gradle-plugin:2.3.10")
}

gradlePlugin {
    plugins {
        register("androidApplication") {
            id = "hermes.android.application"
            implementationClass = "AndroidApplicationConventionPlugin"
        }
        register("androidLibrary") {
            id = "hermes.android.library"
            implementationClass = "AndroidLibraryConventionPlugin"
        }
        register("androidCompose") {
            id = "hermes.android.compose"
            implementationClass = "AndroidComposeConventionPlugin"
        }
    }
}
