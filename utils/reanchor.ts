import type {Cue, ReconstructedSentence, TranslatedCue} from "../types/types.js";

/**
 * Splits a translated sentence across the original cues it came from,
 * using character ratios as a proportional guide.
 *
 * Strategy:
 *   1. Try to split on word boundaries near the ratio breakpoints.
 *   2. Fall back to hard char-count split if no word boundary found nearby.
 */
function splitByRatios(text: string, ratios: number[]): string[] {
    if (ratios.length === 1) return [text];

    const words = text.split(" ");
    const totalChars = text.length;
    const parts: string[] = [];

    let charTarget = 0;
    let wordOffset = 0;

    for (let i = 0; i < ratios.length - 1; i++) {
        charTarget += Math.round(ratios[i]! * totalChars);

        // Walk words until we've consumed ~charTarget characters
        let accumulated = wordOffset > 0 ? -1 : 0; // account for spaces
        let splitAt = wordOffset;

        for (let w = wordOffset; w < words.length; w++) {
            accumulated += (w > wordOffset ? 1 : 0) + words[w]!.length;
            splitAt = w + 1;
            if (accumulated >= charTarget - wordOffset) break;
        }

        const chunk = words.slice(wordOffset, splitAt).join(" ");
        parts.push(chunk.trim());
        wordOffset = splitAt;
    }

    // Last part gets remainder
    parts.push(words.slice(wordOffset).join(" ").trim());

    return parts;
}

/**
 * Wraps a translated string to respect the original line structure.
 * Tries to preserve the same number of lines; falls back to a single line.
 */
function wrapToLines(text: string, originalLines: string[]): string[] {
    if (originalLines.length === 1) return [text];

    const words = text.split(" ");
    const totalLines = originalLines.length;
    const wordsPerLine = Math.ceil(words.length / totalLines);
    const result: string[] = [];

    for (let i = 0; i < totalLines; i++) {
        const slice = words.slice(i * wordsPerLine, (i + 1) * wordsPerLine);
        if (slice.length) result.push(slice.join(" "));
    }

    return result.length ? result : [text];
}

export function reanchorCues(
    originalCues: Cue[],
    sentences: ReconstructedSentence[],
    translations: Record<number, string>
): TranslatedCue[] {
    // Index cues by id for O(1) lookup
    const cueMap = new Map<number, Cue>(originalCues.map((c) => [c.id, c]));

    // Index translated sentences by sentenceId
    const sentenceMap = new Map<number, ReconstructedSentence>(
        sentences.map((s) => [s.sentenceId, s])
    );

    // Build translated text for each cue id
    const translatedByCueId = new Map<number, string>();

    for (const sentence of sentences) {
        const translated = translations[sentence.sentenceId];
        if (!translated) continue;

        if (sentence.cueIds.length === 1) {
            translatedByCueId.set(sentence.cueIds.at(0)!, translated);
        } else {
            const parts = splitByRatios(translated, sentence.charRatios);
            sentence.cueIds.forEach((cueId, i) => {
                translatedByCueId.set(cueId, parts[i] ?? "");
            });
        }
    }

    // Assemble final translated cues — preserve ALL original cues, even untranslated ones
    return originalCues.map((cue): TranslatedCue => {
        const translatedText = translatedByCueId.get(cue.id) ?? cue.text;
        const translatedLines = wrapToLines(translatedText, cue.lines);

        return {
            ...cue,
            translatedText,
            translatedLines,
        };
    });
}
