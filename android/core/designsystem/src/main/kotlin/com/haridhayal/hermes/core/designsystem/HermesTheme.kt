package com.haridhayal.hermes.core.designsystem

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import com.haridhayal.hermes.core.model.ThemePreference

private val HermesDarkColors = darkColorScheme(
    primary = Color(0xFFD9E8FF),
    onPrimary = Color(0xFF112235),
    primaryContainer = Color(0xFF313A43),
    onPrimaryContainer = Color(0xFFF0F4FA),
    secondary = Color(0xFFC2CEDB),
    onSecondary = Color(0xFF26313B),
    secondaryContainer = Color(0xFF2B343C),
    onSecondaryContainer = Color(0xFFDCE5EE),
    tertiary = Color(0xFFA8D6B9),
    onTertiary = Color(0xFF173726),
    background = Color(0xFF191E22),
    onBackground = Color(0xFFE1E6ED),
    surface = Color(0xFF191E22),
    onSurface = Color(0xFFE1E6ED),
    surfaceVariant = Color(0xFF252C32),
    onSurfaceVariant = Color(0xFF9DA5AF),
    surfaceContainerLowest = Color(0xFF15191D),
    surfaceContainerLow = Color(0xFF1E2429),
    surfaceContainer = Color(0xFF242B31),
    surfaceContainerHigh = Color(0xFF293137),
    surfaceContainerHighest = Color(0xFF303940),
    outline = Color(0xFF69727C),
    outlineVariant = Color(0xFF343C43),
    error = Color(0xFFFFB4AB),
    errorContainer = Color(0xFF5B2023),
    onErrorContainer = Color(0xFFFFDAD6),
)

private val HermesLightColors = lightColorScheme(
    primary = Color(0xFF334B65),
    onPrimary = Color.White,
    primaryContainer = Color(0xFFE5EBF1),
    onPrimaryContainer = Color(0xFF182B3E),
    secondary = Color(0xFF566574),
    onSecondary = Color.White,
    secondaryContainer = Color(0xFFE4EAF0),
    onSecondaryContainer = Color(0xFF26333F),
    tertiary = Color(0xFF37664A),
    onTertiary = Color.White,
    background = Color(0xFFF5F6F8),
    onBackground = Color(0xFF1B1F23),
    surface = Color(0xFFF5F6F8),
    onSurface = Color(0xFF1B1F23),
    surfaceVariant = Color(0xFFE9EDF1),
    onSurfaceVariant = Color(0xFF68717A),
    surfaceContainerLowest = Color.White,
    surfaceContainerLow = Color(0xFFF0F2F5),
    surfaceContainer = Color(0xFFE9EDF1),
    surfaceContainerHigh = Color(0xFFE2E7EC),
    surfaceContainerHighest = Color(0xFFD9E0E6),
    outline = Color(0xFF737C85),
    outlineVariant = Color(0xFFD4DAE0),
    error = Color(0xFFBA1A1A),
    errorContainer = Color(0xFFFFDAD6),
    onErrorContainer = Color(0xFF410002),
)

private val HermesShapes = Shapes(
    extraSmall = androidx.compose.foundation.shape.RoundedCornerShape(8.dp),
    small = androidx.compose.foundation.shape.RoundedCornerShape(12.dp),
    medium = androidx.compose.foundation.shape.RoundedCornerShape(18.dp),
    large = androidx.compose.foundation.shape.RoundedCornerShape(24.dp),
    extraLarge = androidx.compose.foundation.shape.RoundedCornerShape(28.dp),
)

@Composable
fun HermesTheme(
    preference: ThemePreference = ThemePreference.System,
    textScale: Float = 1f,
    content: @Composable () -> Unit,
) {
    val dark = when (preference) {
        ThemePreference.System -> isSystemInDarkTheme()
        ThemePreference.Light -> false
        ThemePreference.Dark -> true
    }
    val colorScheme = if (dark) HermesDarkColors else HermesLightColors
    val density = LocalDensity.current
    CompositionLocalProvider(
        LocalDensity provides Density(density.density, density.fontScale * textScale.coerceIn(.92f, 1.14f)),
    ) {
        MaterialTheme(
            colorScheme = colorScheme,
            shapes = HermesShapes,
            content = content,
        )
    }
}
