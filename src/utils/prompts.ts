import type { ContentDomain, TranslationMeta, TranslateOptions } from "../types/types.js";

const DOMAIN_INSTRUCTIONS: Record<ContentDomain, string> = {
  sermon: `Domain: Christian sermon / religious teaching.
Register: reverent, formal — never use casual or colloquial substitutes for sacred terms.
Preserve exactly: scripture references (e.g. "John 3:16"), "Amen", "Hallelujah", "the Holy Spirit", "grace", "salvation".
Fragmented exclamations ("Praise God!", "Glory!") are intentional — keep them as fragments.
Do not explain metaphors or idioms — translate them faithfully.`,

  general: `Domain: general video content.
Preserve the speaker's natural register and sentence rhythm.
Do not add formality that isn't in the source.`,
};

// Languages that use non-Latin scripts or have lower model coverage
const NEEDS_FULL_MODEL = new Set([
  "ar", "am", "zh", "ja", "ko", "hi", "ru", "uk", "el",
  "yo", "ig", "ha", "sw", "zu",
]);

/**
 * Resolves which model string to send to the API.
 *
 * Priority order:
 *  1. opts.model            — always wins when set. Custom client users (DeepSeek,
 *                             Groq, Mistral, etc.) should always set this explicitly,
 *                             e.g. model: "deepseek-chat"
 *  2. Language-based auto   — gpt-4o for complex/non-Latin scripts, gpt-4o-mini otherwise.
 *                             opts.modelFallback replaces "gpt-4o-mini" in this path,
 *                             useful when your provider has a single model name.
 */
export function pickModel(opts: TranslateOptions): string {
  if (opts.model) return opts.model;
  const needsFull = NEEDS_FULL_MODEL.has(opts.targetLang);
  if (needsFull) return "gpt-4o";
  return opts.modelFallback ?? "gpt-4o-mini";
}

function buildGlossaryBlock(meta: TranslationMeta): string {
  const lines: string[] = [];

  if (meta.speakerName) {
    lines.push(`Speaker name: "${meta.speakerName}" — keep exactly, do not translate.`);
  }
  if (meta.churchName) {
    lines.push(`Church/ministry: "${meta.churchName}" — keep exactly, do not translate.`);
  }
  if (meta.seriesTitle) {
    lines.push(`Series title: "${meta.seriesTitle}" — keep exactly as-is.`);
  }
  if (meta.glossary) {
    for (const [src, tgt] of Object.entries(meta.glossary)) {
      lines.push(`"${src}" -> "${tgt}"`);
    }
  }

  return lines.length
      ? `GLOSSARY (must follow exactly):\n${lines.map((l) => `- ${l}`).join("\n")}`
      : "";
}

export function buildSystemPrompt(opts: TranslateOptions): string {
  const sourceLang = opts.sourceLang ?? "en";
  const domain = opts.domain ?? "sermon";
  const domainBlock = DOMAIN_INSTRUCTIONS[domain];
  const glossaryBlock = opts.meta ? buildGlossaryBlock(opts.meta) : "";

  return [
    `You are a professional subtitle translator. Translate from ${sourceLang} to ${opts.targetLang}.`,
    domainBlock,
    glossaryBlock,
    `RULES:
- Preserve ALL-CAPS emphasis, ellipses (...), dashes, and line-ending punctuation exactly.
- Never merge or split sentences — one input item = one output item.
- Never add explanatory text, parentheticals, or translator notes.
- Output ONLY valid JSON. No markdown, no code fences, no preamble.`,
    `OUTPUT FORMAT:
[{"id":<number>,"t":"<translated text>"},...]`,
  ]
      .filter(Boolean)
      .join("\n\n");
}

export function buildUserMessage(
    sentences: Array<{ sentenceId: number; text: string }>,
    contextSentences: Array<{ sentenceId: number; text: string }>
): string {
  const parts: string[] = [];

  if (contextSentences.length) {
    parts.push(
        "CONTEXT (already translated — do NOT include in output):\n" +
        contextSentences.map((s) => `[${s.sentenceId}] ${s.text}`).join("\n")
    );
  }

  parts.push(
      "TRANSLATE:\n" +
      JSON.stringify(sentences.map((s) => ({ id: s.sentenceId, text: s.text })))
  );

  return parts.join("\n\n");
}