package com.haridhayal.hermes.feature.chat

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.LinkAnnotation
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import java.net.URI
import org.commonmark.node.BlockQuote
import org.commonmark.node.BulletList
import org.commonmark.node.Code
import org.commonmark.node.Document
import org.commonmark.node.Emphasis
import org.commonmark.node.FencedCodeBlock
import org.commonmark.node.HardLineBreak
import org.commonmark.node.Heading
import org.commonmark.node.HtmlBlock
import org.commonmark.node.HtmlInline
import org.commonmark.node.Image
import org.commonmark.node.IndentedCodeBlock
import org.commonmark.node.Link
import org.commonmark.node.ListItem
import org.commonmark.node.Node
import org.commonmark.node.OrderedList
import org.commonmark.node.Paragraph
import org.commonmark.node.SoftLineBreak
import org.commonmark.node.StrongEmphasis
import org.commonmark.node.Text as MarkdownText
import org.commonmark.node.ThematicBreak
import org.commonmark.parser.Parser

internal enum class MarkdownBlockKind {
    Paragraph,
    Heading,
    Code,
    ThematicBreak,
}

internal enum class MarkdownSpanKind {
    Strong,
    Emphasis,
    InlineCode,
    Link,
}

internal data class MarkdownSpan(
    val kind: MarkdownSpanKind,
    val start: Int,
    val end: Int,
    val destination: String? = null,
)

internal data class MarkdownRenderBlock(
    val kind: MarkdownBlockKind,
    val text: String = "",
    val spans: List<MarkdownSpan> = emptyList(),
    val headingLevel: Int = 0,
    val listDepth: Int = 0,
    val marker: String? = null,
    val quoteDepth: Int = 0,
)

internal data class MarkdownDocument(val blocks: List<MarkdownRenderBlock>)

private val parser: Parser = Parser.builder().build()

internal fun safeMarkdownDestination(raw: String?): String? {
    val destination = raw?.trim()?.takeIf(String::isNotEmpty) ?: return null
    return runCatching { URI(destination) }
        .getOrNull()
        ?.takeIf { it.scheme?.lowercase() in setOf("http", "https") }
        ?.let { destination }
}

internal fun parseMarkdown(content: String): MarkdownDocument =
    MarkdownProjector().project(parser.parse(content))

private data class BlockContext(
    val listDepth: Int = 0,
    val marker: String? = null,
    val quoteDepth: Int = 0,
)

private class MarkdownProjector {
    private val blocks = mutableListOf<MarkdownRenderBlock>()

    fun project(document: Node): MarkdownDocument {
        emit(document, BlockContext())
        return MarkdownDocument(blocks.toList())
    }

    private fun emit(node: Node, context: BlockContext) {
        when (node) {
            is Document -> emitChildren(node, context)
            is Paragraph -> emitInline(node, MarkdownBlockKind.Paragraph, context)
            is Heading -> emitInline(
                node,
                MarkdownBlockKind.Heading,
                context,
                headingLevel = node.level,
            )
            is BlockQuote -> emitChildren(
                node,
                context.copy(quoteDepth = context.quoteDepth + 1),
            )
            is BulletList -> emitList(node, context)
            is OrderedList -> emitList(node, context)
            is FencedCodeBlock -> emitCode(node.literal, context)
            is IndentedCodeBlock -> emitCode(node.literal, context)
            is HtmlBlock -> emitLiteral(node.literal, context)
            is ThematicBreak -> blocks += MarkdownRenderBlock(
                kind = MarkdownBlockKind.ThematicBreak,
                listDepth = context.listDepth,
                marker = context.marker,
                quoteDepth = context.quoteDepth,
            )
            else -> emitChildren(node, context)
        }
    }

    private fun emitChildren(parent: Node, context: BlockContext) {
        var pendingMarker = context.marker
        var child = parent.firstChild
        while (child != null) {
            val before = blocks.size
            emit(child, context.copy(marker = pendingMarker))
            if (blocks.size > before) pendingMarker = null
            child = child.next
        }
    }

    private fun emitList(list: Node, context: BlockContext) {
        val ordered = list as? OrderedList
        val start = ordered?.markerStartNumber ?: 1
        val delimiter = ordered?.markerDelimiter?.takeIf(String::isNotEmpty) ?: "."
        var position = 0
        var child = list.firstChild
        while (child != null) {
            if (child is ListItem) {
                val marker = if (ordered == null) "•" else "${start + position}$delimiter"
                emitChildren(
                    child,
                    context.copy(
                        listDepth = context.listDepth + 1,
                        marker = marker,
                    ),
                )
                position += 1
            }
            child = child.next
        }
    }

    private fun emitInline(
        node: Node,
        kind: MarkdownBlockKind,
        context: BlockContext,
        headingLevel: Int = 0,
    ) {
        val inline = InlineProjector().project(node)
        blocks += MarkdownRenderBlock(
            kind = kind,
            text = inline.first,
            spans = inline.second,
            headingLevel = headingLevel,
            listDepth = context.listDepth,
            marker = context.marker,
            quoteDepth = context.quoteDepth,
        )
    }

    private fun emitCode(text: String, context: BlockContext) {
        blocks += MarkdownRenderBlock(
            kind = MarkdownBlockKind.Code,
            text = text.trimEnd('\r', '\n'),
            listDepth = context.listDepth,
            marker = context.marker,
            quoteDepth = context.quoteDepth,
        )
    }

    private fun emitLiteral(text: String, context: BlockContext) {
        blocks += MarkdownRenderBlock(
            kind = MarkdownBlockKind.Paragraph,
            text = text.trimEnd('\r', '\n'),
            listDepth = context.listDepth,
            marker = context.marker,
            quoteDepth = context.quoteDepth,
        )
    }
}

private class InlineProjector {
    private val text = StringBuilder()
    private val spans = mutableListOf<MarkdownSpan>()

    fun project(parent: Node): Pair<String, List<MarkdownSpan>> {
        appendChildren(parent)
        return text.toString() to spans.toList()
    }

    private fun appendChildren(parent: Node) {
        var child = parent.firstChild
        while (child != null) {
            append(child)
            child = child.next
        }
    }

    private fun append(node: Node) {
        when (node) {
            is MarkdownText -> text.append(node.literal)
            is SoftLineBreak, is HardLineBreak -> text.append('\n')
            is Code -> styled(MarkdownSpanKind.InlineCode, node) {
                text.append(node.literal)
            }
            is StrongEmphasis -> styled(MarkdownSpanKind.Strong, node)
            is Emphasis -> styled(MarkdownSpanKind.Emphasis, node)
            is Link -> styled(
                MarkdownSpanKind.Link,
                node,
                safeMarkdownDestination(node.destination),
            )
            is Image -> {
                val start = text.length
                appendChildren(node)
                if (text.length == start) text.append(node.destination)
                safeMarkdownDestination(node.destination)?.let { destination ->
                    spans += MarkdownSpan(
                        kind = MarkdownSpanKind.Link,
                        start = start,
                        end = text.length,
                        destination = destination,
                    )
                }
            }
            is HtmlInline -> text.append(node.literal)
            else -> appendChildren(node)
        }
    }

    private fun styled(
        kind: MarkdownSpanKind,
        node: Node,
        destination: String? = null,
        content: (() -> Unit)? = null,
    ) {
        val start = text.length
        if (content == null) appendChildren(node) else content()
        if (text.length > start && (kind != MarkdownSpanKind.Link || destination != null)) {
            spans += MarkdownSpan(kind, start, text.length, destination)
        }
    }
}

@Composable
internal fun MarkdownContent(
    content: String,
    ink: Color,
    muted: Color,
    surface: Color,
    line: Color,
    link: Color,
) {
    val document = remember(content) { parseMarkdown(content) }
    Column(verticalArrangement = androidx.compose.foundation.layout.Arrangement.spacedBy(8.dp)) {
        document.blocks.forEach { block ->
            MarkdownBlockLayout(block, line) {
                when (block.kind) {
                    MarkdownBlockKind.Paragraph -> MarkdownTextBlock(block, ink, surface, link)
                    MarkdownBlockKind.Heading -> MarkdownTextBlock(
                        block = block,
                        ink = ink,
                        surface = surface,
                        link = link,
                        heading = true,
                    )
                    MarkdownBlockKind.Code -> Surface(
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(12.dp),
                        color = surface,
                    ) {
                        Text(
                            text = block.text,
                            modifier = Modifier
                                .horizontalScroll(rememberScrollState())
                                .padding(12.dp),
                            color = ink,
                            fontFamily = FontFamily.Monospace,
                            fontSize = 13.sp,
                            lineHeight = 19.sp,
                        )
                    }
                    MarkdownBlockKind.ThematicBreak -> HorizontalDivider(
                        modifier = Modifier.padding(vertical = 4.dp),
                        color = muted.copy(alpha = 0.45f),
                    )
                }
            }
        }
    }
}

@Composable
private fun MarkdownTextBlock(
    block: MarkdownRenderBlock,
    ink: Color,
    surface: Color,
    link: Color,
    heading: Boolean = false,
) {
    val annotated = remember(block, surface, link) {
        buildAnnotatedString {
            append(block.text)
            block.spans.forEach { span ->
                val style = when (span.kind) {
                    MarkdownSpanKind.Strong -> SpanStyle(fontWeight = FontWeight.Bold)
                    MarkdownSpanKind.Emphasis -> SpanStyle(fontStyle = FontStyle.Italic)
                    MarkdownSpanKind.InlineCode -> SpanStyle(
                        fontFamily = FontFamily.Monospace,
                        background = surface,
                    )
                    MarkdownSpanKind.Link -> SpanStyle(
                        color = link,
                        textDecoration = TextDecoration.Underline,
                    )
                }
                addStyle(style, span.start, span.end)
                if (span.kind == MarkdownSpanKind.Link && span.destination != null) {
                    addLink(LinkAnnotation.Url(span.destination), span.start, span.end)
                }
            }
        }
    }
    val style = if (heading) {
        when (block.headingLevel) {
            1 -> MaterialTheme.typography.headlineSmall
            2 -> MaterialTheme.typography.titleLarge
            else -> MaterialTheme.typography.titleMedium
        }.copy(fontWeight = FontWeight.SemiBold)
    } else {
        MaterialTheme.typography.bodyLarge.copy(fontSize = 15.sp, lineHeight = 23.sp)
    }
    Text(text = annotated, color = ink, style = style)
}

@Composable
private fun MarkdownBlockLayout(
    block: MarkdownRenderBlock,
    line: Color,
    content: @Composable () -> Unit,
) {
    val nestedListPadding = ((block.listDepth - 1).coerceAtLeast(0) * 16).dp
    val nestedQuotePadding = ((block.quoteDepth - 1).coerceAtLeast(0) * 12).dp
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(start = nestedListPadding + nestedQuotePadding)
            .height(IntrinsicSize.Min),
    ) {
        if (block.quoteDepth > 0) {
            Box(
                Modifier
                    .fillMaxHeight()
                    .width(2.dp)
                    .background(line),
            )
            Spacer(Modifier.width(10.dp))
        }
        if (block.listDepth > 0) {
            Text(
                text = block.marker.orEmpty(),
                modifier = Modifier.width(30.dp),
                color = line,
                style = MaterialTheme.typography.bodyLarge,
            )
        }
        Box(Modifier.weight(1f)) { content() }
    }
}
