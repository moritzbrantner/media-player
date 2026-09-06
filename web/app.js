import { formatBytes, formatTime, isMp3File, MP3_ACCEPT } from "./player.js";

const audio = document.querySelector("#audio");
const fileInput = document.querySelector("#file-input");
const dropTarget = document.querySelector("#drop-target");
const playButton = document.querySelector("#play-button");
const seek = document.querySelector("#seek");
const volume = document.querySelector("#volume");
const currentTime = document.querySelector("#current-time");
const duration = document.querySelector("#duration");
const trackName = document.querySelector("#track-name");
const trackMeta = document.querySelector("#track-meta");
const player = document.querySelector("#player");
const emptyState = document.querySelector("#empty-state");
const errorMessage = document.querySelector("#error-message");

fileInput.accept = MP3_ACCEPT;

let objectUrl = null;

function setError(message = "") {
  errorMessage.textContent = message;
  errorMessage.hidden = message.length === 0;
}

function resetPlaybackState() {
  playButton.textContent = "Play";
  playButton.setAttribute("aria-label", "Play");
  seek.value = "0";
  seek.max = "0";
  currentTime.textContent = "0:00";
  duration.textContent = "0:00";
}

function loadFile(file) {
  setError();

  if (!isMp3File(file)) {
    setError("Choose an MP3 file to continue.");
    return;
  }

  if (objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrl = URL.createObjectURL(file);

  audio.pause();
  audio.src = objectUrl;
  audio.load();

  trackName.textContent = file.name;
  trackMeta.textContent = formatBytes(file.size);
  emptyState.hidden = true;
  player.hidden = false;
  playButton.disabled = false;
  seek.disabled = false;
  resetPlaybackState();
}

async function togglePlayback() {
  if (!audio.src) return;

  if (audio.paused) {
    try {
      await audio.play();
      setError();
    } catch {
      setError("Playback could not start on this device.");
    }
  } else {
    audio.pause();
  }
}

fileInput.addEventListener("change", () => {
  const [file] = fileInput.files ?? [];
  if (file) loadFile(file);
  fileInput.value = "";
});

for (const eventName of ["dragenter", "dragover"]) {
  dropTarget.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropTarget.dataset.dragging = "true";
  });
}

for (const eventName of ["dragleave", "drop"]) {
  dropTarget.addEventListener(eventName, (event) => {
    event.preventDefault();
    delete dropTarget.dataset.dragging;
  });
}

dropTarget.addEventListener("drop", (event) => {
  const [file] = event.dataTransfer?.files ?? [];
  if (file) loadFile(file);
});

playButton.addEventListener("click", togglePlayback);

seek.addEventListener("input", () => {
  const requestedTime = Number(seek.value);
  if (Number.isFinite(requestedTime)) audio.currentTime = requestedTime;
});

volume.addEventListener("input", () => {
  const requestedVolume = Number(volume.value);
  if (Number.isFinite(requestedVolume)) audio.volume = requestedVolume;
});

audio.addEventListener("loadedmetadata", () => {
  const mediaDuration = Number.isFinite(audio.duration) ? audio.duration : 0;
  seek.max = String(mediaDuration);
  duration.textContent = formatTime(mediaDuration);
});

audio.addEventListener("durationchange", () => {
  if (!Number.isFinite(audio.duration)) return;
  seek.max = String(audio.duration);
  duration.textContent = formatTime(audio.duration);
});

audio.addEventListener("timeupdate", () => {
  seek.value = String(audio.currentTime);
  currentTime.textContent = formatTime(audio.currentTime);
});

audio.addEventListener("play", () => {
  playButton.textContent = "Pause";
  playButton.setAttribute("aria-label", "Pause");
});

audio.addEventListener("pause", () => {
  playButton.textContent = "Play";
  playButton.setAttribute("aria-label", "Play");
});

audio.addEventListener("ended", () => {
  audio.currentTime = 0;
  seek.value = "0";
  currentTime.textContent = "0:00";
  playButton.textContent = "Play";
  playButton.setAttribute("aria-label", "Play");
});

audio.addEventListener("error", () => {
  setError("This MP3 could not be decoded by the current platform.");
});

window.addEventListener("beforeunload", () => {
  if (objectUrl) URL.revokeObjectURL(objectUrl);
});
