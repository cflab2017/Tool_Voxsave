import { readFileSync } from "fs";

const TIMECODE_RE =
  /(\d{1,2}:\d{2}(?::\d{2})?[.,]\d{1,3})\s*--?>\s*(\d{1,2}:\d{2}(?::\d{2})?[.,]\d{1,3})/;

function parse(raw) {
  let s = raw.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const cues = [];
  for (let b of s.split(/\n{2,}/)) {
    b = b.trim();
    if (!b) continue;
    if (/^WEBVTT/i.test(b)) continue;
    const lines = b.split("\n");
    let i = 0;
    if (/^\d+$/.test(lines[i]?.trim() || "")) i++;
    if (!lines[i] || !TIMECODE_RE.test(lines[i])) continue;
    i++;
    const t = [];
    while (i < lines.length) {
      let ln = lines[i]
        .replace(/<[^>]+>/g, "")
        .replace(/\{[^}]+\}/g, "")
        .replace(/\s+/g, " ")
        .trim();
      if (ln) t.push(ln);
      i++;
    }
    if (t.length) cues.push(t.join(" "));
  }
  return cues;
}

const cues = parse(
  readFileSync("D:/WebSite/GUI_Tools/Tool_Voxsave/docs/demo.srt", "utf8")
);
console.log("Total cues:", cues.length);
cues.forEach((c, i) =>
  console.log(`  [${i + 1}] ${c.length} chars: ${c.slice(0, 60)}${c.length > 60 ? "…" : ""}`)
);
const total = cues.join(" ");
console.log("Total narration chars:", total.length);
console.log("Estimated speech duration at ~14 cps:", (total.length / 14).toFixed(1), "s");
