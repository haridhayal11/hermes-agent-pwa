pluginManagement {
    includeBuild("build-logic")
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "HermesAndroid"

include(":app")
include(":core:model")
include(":core:network")
include(":core:database")
include(":core:data")
include(":core:designsystem")
include(":core:testing")
include(":feature:pairing")
include(":feature:projects")
include(":feature:chat")
include(":feature:search")
include(":feature:jobs")
include(":feature:settings")
