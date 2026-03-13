import OpenAI from "openai";
import {
    SubtitleTranslationError,
} from "../types/types.js";
import type {
    BatchPayload,
    BatchResult,
    ReconstructedSentence,
    TranslateOptions,
} from "../types/types.js";
import {buildSystemPrompt, buildUserMessage, pickModel} from "./prompts.js";

// ─── Concurrency limiter (no external deps) ────────────────────────────────────

async function pLimit<T>(
    tasks: Array<() => Promise<T>>,
    concurrency: number
): Promise<T[]> {
    const results: T[] = new Array(tasks.length);
    let index = 0;

    const worker = async () => {
        while (index < tasks.length) {
            const i = index++;
            results[i] = await tasks[i]!();
        }
    };

    await Promise.all(Array.from({length: concurrency}, worker));
    return results;
}

// ─── Parse model JSON response ────────────────────────────────────────────────

function parseTranslations(raw: string): Record<number, string> {
    let text = raw.trim();
    // Strip accidental code fences
    text = text.replace(/^```(?:json)?\n?/i, "").replace(/\n?```$/i, "");

    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch {
        throw new SubtitleTranslationError(
            `Model returned invalid JSON: ${text.slice(0, 200)}`,
            "BATCH_FAILED"
        );
    }

    if (!Array.isArray(parsed)) {
        throw new SubtitleTranslationError(
            "Model response was not a JSON array",
            "BATCH_FAILED"
        );
    }

    const map: Record<number, string> = {};
    for (const item of parsed) {
        if (
            typeof item === "object" &&
            item !== null &&
            typeof (item as any).id === "number" &&
            typeof (item as any).t === "string"
        ) {
            map[(item as any).id] = (item as any).t;
        }
    }
    return map;
}

// ─── Single batch call ────────────────────────────────────────────────────────

async function executeBatch(
    client: OpenAI,
    payload: BatchPayload,
    systemPrompt: string,
    model: string,
    retries = 2
): Promise<BatchResult> {
    const userMessage = buildUserMessage(
        payload.sentences,
        payload.contextSentences
    );

    let lastError: unknown;

    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            const response = await client.chat.completions.create({
                model,
                temperature: 0.1,   // low temp = deterministic, less hallucination
                messages: [
                    {role: "system", content: systemPrompt},
                    {role: "user", content: userMessage},
                ],
            });

            const content = response.choices[0]?.message?.content ?? "";
            const translations = parseTranslations(content);

            return {
                batchIndex: payload.batchIndex,
                translations,
                inputTokens: response.usage?.prompt_tokens ?? 0,
                outputTokens: response.usage?.completion_tokens ?? 0,
            };
        } catch (err) {
            lastError = err;
            if (attempt < retries) {
                // Exponential backoff: 500ms, 1000ms
                await new Promise((r) => setTimeout(r, 500 * Math.pow(2, attempt)));
            }
        }
    }

    throw new SubtitleTranslationError(
        `Batch ${payload.batchIndex} failed after ${retries + 1} attempts`,
        "BATCH_FAILED",
        lastError
    );
}

// ─── Build batch payloads ─────────────────────────────────────────────────────

function buildBatches(
    sentences: ReconstructedSentence[],
    batchSize: number,
    overlap: number
): BatchPayload[] {
    const payloads: BatchPayload[] = [];

    for (let i = 0; i < sentences.length; i += batchSize) {
        const chunk = sentences.slice(i, i + batchSize);
        const context = i > 0 ? sentences.slice(Math.max(0, i - overlap), i) : [];

        payloads.push({
            batchIndex: payloads.length,
            sentences: chunk,
            contextSentences: context,
        });
    }

    return payloads;
}

// ─── Public executor ──────────────────────────────────────────────────────────

export interface ExecuteResult {
    translations: Record<number, string>;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalBatches: number;
}

export async function executeTranslation(
    client: OpenAI,
    sentences: ReconstructedSentence[],
    opts: TranslateOptions
): Promise<ExecuteResult> {
    const batchSize = opts.batchSize ?? 25;
    const overlap = opts.contextOverlap ?? 4;
    const concurrency = opts.concurrency ?? 8;
    const model = pickModel(opts);
    const systemPrompt = buildSystemPrompt(opts);

    const payloads = buildBatches(sentences, batchSize, overlap);

    const tasks = payloads.map(
        (payload) => () => executeBatch(client, payload, systemPrompt, model)
    );

    const results = await pLimit(tasks, concurrency);

    const merged: Record<number, string> = {};
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    for (const result of results) {
        Object.assign(merged, result.translations);
        totalInputTokens += result.inputTokens;
        totalOutputTokens += result.outputTokens;
    }

    return {
        translations: merged,
        totalInputTokens,
        totalOutputTokens,
        totalBatches: payloads.length,
    };
}