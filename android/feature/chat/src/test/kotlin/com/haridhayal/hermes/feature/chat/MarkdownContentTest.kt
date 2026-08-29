package com.haridhayal.hermes.feature.chat

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class MarkdownContentTest {
    @Test
    fun scheduledReportMarkersBecomeSemanticSpans() {
        val source = """
            **Weekly weigh-in time!** ⚖️

            Please reply with:

            - **Current weight:** `__ kg`
            - **Body fat:** `__%` *(if available)*
        """.trimIndent()

        val document = parseMarkdown(source)
        val visible = document.blocks.joinToString("\n") { it.text }

        assertTrue(visible.contains("Weekly weigh-in time! ⚖️"))
        assertTrue(visible.contains("Current weight: __ kg"))
        assertFalse(visible.contains("**"))
        assertFalse(visible.contains('`'))
        assertEquals(listOf("•", "•"), document.blocks.mapNotNull { it.marker })
        assertTrue(document.blocks.flatMap { it.spans }.any { it.kind == MarkdownSpanKind.Strong })
        assertTrue(document.blocks.flatMap { it.spans }.any { it.kind == MarkdownSpanKind.InlineCode })
        assertTrue(document.blocks.flatMap { it.spans }.any { it.kind == MarkdownSpanKind.Emphasis })
    }

    @Test
    fun plainTextAndSoftLineBreaksRemainPlain() {
        val source = "Plain line one\nPlain line two\n2 * 3 = 6\n/path_with_value"

        val document = parseMarkdown(source)

        assertEquals(1, document.blocks.size)
        assertEquals(source, document.blocks.single().text)
        assertTrue(document.blocks.single().spans.isEmpty())
    }

    @Test
    fun headingsQuotesNestedStylesListsAndLinksAreProjected() {
        val source = """
            ## Summary

            > **Important and *specific***

            3. Visit [Hermes](https://example.com/docs)
            4. Read `details`
        """.trimIndent()

        val document = parseMarkdown(source)

        assertEquals(MarkdownBlockKind.Heading, document.blocks.first().kind)
        assertEquals(2, document.blocks.first().headingLevel)
        assertEquals(1, document.blocks.first { it.text.startsWith("Important") }.quoteDepth)
        assertEquals(listOf("3.", "4."), document.blocks.mapNotNull { it.marker })
        val spans = document.blocks.flatMap { it.spans }
        assertTrue(spans.any { it.kind == MarkdownSpanKind.Strong })
        assertTrue(spans.any { it.kind == MarkdownSpanKind.Emphasis })
        assertTrue(spans.any { it.kind == MarkdownSpanKind.InlineCode })
        assertTrue(
            spans.any {
                it.kind == MarkdownSpanKind.Link && it.destination == "https://example.com/docs"
            },
        )
    }

    @Test
    fun htmlStaysLiteralAndUnsafeLinksNeverBecomeAnnotations() {
        val source = """
            <script>alert('x')</script>

            [unsafe](javascript:alert)

            ![safe image label](https://example.com/image.png)
        """.trimIndent()

        val document = parseMarkdown(source)
        val visible = document.blocks.joinToString("\n") { it.text }
        val links = document.blocks.flatMap { it.spans }.filter { it.kind == MarkdownSpanKind.Link }

        assertTrue(visible.contains("<script>alert('x')</script>"))
        assertTrue(visible.contains("unsafe"))
        assertEquals(listOf("https://example.com/image.png"), links.map { it.destination })
        assertNull(safeMarkdownDestination("javascript:alert(1)"))
        assertNull(safeMarkdownDestination("file:///data/local/private"))
    }

    @Test
    fun incompleteMarkdownRemainsReadableDuringStreaming() {
        val source = "Still writing **an answer"

        val block = parseMarkdown(source).blocks.single()

        assertEquals(source, block.text)
        assertTrue(block.spans.isEmpty())
    }
}
