# ai-transl8-srt

Fast, accurate, cost-effective subtitle file translation using OpenAI.
Supports `.srt` and `.vtt`. Optimised for sermon content; works for general video too.

---

## Install

```bash
npm install ai-transl8-srt openai
```

Set your OpenAI key:

```bash
export OPENAI_API_KEY=sk-...
```

---

## Usage

### Translate a string in memory

```typescript
import {translate} from "ai-transl8-srt";

const srtContent = `
1
00:00:01,000 --> 00:00:03,500
And the grace of God

2
00:00:03,500 --> 00:00:05,800
is sufficient for every one of us.
`.trim();

const result = await translate(srtContent, {
    targetLang: "fr",
    meta: {
        speakerName: "Pastor Emeka Eze",
        churchName: "Covenant Christian Centre",
        seriesTitle: "The Grace Revolution",
    },
});

console.log(result.toSRT());
// 1
// 00:00:01,000 --> 00:00:03,500
// Et la grâce de Dieu
//
// 2
// 00:00:03,500 --> 00:00:05,800
// est suffisante pour chacun d'entre nous.

console.log(result.stats);
// {
//   totalCues: 2,
//   totalSentences: 1,
//   totalBatches: 1,
//   inputTokens: 312,
//   outputTokens: 48,
//   estimatedCostUsd: 0.0000528,
//   durationMs: 843
// }
```

---

### Translate directly from/to file

```typescript
import {translateFile} from "ai-transl8-srt";

const result = await translateFile(
    "./sermon-english.srt",
    "./sermon-yoruba.srt",
    {
        targetLang: "yo",           // Yoruba — auto-routes to gpt-4o
        meta: {
            speakerName: "Pastor David",
            churchName: "House on the Rock",
        },
    }
);

console.log(`Done in ${result.stats.durationMs}ms`);
console.log(`Cost: $${result.stats.estimatedCostUsd.toFixed(6)}`);
```

---

### Translate to multiple languages in parallel

```typescript
import {translate} from "ai-transl8-srt";
import {readFile, writeFile} from "fs/promises";

const srt = await readFile("./sermon.srt", "utf-8");

const languages = ["fr", "pt", "yo", "ig", "ha"] as const;

const results = await Promise.all(
    languages.map((lang) =>
        translate(srt, {
            targetLang: lang,
            meta: {speakerName: "Pastor Emeka", churchName: "RCCG"},
        })
    )
);

for (const [i, lang] of languages.entries()) {
    await writeFile(`./sermon-${lang}.srt`, results[i].toSRT(), "utf-8");
}
```

---

### Bring your own OpenAI client (custom config / Azure)

```typescript
import OpenAI from "openai";
import {translate} from "ai-transl8-srt";

const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: process.env.OPENAI_BASE_URL, // e.g. Azure OpenAI endpoint
});

const result = await translate(content, {targetLang: "es"}, client);
```

---

## Options reference

```typescript
interface TranslateOptions {
    targetLang: string;          // Required. BCP-47 language tag: "fr", "yo", "pt", etc.
    sourceLang?: string;         // Default: "en"
    domain?: "sermon" | "general"; // Default: "sermon"
    meta?: {
        speakerName?: string;      // Kept verbatim — not translated
        churchName?: string;      // Kept verbatim — not translated
        seriesTitle?: string;      // Kept verbatim — not translated
        glossary?: Record<string, string>; // Custom term mappings
    };
    batchSize?: number;     // Sentences per API call. Default: 25
    contextOverlap?: number;     // Overlap sentences from prior batch. Default: 4
    concurrency?: number;     // Parallel API requests. Default: 8
    model?: "gpt-4o" | "gpt-4o-mini"; // Auto-selected based on targetLang if omitted
    primer?: boolean;    // AI-inferred style profile. Default: false
}
```

### Auto model selection

| Target language                              | Auto model                   |
|----------------------------------------------|------------------------------|
| French, Portuguese, Spanish, German, Italian | `gpt-4o-mini` (~12× cheaper) |
| Yoruba, Igbo, Hausa, Swahili, Zulu           | `gpt-4o` (quality)           |
| Arabic, Amharic, and other non-Latin scripts | `gpt-4o` (quality)           |

Override with `model: "gpt-4o"` to force the full model on any language.

---

## Typical costs

| Content            | Cues   | Model           | Cost     |
|--------------------|--------|-----------------|----------|
| Reel (1–2 min)     | ~80    | gpt-4o-mini     | ~$0.0003 |
| Sermon (30 min)    | ~2,000 | gpt-4o-mini     | ~$0.008  |
| Sermon (30 min)    | ~2,000 | gpt-4o (Yoruba) | ~$0.05   |
| Full film (90 min) | ~6,000 | gpt-4o-mini     | ~$0.02   |
