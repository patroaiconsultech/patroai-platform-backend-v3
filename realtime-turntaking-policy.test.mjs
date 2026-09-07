import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const consoleSource = fs.readFileSync("src/routes/AppConsole.tsx", "utf8");

test("realtime consumes provider speech lifecycle events explicitly", () => {
  assert.match(consoleSource, /input_audio_buffer\.speech_started/);
  assert.match(consoleSource, /input_audio_buffer\.speech_stopped/);
  assert.match(consoleSource, /realtimeUserSpeakingRef\.current = true/);
  assert.match(consoleSource, /realtimeUserSpeakingRef\.current = false/);
});

test("speech_started advances the monotonic realtime speech epoch", () => {
  const start = consoleSource.indexOf("function handleRealtimeProviderEvent");
  const end = consoleSource.indexOf("async function startRealtimeSession", start);
  const block = consoleSource.slice(start, end);

  assert.match(block, /realtimeSpeechEpochRef\.current \+= 1/);
});

test("explicit user speech stops active realtime output and canonical playback", () => {
  const start = consoleSource.indexOf("function handleRealtimeProviderEvent");
  const end = consoleSource.indexOf("async function startRealtimeSession", start);
  const block = consoleSource.slice(start, end);

  assert.match(block, /realtimeOutputAbortRef\.current\?\.abort\(\)/);
  assert.match(block, /messageAudioRef\.current \|\| messageVoiceAbortRef\.current/);
  assert.match(block, /stopMessageAudio\(\)/);
});

test("realtime canonical message playback remains pending until audio completion", () => {
  const start = consoleSource.indexOf("async function playCanonicalMessageVoice");
  const end = consoleSource.indexOf("async function handleMessageVoice", start);
  const block = consoleSource.slice(start, end);

  assert.match(block, /messageAudioDoneRef/);
  assert.match(block, /new Promise<void>/);
  assert.match(block, /await audio\.play\(\)/);
  assert.match(block, /await playbackDone/);
  assert.ok(
    block.indexOf("await audio.play()") < block.indexOf("await playbackDone"),
    "playback lifetime must remain pending after audio.play() starts",
  );
});

test("stopping playback releases the realtime playback waiter", () => {
  const start = consoleSource.indexOf("function stopMessageAudio");
  const end = consoleSource.indexOf("function stopRealtimeAudioAnalysis", start);
  const block = consoleSource.slice(start, end);

  assert.match(block, /const playbackDone = messageAudioDoneRef\.current/);
  assert.match(block, /messageAudioDoneRef\.current = null/);
  assert.match(block, /playbackDone\?\.\(\)/);
});

test("final transcript captures speech epoch before entering the turn chain", () => {
  const start = consoleSource.indexOf("function handleRealtimeProviderEvent");
  const end = consoleSource.indexOf("async function startRealtimeSession", start);
  const block = consoleSource.slice(start, end);

  assert.match(block, /const transcriptSpeechEpoch = realtimeSpeechEpochRef\.current/);
  assert.match(block, /transcriptSpeechEpoch,/);
});

test("stale response after a newer speech start cannot play TTS", () => {
  const start = consoleSource.indexOf("async function processRealtimeFinal");
  const end = consoleSource.indexOf("function handleRealtimeProviderEvent", start);
  const block = consoleSource.slice(start, end);

  assert.match(block, /transcriptSpeechEpoch: number/);
  assert.match(block, /realtimeSpeechEpochRef\.current !== transcriptSpeechEpoch/);
  assert.ok(
    block.indexOf("realtimeSpeechEpochRef.current !== transcriptSpeechEpoch") <
      block.indexOf("playCanonicalMessageVoice"),
    "speech epoch freshness guard must execute before canonical TTS playback",
  );
});

test("ending a realtime session invalidates speech generation and active playback", () => {
  const start = consoleSource.indexOf("function stopRealtimeSession");
  const end = consoleSource.indexOf("function waitForIceGatheringComplete", start);
  const block = consoleSource.slice(start, end);

  assert.match(block, /realtimeUserSpeakingRef\.current = false/);
  assert.match(block, /realtimeSpeechEpochRef\.current \+= 1/);
  assert.match(block, /stopMessageAudio\(\)/);
});
