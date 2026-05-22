// Voxsave — frontend logic
// - SRT/VTT parser
// - edge-tts preview via Tauri (Web Speech fallback in browser)
// - MP3 save via Tauri invoke('synthesize')

// `isTauri` is a global injected by withGlobalTauri:true — use a distinct name.
const IS_TAURI = "__TAURI_INTERNALS__" in window;

const $ = (id) => document.getElementById(id);

// ---------- Tabs ----------
const tabs = document.querySelectorAll(".tab");
const panels = {
  text: $("panel-text"),
  sub: $("panel-sub"),
};
tabs.forEach((t) => {
  t.addEventListener("click", () => {
    tabs.forEach((x) => {
      x.classList.toggle("is-active", x === t);
      x.setAttribute("aria-selected", x === t ? "true" : "false");
    });
    Object.entries(panels).forEach(([k, el]) => {
      const on = k === t.dataset.tab;
      el.classList.toggle("is-active", on);
      el.hidden = !on;
    });
  });
});

// ---------- Slider value formatting ----------
const rateEl = $("rate"), rateVal = $("rate-val");
const pitchEl = $("pitch"), pitchVal = $("pitch-val");
const fmtRate = (v) => `${v >= 0 ? "+" : ""}${v}%`;
const fmtPitch = (v) => `${v >= 0 ? "+" : ""}${v}Hz`;
rateEl.addEventListener("input", () => (rateVal.textContent = fmtRate(+rateEl.value)));
pitchEl.addEventListener("input", () => (pitchVal.textContent = fmtPitch(+pitchEl.value)));

// ---------- Subtitle parser (SRT + VTT) ----------
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

// ---------- File drop / pick ----------
const dropzone = $("dropzone");
const fileInput = $("file-input");
const subOutput = $("sub-output");
const subStats = $("sub-stats");

function showCues(cues) {
  subOutput.value = cues.join("\n");
  const chars = subOutput.value.length;
  subStats.textContent = `큐 ${cues.length}개 · ${chars}자`;
}

async function loadFile(file) {
  if (!file) return;
  try {
    const buf = await file.arrayBuffer();
    const text = new TextDecoder("utf-8").decode(buf);
    const cues = parseSubtitle(text);
    showCues(cues);
    setStatus(`자막 로드됨: ${file.name} (큐 ${cues.length}개)`);
  } catch (e) {
    setStatus(`자막 읽기 실패: ${e}`, "error");
  }
}

dropzone.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", (e) => loadFile(e.target.files?.[0]));
["dragenter", "dragover"].forEach((ev) =>
  dropzone.addEventListener(ev, (e) => {
    e.preventDefault();
    dropzone.classList.add("is-drag");
  })
);
["dragleave", "drop"].forEach((ev) =>
  dropzone.addEventListener(ev, (e) => {
    e.preventDefault();
    dropzone.classList.remove("is-drag");
  })
);
dropzone.addEventListener("drop", (e) => {
  const f = e.dataTransfer?.files?.[0];
  if (f) loadFile(f);
});
$("sub-clear").addEventListener("click", () => {
  subOutput.value = "";
  subStats.textContent = "큐 0개 · 0자";
});

// ---------- Active text source ----------
function currentText() {
  const activeTab = document.querySelector(".tab.is-active").dataset.tab;
  return activeTab === "sub" ? subOutput.value.trim() : $("text-input").value.trim();
}

// ---------- Status helper ----------
function setStatus(msg, kind) {
  const el = $("status");
  el.textContent = msg;
  el.classList.remove("success", "error");
  if (kind) el.classList.add(kind);
}

// ---------- Preview (edge-tts in Tauri, Web Speech fallback in browser) ----------
let currentAudio = null;
let currentAudioUrl = null;

function stopPreview() {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
  }
  if (currentAudioUrl) {
    URL.revokeObjectURL(currentAudioUrl);
    currentAudioUrl = null;
  }
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
}

function base64ToBlob(b64, mime) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

async function previewEdgeTts(text) {
  const { invoke } = window.__TAURI__.core;
  const voice = $("voice").value;
  const rate = fmtRate(+rateEl.value);
  const pitch = fmtPitch(+pitchEl.value);

  setStatus(`미리듣기 생성 중… (edge-tts, ${voice})`);
  spinner.hidden = false;
  try {
    const b64 = await invoke("preview", { text, voice, rate, pitch });
    const blob = base64ToBlob(b64, "audio/mpeg");
    currentAudioUrl = URL.createObjectURL(blob);
    currentAudio = new Audio(currentAudioUrl);
    currentAudio.onended = () => setStatus("미리듣기 완료");
    currentAudio.onerror = () => setStatus("오디오 재생 실패", "error");
    await currentAudio.play();
    setStatus(`미리듣기 재생 중 — ${text.length}자 (${voice})`);
  } catch (e) {
    setStatus(`미리듣기 실패: ${e}`, "error");
  } finally {
    spinner.hidden = true;
  }
}

function previewWebSpeech(text) {
  if (!("speechSynthesis" in window)) {
    setStatus("이 환경에서는 미리듣기를 사용할 수 없습니다.", "error");
    return;
  }
  const voices = window.speechSynthesis.getVoices();
  const v =
    voices.find((x) => /ko/i.test(x.lang)) ||
    voices.find((x) => /Korean/i.test(x.name)) ||
    voices[0];
  const u = new SpeechSynthesisUtterance(text.slice(0, 600));
  if (v) { u.voice = v; u.lang = v.lang; } else { u.lang = "ko-KR"; }
  u.rate = Math.max(0.5, Math.min(2, 1 + (+rateEl.value) / 100));
  u.pitch = Math.max(0.5, Math.min(2, 1 + (+pitchEl.value) / 50));
  window.speechSynthesis.speak(u);
  setStatus(`미리듣기 재생 중 (Web Speech${v ? `: ${v.name}` : ", 음성 미지정"})`);
}

$("preview-btn").addEventListener("click", () => {
  const text = currentText();
  if (!text) {
    setStatus("미리듣기: 입력 텍스트가 비어 있습니다.", "error");
    return;
  }
  stopPreview();
  if (IS_TAURI) {
    previewEdgeTts(text);
  } else {
    previewWebSpeech(text);
  }
});

$("stop-btn").addEventListener("click", () => {
  stopPreview();
  setStatus("정지됨");
});

if ("speechSynthesis" in window) {
  window.speechSynthesis.onvoiceschanged = () => {};
}

// ---------- MP3 Save (Tauri only) ----------
const saveBtn = $("save-btn");
const spinner = $("spinner");
const envNote = $("env-note");

if (IS_TAURI) {
  saveBtn.disabled = false;
  envNote.textContent = "Tauri 환경 · edge-tts 사용 가능";
} else {
  saveBtn.disabled = true;
  saveBtn.title = "MP3 저장은 Tauri 데스크탑 앱에서만 동작합니다.";
  envNote.textContent = "브라우저 환경 · 미리듣기만 가능 (MP3 저장은 데스크탑 앱에서)";
}

async function saveMp3() {
  const text = currentText();
  if (!text) {
    setStatus("저장: 입력 텍스트가 비어 있습니다.", "error");
    return;
  }
  if (!IS_TAURI) {
    setStatus("MP3 저장은 데스크탑 앱에서만 동작합니다.", "error");
    return;
  }

  const { save } = window.__TAURI__.dialog;
  const { invoke } = window.__TAURI__.core;

  const out = await save({
    defaultPath: "output.mp3",
    filters: [{ name: "MP3", extensions: ["mp3"] }],
  });
  if (!out) return;

  const voice = $("voice").value;
  const rate = fmtRate(+rateEl.value);
  const pitch = fmtPitch(+pitchEl.value);

  saveBtn.disabled = true;
  spinner.hidden = false;
  setStatus(`MP3 생성 중… (${text.length}자, ${voice})`);

  try {
    const result = await invoke("synthesize", {
      text,
      voice,
      rate,
      pitch,
      out,
    });
    setStatus(`저장 완료: ${result}`, "success");
  } catch (e) {
    setStatus(`저장 실패: ${e}`, "error");
  } finally {
    spinner.hidden = true;
    saveBtn.disabled = !IS_TAURI;
  }
}

saveBtn.addEventListener("click", saveMp3);
