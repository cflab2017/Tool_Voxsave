// Unit test for the subtitle parser (mirrors src/main.js logic).
const TIMECODE_RE =
  /(\d{1,2}:\d{2}(?::\d{2})?[.,]\d{1,3})\s*--?>\s*(\d{1,2}:\d{2}(?::\d{2})?[.,]\d{1,3})/;

function parseSubtitle(raw) {
  let s = raw.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const blocks = s.split(/\n{2,}/);
  const cues = [];
  for (let block of blocks) {
    block = block.trim();
    if (!block) continue;
    if (/^WEBVTT/i.test(block)) continue;
    const lines = block.split("\n");
    let i = 0;
    if (/^\d+$/.test(lines[i]?.trim() || "")) i++;
    if (/^NOTE(\s|$)/i.test(lines[i] || "")) continue;
    if (!lines[i] || !TIMECODE_RE.test(lines[i])) continue;
    i++;
    const textLines = [];
    while (i < lines.length) {
      let ln = lines[i];
      ln = ln.replace(/<[^>]+>/g, "");
      ln = ln.replace(/\{[^}]+\}/g, "");
      ln = ln.replace(/\s+/g, " ").trim();
      if (ln) textLines.push(ln);
      i++;
    }
    if (textLines.length) cues.push(textLines.join(" "));
  }
  return cues;
}

const srt = `1
00:00:01,000 --> 00:00:03,000
안녕하세요 첫번째 자막
줄바꿈 포함

2
00:00:04,000 --> 00:00:06,500
<i>이탤릭</i> 두번째 {ass스타일제거} 자막

3
00:00:07,000 --> 00:00:08,000
세번째 줄
`;

const vtt = `﻿WEBVTT

NOTE 이건 주석

00:00.000 --> 00:02.500
첫 큐 VTT

00:02.500 --> 00:05.000 align:middle
<c.yellow>두번째</c> 큐
`;

function assert(name, cond, detail) {
  if (cond) console.log("PASS:", name);
  else { console.log("FAIL:", name, detail || ""); process.exitCode = 1; }
}

const srtCues = parseSubtitle(srt);
assert("SRT cue count = 3", srtCues.length === 3, JSON.stringify(srtCues));
assert("SRT cue 1 joined", srtCues[0] === "안녕하세요 첫번째 자막 줄바꿈 포함", srtCues[0]);
assert("SRT tags stripped", srtCues[1] === "이탤릭 두번째 자막", srtCues[1]);

const vttCues = parseSubtitle(vtt);
assert("VTT cue count = 2 (NOTE skipped)", vttCues.length === 2, JSON.stringify(vttCues));
assert("VTT cue 1", vttCues[0] === "첫 큐 VTT", vttCues[0]);
assert("VTT cue 2 tags stripped", vttCues[1] === "두번째 큐", vttCues[1]);

console.log(`\nAll outputs:\nSRT:`, srtCues, `\nVTT:`, vttCues);
