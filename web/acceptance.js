import { formatTime, isMp3File } from "./player.js";
import {
  ACCEPTANCE_TARGETS,
  acceptanceTargetFromSearch,
  acceptanceTargetUrl,
  REQUIRED_ACCEPTANCE_CHECKS,
  seekTarget,
  summarizeAcceptance,
} from "./playback-acceptance.js";

const audio = document.querySelector("#acceptance-audio");
const fileInput = document.querySelector("#acceptance-file");
const fileSummary = document.querySelector("#file-summary");
const runButton = document.querySelector("#run-acceptance");
const heardAudio = document.querySelector("#heard-audio");
const resetButton = document.querySelector("#reset-acceptance");
const summary = document.querySelector("#acceptance-summary");
const errorMessage = document.querySelector("#acceptance-error");
const targetLabel = document.querySelector("#target-label");
const targetLinks = Array.from(document.querySelectorAll("[data-target]"));

const target = acceptanceTargetFromSearch(window.location.search);
const checks = Object.fromEntries(REQUIRED_ACCEPTANCE_CHECKS.map((name) => [name, null]));
let objectUrl = null;
let selectedFile = null;
let selectionGeneration = 0;
let running = false;

targetLabel.textContent = targetName(target);
for (const link of targetLinks) {
  const linkTarget = link.dataset.target;
  link.href = acceptanceTargetUrl(linkTarget);
  if (linkTarget === target) link.setAttribute("aria-current", "page");
}

function targetName(value) {
  return {
    browser: "Browser / hosted web",
    desktop: "Packaged desktop",
    android: "Android",
    ios: "iOS",
  }[value] ?? value;
}

function setError(message = "") {
  errorMessage.textContent = message;
  errorMessage.hidden = message.length === 0;
}

function checkRow(name) {
  return document.querySelector(`[data-check="${name}"]`);
}

function setCheck(name, value, detail = "") {
  checks[name] = value;
  const row = checkRow(name);
  if (!row) return;

  const status = row.querySelector(".check-status");
  const detailNode = row.querySelector(".check-detail");
  row.dataset.status = value === true ? "pass" : value === false ? "fail" : "pending";
  status.textContent = value === true ? "Pass" : value === false ? "Fail" : "Pending";
  detailNode.textContent = detail;
  renderSummary();
}

function resetChecks() {
  for (const name of REQUIRED_ACCEPTANCE_CHECKS) setCheck(name, null, "Not checked yet.");
}

function renderSummary() {
  const result = summarizeAcceptance(checks);
  summary.dataset.status = result.status;

  if (result.status === "pass") {
    summary.textContent = `${targetName(target)} playback accepted for this MP3.`;
  } else if (result.status === "fail") {
    summary.textContent = `Acceptance failed: ${result.failed.join(", ")}.`;
  } else {
    summary.textContent = "Acceptance is incomplete. Run the checks and confirm that audio was audible.";
  }
}

function revokeObjectUrl() {
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrl = null;
}

function mediaError() {
  const code = audio.error?.code;
  return code ? `Media element error ${code}.` : "The MP3 could not be decoded on this target.";
}

function waitForEvent(element, eventName, timeoutMs = 8_000) {
  return new Promise((resolve, reject) => {
    let timeout;

    const cleanup = () => {
      clearTimeout(timeout);
      element.removeEventListener(eventName, onEvent);
      element.removeEventListener("error", onError);
    };

    const onEvent = (event) => {
      cleanup();
      resolve(event);
    };

    const onError = () => {
      cleanup();
      reject(new Error(mediaError()));
    };

    timeout = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for ${eventName}.`));
    }, timeoutMs);

    element.addEventListener(eventName, onEvent, { once: true });
    element.addEventListener("error", onError, { once: true });
  });
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function prepareFile(file) {
  const generation = ++selectionGeneration;
  setError();
  audio.pause();
  revokeObjectUrl();
  selectedFile = null;
  runButton.disabled = true;
  heardAudio.checked = false;
  heardAudio.disabled = true;
  resetChecks();

  if (!isMp3File(file)) {
    fileSummary.textContent = "Choose a known-good MP3 file for the baseline acceptance check.";
    setCheck("metadata", false, "The baseline acceptance fixture must be an MP3.");
    return;
  }

  selectedFile = file;
  fileSummary.textContent = `${file.name} · ${(file.size / 1024).toFixed(1)} KB`;
  objectUrl = URL.createObjectURL(file);
  audio.src = objectUrl;
  audio.load();

  try {
    if (audio.readyState < HTMLMediaElement.HAVE_METADATA) {
      await waitForEvent(audio, "loadedmetadata");
    }
    if (generation !== selectionGeneration) return;

    const validDuration = Number.isFinite(audio.duration) && audio.duration > 0;
    setCheck(
      "metadata",
      validDuration,
      validDuration ? `Duration ${formatTime(audio.duration)}.` : "No finite positive duration was exposed.",
    );
    runButton.disabled = !validDuration;
  } catch (error) {
    if (generation !== selectionGeneration) return;
    setCheck("metadata", false, error instanceof Error ? error.message : String(error));
    setError("This target could not load the selected MP3 metadata.");
  }
}

async function runPlaybackAcceptance() {
  if (!selectedFile || running || checks.metadata !== true) return;

  running = true;
  runButton.disabled = true;
  heardAudio.checked = false;
  heardAudio.disabled = true;
  setError();
  for (const name of ["play", "advance", "seek", "pause", "audible"]) {
    setCheck(name, null, "Checking…");
  }

  audio.pause();
  audio.currentTime = 0;

  let playPromise;
  try {
    // Start playback synchronously from the button activation so mobile WebViews
    // retain the user gesture required by their autoplay policies.
    playPromise = audio.play();
  } catch (error) {
    playPromise = Promise.reject(error);
  }

  try {
    await playPromise;
    setCheck("play", !audio.paused, audio.paused ? "The media element stayed paused." : "Playback started from the user action.");

    const startTime = audio.currentTime;
    await delay(900);
    const advanced = audio.currentTime > startTime + 0.05;
    setCheck(
      "advance",
      advanced,
      advanced ? `Playback advanced to ${formatTime(audio.currentTime)}.` : "Current time did not advance while playing.",
    );

    const requestedSeek = seekTarget(audio.duration, audio.currentTime);
    if (requestedSeek === null) {
      setCheck("seek", false, "No valid seek target could be calculated.");
    } else {
      audio.currentTime = requestedSeek;
      if (audio.seeking) await waitForEvent(audio, "seeked", 4_000);
      else await delay(100);

      const tolerance = Math.min(0.5, Math.max(0.1, audio.duration * 0.05));
      const seeked = Math.abs(audio.currentTime - requestedSeek) <= tolerance;
      setCheck(
        "seek",
        seeked,
        seeked
          ? `Seek reached ${formatTime(audio.currentTime)}.`
          : `Requested ${formatTime(requestedSeek)}, reached ${formatTime(audio.currentTime)}.`,
      );
    }

    audio.pause();
    await delay(100);
    setCheck("pause", audio.paused, audio.paused ? "Playback paused." : "The media element did not pause.");

    heardAudio.disabled = false;
    setCheck("audible", null, "Use the player controls if needed, then confirm that you heard the MP3.");
  } catch (error) {
    if (checks.play !== true) setCheck("play", false, error instanceof Error ? error.message : String(error));
    setError("Playback acceptance could not complete on this target.");
    audio.pause();
  } finally {
    running = false;
    runButton.disabled = checks.metadata !== true;
    renderSummary();
  }
}

function resetAcceptance() {
  selectionGeneration += 1;
  audio.pause();
  audio.removeAttribute("src");
  audio.load();
  revokeObjectUrl();
  selectedFile = null;
  fileInput.value = "";
  fileSummary.textContent = "No MP3 selected.";
  runButton.disabled = true;
  heardAudio.checked = false;
  heardAudio.disabled = true;
  setError();
  resetChecks();
}

fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  if (file) void prepareFile(file);
});

runButton.addEventListener("click", () => void runPlaybackAcceptance());

heardAudio.addEventListener("change", () => {
  setCheck(
    "audible",
    heardAudio.checked ? true : null,
    heardAudio.checked ? "Audible output confirmed manually." : "Audible output still needs manual confirmation.",
  );
});

resetButton.addEventListener("click", resetAcceptance);
window.addEventListener("beforeunload", revokeObjectUrl);

resetChecks();
renderSummary();
