// ─── Cue (one subtitle entry) ─────────────────────────────────────────────────

export type SubtitleFormat = "srt" | "vtt";

export interface Cue {
    id: number;           // original sequence number
    startMs: number;      // start time in milliseconds
    endMs: number;        // end time in milliseconds
    text: string;         // raw display text (may be a sentence fragment)
    lines: string[];      // original line breaks preserved
}

// ─── Reconstructed sentence ────────────────────────────────────────────────────

export interface ReconstructedSentence {
    sentenceId: number;
    text: string;
    cueIds: number[];     // which original cues contributed to this sentence
    // ratio of each cue's chars in the merged text (for re-anchoring)
    charRatios: number[];
}

// ─── Translation job ───────────────────────────────────────────────────────────

export type SupportedLanguage =
    | "en" | "fr" | "pt" | "es" | "de" | "it"
    | "yo" | "ig" | "ha"                        // Yoruba, Igbo, Hausa
    | "ar" | "sw" | "zu" | "am"                 // Arabic, Swahili, Zulu, Amharic
    | (string & {});                             // escape hatch for unlisted BCP-47 tags

export interface TranslationMeta {
    /** Speaker / pastor name — will NOT be translated, kept as-is */
    speakerName?: string;
    /** Church or ministry name — will NOT be translated */
    churchName?: string;
    /** Recurring branded phrase, e.g. "The Grace Revolution" */
    seriesTitle?: string;
    /** Any extra glossary entries: source term → target term */
    glossary?: Record<string, string>;
}

export type ContentDomain = "sermon" | "general";

export interface TranslateOptions {
    /** Source language BCP-47 tag. Defaults to "en" */
    sourceLang?: SupportedLanguage;
    /** Target language BCP-47 tag — required */
    targetLang: SupportedLanguage;
    /** Domain unlocks pre-baked register + vocabulary. Defaults to "sermon" */
    domain?: ContentDomain;
    /** Proper nouns + glossary — replaces the primer call entirely */
    meta?: TranslationMeta;
    /** Sentences per batch (default 25). Tune down for long sermons on tight rate limits */
    batchSize?: number;
    /** Context overlap: N sentences from the prev batch prepended (default 4) */
    contextOverlap?: number;
    /**
     * Model for translation batches.
     * OpenAI users: defaults to "gpt-4o" for complex scripts, "gpt-4o-mini" otherwise.
     * Custom client users (DeepSeek, Groq, etc.): set this to your provider's model name,
     * e.g. "deepseek-chat". Auto-selection only works for OpenAI model names.
     */
    model?: "gpt-4o" | "gpt-4o-mini" | (string & {});
    /**
     * Fallback model used when auto-selection would normally pick gpt-4o-mini
     * but you're on a custom provider. Only needed if you want different models
     * for different language complexity tiers on a non-OpenAI backend.
     * Most custom client users should just set `model` and leave this unset.
     */
    modelFallback?: string;
    /** Max concurrent batch requests (default 8) */
    concurrency?: number;
    /** Enable AI primer call — for general/unknown content only */
    primer?: boolean;
}

// ─── Output ────────────────────────────────────────────────────────────────────

export interface TranslatedCue extends Cue {
    translatedText: string;
    translatedLines: string[];
}

export interface TranslationResult {
    sourceLang: string;
    targetLang: string;
    cues: TranslatedCue[];
    /** Render back to SRT string */
    toSRT(): string;
    /** Render back to VTT string */
    toVTT(): string;
    stats: TranslationStats;
}

export interface TranslationStats {
    totalCues: number;
    totalSentences: number;
    totalBatches: number;
    inputTokens: number;
    outputTokens: number;
    estimatedCostUsd: number;
    durationMs: number;
}

// ─── Internal batch types ──────────────────────────────────────────────────────

export interface BatchPayload {
    batchIndex: number;
    sentences: ReconstructedSentence[];
    contextSentences: ReconstructedSentence[]; // overlap — model reads but does not re-translate
}

export interface BatchResult {
    batchIndex: number;
    translations: Record<number, string>; // sentenceId → translated text
    inputTokens: number;
    outputTokens: number;
}

// ─── Errors ────────────────────────────────────────────────────────────────────

export class SubtitleTranslationError extends Error {
    constructor(
        message: string,
        public readonly code:
            | "PARSE_ERROR"
            | "EMPTY_FILE"
            | "API_ERROR"
            | "BATCH_FAILED"
            | "REANCHOR_ERROR",
        public override readonly cause?: unknown
    ) {
        super(message);
        this.name = "SubtitleTranslationError";
    }
}