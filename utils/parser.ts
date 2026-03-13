import type {Cue, SubtitleFormat} from "../types/types.js";
import {SubtitleTranslationError} from "../types/types.js";

// ─── Time helpers ──────────────────────────────────────────────────────────────

function srtTimeToMs(t: string): number {
    // 00:01:23,456
    const [hms, ms] = t.split(",");
    const [h, m, s] = hms!.split(":").map(Number);
    //TODO; Revisit if default 0 is problematic
    return (h ?? 0) * 3_600_000 + (m ?? 0) * 60_000 + (s ?? 0) * 1_000 + Number(ms);
}

function vttTimeToMs(t: string): number {
    // 00:01:23.456 or 01:23.456
    const parts = t.split(":");
    let h = 0, m = 0, s = 0;
    if (parts.length === 3) {
        [h, m] = [Number(parts[0]), Number(parts[1])];
        s = parseFloat(parts[2]!);
    } else {
        m = Number(parts[0]);
        s = parseFloat(parts[1]!);
    }
    return Math.round(h * 3_600_000 + m * 60_000 + s * 1_000);
}

export function msToSrtTime(ms: number): string {
    const h = Math.floor(ms / 3_600_000);
    const m = Math.floor((ms % 3_600_000) / 60_000);
    const s = Math.floor((ms % 60_000) / 1_000);
    const f = ms % 1_000;
    return `${pad(h)}:${pad(m)}:${pad(s)},${pad(f, 3)}`;
}

export function msToVttTime(ms: number): string {
    return msToSrtTime(ms).replace(",", ".");
}

function pad(n: number, len = 2): string {
    return String(n).padStart(len, "0");
}

// ─── Strip markup ──────────────────────────────────────────────────────────────

function stripTags(text: string): string {
    return text
        .replace(/<[^>]+>/g, "")      // HTML/VTT tags
        .replace(/\{[^}]+\}/g, "")    // ASS/SSA style overrides
        .trim();
}

// ─── SRT parser ───────────────────────────────────────────────────────────────

function parseSRT(raw: string): Cue[] {
    const blocks = raw
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n")
        .trim()
        .split(/\n{2,}/);

    const cues: Cue[] = [];

    for (const block of blocks) {
        const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
        if (lines.length < 3) continue;

        const id = parseInt(lines[0]!, 10);
        const timeParts = lines[1]!.match(
            /(\d{2}:\d{2}:\d{2},\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2},\d{3})/
        );
        if (!timeParts) continue;

        const textLines = lines.slice(2).map(stripTags);
        cues.push({
            id,
            startMs: srtTimeToMs(timeParts[1]!),
            endMs: srtTimeToMs(timeParts[2]!),
            text: textLines.join(" "),
            lines: textLines,
        });
    }

    return cues;
}

// ─── VTT parser ───────────────────────────────────────────────────────────────

function parseVTT(raw: string): Cue[] {
    const normalised = raw
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n")
        .trim();

    if (!normalised.startsWith("WEBVTT")) {
        throw new SubtitleTranslationError(
            "VTT file must start with WEBVTT header",
            "PARSE_ERROR"
        );
    }

    const blocks = normalised.split(/\n{2,}/).slice(1); // drop header block
    const cues: Cue[] = [];
    let autoId = 1;

    for (const block of blocks) {
        const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
        if (!lines.length) continue;

        // Optional cue identifier line
        let offset = 0;
        if (!lines[0]?.includes("-->")) offset = 1;

        const timeLine = lines[offset];
        if (!timeLine?.includes("-->")) continue;

        const timeParts = timeLine.match(
            /([\d:.]+)\s*-->\s*([\d:.]+)/
        );
        if (!timeParts) continue;

        const textLines = lines.slice(offset + 1).map(stripTags);
        if (!textLines.length) continue;

        cues.push({
            id: autoId++,
            startMs: vttTimeToMs(timeParts[1]!),
            endMs: vttTimeToMs(timeParts[2]!),
            text: textLines.join(" "),
            lines: textLines,
        });
    }

    return cues;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function detectFormat(raw: string): SubtitleFormat {
    return raw.trimStart().startsWith("WEBVTT") ? "vtt" : "srt";
}

export function parseCues(raw: string, format?: SubtitleFormat): Cue[] {
    const fmt = format ?? detectFormat(raw);
    const cues = fmt === "vtt" ? parseVTT(raw) : parseSRT(raw);

    if (!cues.length) {
        throw new SubtitleTranslationError(
            "No cues found in subtitle file",
            "EMPTY_FILE"
        );
    }

    return cues;
}
