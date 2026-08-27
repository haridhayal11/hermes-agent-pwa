plugins { id("hermes.android.library") }

android { namespace = "com.haridhayal.hermes.core.testing" }

dependencies {
    api(libs.junit)
    api(libs.okhttp.mockwebserver)
    api(libs.kotlinx.coroutines.test)
}
