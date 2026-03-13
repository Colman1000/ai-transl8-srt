import type {TranslatedCue} from "../types/types.js";
import { msToSrtTime, msToVttTime } from "./parser.js";

export function emitSRT(cues: TranslatedCue[]): string {
  return cues
    .map((cue, i) =>
      [
        String(i + 1),
        `${msToSrtTime(cue.startMs)} --> ${msToSrtTime(cue.endMs)}`,
        cue.translatedLines.join("\n"),
      ].join("\n")
    )
    .join("\n\n");
}

export function emitVTT(cues: TranslatedCue[]): string {
  const header = "WEBVTT\n\n";
  const body = cues
    .map((cue, i) =>
      [
        String(i + 1),
        `${msToVttTime(cue.startMs)} --> ${msToVttTime(cue.endMs)}`,
        cue.translatedLines.join("\n"),
      ].join("\n")
    )
    .join("\n\n");
  return header + body;
}
