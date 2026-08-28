package com.haridhayal.hermes.feature.chat

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class DecisionCardsTest {
    @Test
    fun recommendationParserHonoursDeclaredKindAndLimitsActions() {
        val card = parseRecommendation(
            """{"kind":"recommendation","title":"Use the safe path","rationale":"It keeps the change reversible.","confidence":1.4,"actions":[{"label":"First","reply":"one"},{"label":"Second"},{"label":"Third"},{"label":"Fourth"},{"label":"Ignored"}]}""",
        )

        requireNotNull(card)
        assertEquals(RecommendationKind.Recommendation, card.kind)
        assertEquals("Use the safe path", card.title)
        assertEquals("It keeps the change reversible.", card.rationale)
        assertEquals(1.4, card.confidence ?: error("confidence missing"), 0.0)
        assertEquals(listOf("First", "Second", "Third", "Fourth"), card.actions.map { it.label })
        assertEquals("Second", card.actions[1].reply)
    }

    @Test
    fun missingKindInfersAQuestionWithoutConfidence() {
        val question = parseRecommendation(
            """{"title":"Which environment?","actions":[{"label":"Staging","reply":"staging"}]}""",
        )

        assertEquals(RecommendationKind.Question, question?.kind)
        assertEquals("staging", question?.actions?.single()?.reply)
    }

    @Test
    fun malformedRecommendationsFallBackToCodeAndCannotBePinned() {
        val malformed = """
            ```hazel-recommend
            {"title":"Missing brace"
            ```
        """.trimIndent()

        assertNull(parseRecommendation("{not json}"))
        assertNull(extractQuestion(malformed))
        assertTrue(messageBlocks(malformed).single().code)
    }

    @Test
    fun finalActionableQuestionWinsWhenAReplyContainsMoreThanOne() {
        val reply = """
            First choice:
            ```hazel-recommend
            {"kind":"question","title":"First","actions":[{"label":"A","reply":"a"}]}
            ```
            And then:
            ```hazel-recommend
            {"kind":"question","title":"Second","actions":[{"label":"B","reply":"b"}]}
            ```
        """.trimIndent()

        val question = extractQuestion(reply)
        assertEquals("Second", question?.title)
        assertEquals("b", question?.actions?.single()?.reply)
    }

    @Test
    fun hermesRecommendIsTheCurrentPwaFence() {
        val question = extractQuestion(
            """
                ```hermes-recommend
                {"kind":"question","title":"Current PWA convention","actions":[{"label":"Continue","reply":"continue"}]}
                ```
            """.trimIndent(),
        )

        assertEquals("Current PWA convention", question?.title)
    }
}
