import OpenAI from "openai";
import {parseCues, detectFormat} from "./utils/parser.js";
import {reconstructSentences} from "./utils/reconstructor.js";
import {executeTranslation} from "./utils/executor.js";
import {reanchorCues} from "./utils/reanchor.js";
import {emitSRT, emitVTT} from "./utils/emitter.js";
import type {
    TranslateOptions,
    TranslationResult,
} from "./types/types.js";

export * from "./types/types.js";

// ─── Cost model (as of June 2025) ─────────────────────────────────────────────

const COST_PER_M_TOKENS = {
    "gpt-4o": {input: 2.50, output: 10.00},
    "gpt-4o-mini": {input: 0.15, output: 0.60},
} as const;

function estimateCost(
    model: "gpt-4o" | "gpt-4o-mini",
    inputTokens: number,
    outputTokens: number
): number {
    const rates = COST_PER_M_TOKENS[model];
    return (
        (inputTokens / 1_000_000) * rates.input +
        (outputTokens / 1_000_000) * rates.output
    );
}

// ─── Core translate function ──────────────────────────────────────────────────

export async function translate(
    /** Raw SRT or VTT file content */
    fileContent: string,
    opts: TranslateOptions,
    /** Pass your own OpenAI client (allows custom baseURL, auth, etc.) */
    client?: OpenAI
): Promise<TranslationResult> {
    const startTime = Date.now();

    const oi = client ?? new OpenAI();          // uses OPENAI_API_KEY from env
    const format = detectFormat(fileContent);

    // 1. Parse
    const cues = parseCues(fileContent, format);

    // 2. Reconstruct sentences from fragmented cues
    const sentences = reconstructSentences(cues);

    // 3. Translate (batched, concurrent, sliding window)
    const {translations, totalInputTokens, totalOutputTokens, totalBatches} =
        await executeTranslation(oi, sentences, opts);

    // 4. Re-anchor back to original timestamps
    const translatedCues = reanchorCues(cues, sentences, translations);

    // 5. Assemble result
    const model = opts.model ??
        (["yo", "ig", "ha", "sw", "zu", "ar", "am"].includes(opts.targetLang)
            ? "gpt-4o"
            : "gpt-4o-mini");

    const stats = {
        totalCues: cues.length,
        totalSentences: sentences.length,
        totalBatches,
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        estimatedCostUsd: estimateCost(model, totalInputTokens, totalOutputTokens),
        durationMs: Date.now() - startTime,
    };

    return {
        sourceLang: opts.sourceLang ?? "en",
        targetLang: opts.targetLang,
        cues: translatedCues,
        stats,
        toSRT: () => emitSRT(translatedCues),
        toVTT: () => emitVTT(translatedCues),
    };
}

// ─── Convenience: translate from file path (Node.js) ─────────────────────────

import {readFile, writeFile} from "fs/promises";
import {extname} from "path";

export async function translateFile(
    inputPath: string,
    outputPath: string,
    opts: TranslateOptions,
    client?: OpenAI
): Promise<TranslationResult> {
    const content = await readFile(inputPath, "utf-8");
    const result = await translate(content, opts, client);

    const ext = extname(outputPath).toLowerCase();
    const output = ext === ".vtt" ? result.toVTT() : result.toSRT();
    await writeFile(outputPath, output, "utf-8");

    return result;
}
