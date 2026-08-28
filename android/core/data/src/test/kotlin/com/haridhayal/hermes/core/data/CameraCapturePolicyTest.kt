package com.haridhayal.hermes.core.data

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class CameraCapturePolicyTest {
    @Test
    fun onlyTheAppsCameraCaptureRootIsOwned() {
        assertTrue(
            isOwnedCameraCaptureLocation(
                packageName = "com.haridhayal.hermes",
                scheme = "content",
                authority = "com.haridhayal.hermes.fileprovider",
                root = "camera-captures",
            ),
        )

        assertFalse(
            isOwnedCameraCaptureLocation(
                packageName = "com.haridhayal.hermes",
                scheme = "content",
                authority = "com.google.android.apps.photos.content",
                root = "camera-captures",
            ),
        )
        assertFalse(
            isOwnedCameraCaptureLocation(
                packageName = "com.haridhayal.hermes",
                scheme = "content",
                authority = "com.haridhayal.hermes.fileprovider",
                root = "shared-documents",
            ),
        )
        assertFalse(
            isOwnedCameraCaptureLocation(
                packageName = "com.haridhayal.hermes",
                scheme = "file",
                authority = "com.haridhayal.hermes.fileprovider",
                root = "camera-captures",
            ),
        )
    }
}
