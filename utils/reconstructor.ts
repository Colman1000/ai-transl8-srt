import type {Cue, ReconstructedSentence} from "../types/types.js";

// A sentence ends when the text finishes with one of these patterns
const SENTENCE_END = /[.!?…]["'»\s]?$/;

// Filler words that shouldn't trigger a sentence boundary even if preceded by a period
// e.g. "Rev.", "Dr.", "Mt.", "vs." — avoids premature splits
const ABBREV = /\b(Mr|Mrs|Ms|Dr|Prof|Rev|St|Mt|vs|etc|approx|Corp|Inc|Ltd)\.\s*$/i;

function isSentenceEnd(text: string): boolean {
    const trimmed = text.trimEnd();
    if (ABBREV.test(trimmed)) return false;
    return SENTENCE_END.test(trimmed);
}

export function reconstructSentences(cues: Cue[]): ReconstructedSentence[] {
    const sentences: ReconstructedSentence[] = [];
    let buffer: Cue[] = [];
    let sentenceId = 0;

    const flush = () => {
        if (!buffer.length) return;

        const fullText = buffer.map((c) => c.text).join(" ").replace(/\s+/g, " ").trim();
        const totalChars = buffer.reduce((sum, c) => sum + c.text.length, 0);

        const charRatios = buffer.map((c) =>
            totalChars > 0 ? c.text.length / totalChars : 1 / buffer.length
        );

        sentences.push({
            sentenceId: sentenceId++,
            text: fullText,
            cueIds: buffer.map((c) => c.id),
            charRatios,
        });

        buffer = [];
    };

    for (const cue of cues) {
        buffer.push(cue);

        if (isSentenceEnd(cue.text)) {
            flush();
        }
    }

    // Flush any trailing fragment (e.g. "Amen." without trailing newline)
    flush();

    return sentences;
}
