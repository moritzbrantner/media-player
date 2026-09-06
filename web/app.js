import { readId3Metadata } from "./metadata.js";
import {
  clamp,
  DEFAULT_PLAYBACK_RATE,
  DEFAULT_VOLUME,
  displaySubtitle,
  displayTitle,
  formatBytes,
  formatTime,
  isMp3File,
  MP3_ACCEPT,
} from "./player.js";
import { moveItem, nextIndex, previousIndex, removeItem } from "./queue.js";

const STORAGE_VOLUME = "media-player.volume";
const STORAGE_RATE = "media-player.playback-rate";

const audio = document.querySelector("#audio");
const fileInput = document.querySelector("#file-input");
const dropTarget = document.querySelector("#drop-target");
const playButton = document.querySelector("#play-button");
const previousButton = document.querySelector("#previous-button");
const nextButton = document.querySelector("#next-button");
const backButton = document.querySelector("#back-button");
const forwardButton = document.querySelector("#forward-button");
const seek = document.querySelector("#seek");
const volume = document.querySelector("#volume");
const playbackRate = document.querySelector("#playback-rate");
const currentTime = document.querySelector("#current-time");
const duration = document.querySelector("#duration");
const trackTitle = document.querySelector("#track-title");
const trackArtist = document.querySelector("#track-artist");
const trackAlbum = document.querySelector("#track-album");
const trackFile = document.querySelector("#track-file");
const coverArt = document.querySelector("#cover-art");
const coverPlaceholder = document.querySelector("#cover-placeholder");
const player = document.querySelector("#player");
const emptyState = document.querySelector("#empty-state");
const errorMessage = document.querySelector("#error-message");
const queueSection = document.querySelector("#queue-section");
const queueList = document.querySelector("#queue-list");
const clearQueueButton = document.querySelector("#clear-queue-button");

fileInput.accept = MP3_ACCEPT;

let queue = [];
let currentIndex = -1;
let audioObjectUrl = null;
let coverObjectUrl = null;

function makeId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

function readNumberSetting(key, fallback) {
  try {
    const value = Number(localStorage.getItem(key));
    return Number.isFinite(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

function writeSetting(key, value) {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // Playback still works when storage is unavailable.
  }
}

function setError(message = "") {
  errorMessage.textContent = message;
  errorMessage.hidden = message.length === 0;
}

function resetTimeline() {
  seek.value = "0";
  seek.max = "0";
  currentTime.textContent = "0:00";
  duration.textContent = "0:00";
}

function revokeActiveUrls() {
  if (audioObjectUrl) URL.revokeObjectURL(audioObjectUrl);
  if (coverObjectUrl) URL.revokeObjectURL(coverObjectUrl);
  audioObjectUrl = null;
  coverObjectUrl = null;
}

function renderCover(item) {
  if (coverObjectUrl) URL.revokeObjectURL(coverObjectUrl);
  coverObjectUrl = null;
  coverArt.hidden = true;
  coverArt.removeAttribute("src");
  coverPlaceholder.hidden = false;

  const picture = item?.metadata?.picture;
  if (!picture?.data?.length || !picture.mimeType?.startsWith("image/")) return;

  coverObjectUrl = URL.createObjectURL(new Blob([picture.data], { type: picture.mimeType }));
  coverArt.src = coverObjectUrl;
  coverArt.alt = `Cover art for ${displayTitle(item)}`;
  coverArt.hidden = false;
  coverPlaceholder.hidden = true;
}

function renderCurrentTrack() {
  const item = queue[currentIndex];
  if (!item) return;

  trackTitle.textContent = displayTitle(item);
  trackArtist.textContent = item.metadata?.artist || "Unknown artist";
  trackAlbum.textContent = item.metadata?.album || "";
  trackAlbum.hidden = !item.metadata?.album;
  trackFile.textContent = `${item.file.name} · ${formatBytes(item.file.size)}`;
  renderCover(item);
  updateMediaSession();
}

function queueButton(label, className, handler, disabled = false) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = label;
  button.disabled = disabled;
  button.addEventListener("click", handler);
  return button;
}

function renderQueue() {
  queueList.replaceChildren();

  queue.forEach((item, index) => {
    const row = document.createElement("li");
    row.className = "queue-item";
    if (index === currentIndex) row.dataset.active = "true";

    const select = queueButton(displayTitle(item), "queue-track", () => {
      void loadTrack(index, { autoplay: true });
    });
    if (index === currentIndex) select.setAttribute("aria-current", "true");

    const subtitle = document.createElement("span");
    subtitle.className = "queue-subtitle";
    subtitle.textContent =
      item.metadataStatus === "loading" ? "Reading metadata…" : displaySubtitle(item);
    select.append(subtitle);

    const actions = document.createElement("div");
    actions.className = "queue-actions";
    actions.append(
      queueButton("↑", "icon-button", () => moveQueueItem(index, index - 1), index === 0),
      queueButton("↓", "icon-button", () => moveQueueItem(index, index + 1), index === queue.length - 1),
      queueButton("Remove", "text-button", () => removeQueueItem(index)),
    );

    row.append(select, actions);
    queueList.append(row);
  });

  const hasTracks = queue.length > 0;
  queueSection.hidden = !hasTracks;
  emptyState.hidden = hasTracks;
  player.hidden = !hasTracks;
  updateTransportAvailability();
}

function updateTransportAvailability() {
  const hasCurrent = currentIndex >= 0 && currentIndex < queue.length;
  playButton.disabled = !hasCurrent;
  seek.disabled = !hasCurrent;
  backButton.disabled = !hasCurrent;
  forwardButton.disabled = !hasCurrent;
  previousButton.disabled = previousIndex(queue.length, currentIndex) < 0;
  nextButton.disabled = nextIndex(queue.length, currentIndex) < 0;
}

function updateMediaSession() {
  const item = queue[currentIndex];
  if (!item || !("mediaSession" in navigator)) return;

  const metadata = {
    title: displayTitle(item),
    artist: item.metadata?.artist || "",
    album: item.metadata?.album || "",
  };

  if (coverObjectUrl) {
    metadata.artwork = [{ src: coverObjectUrl }];
  }

  try {
    navigator.mediaSession.metadata = new MediaMetadata(metadata);
  } catch {
    // Media Session metadata is optional.
  }
}

function configureMediaActions() {
  if (!("mediaSession" in navigator)) return;

  const actions = {
    play: () => void audio.play(),
    pause: () => audio.pause(),
    previoustrack: () => void goPrevious(),
    nexttrack: () => void goNext(),
    seekbackward: (details) => seekBy(-(details.seekOffset || 10)),
    seekforward: (details) => seekBy(details.seekOffset || 10),
    seekto: (details) => {
      if (Number.isFinite(details.seekTime)) audio.currentTime = details.seekTime;
    },
  };

  for (const [action, handler] of Object.entries(actions)) {
    try {
      navigator.mediaSession.setActionHandler(action, handler);
    } catch {
      // Some WebViews expose Media Session but not every action.
    }
  }
}

async function hydrateMetadata(itemId) {
  const item = queue.find((candidate) => candidate.id === itemId);
  if (!item) return;

  try {
    item.metadata = await readId3Metadata(item.file);
    item.metadataStatus = "ready";
  } catch {
    item.metadataStatus = "unavailable";
  }

  const index = queue.findIndex((candidate) => candidate.id === itemId);
  if (index < 0) return;
  renderQueue();
  if (index === currentIndex) renderCurrentTrack();
}

function addFiles(files) {
  setError();
  const allFiles = Array.from(files ?? []);
  const accepted = allFiles.filter(isMp3File);

  if (accepted.length === 0) {
    setError("Choose one or more MP3 files to continue.");
    return;
  }

  if (accepted.length !== allFiles.length) {
    setError("Some files were skipped because this player currently accepts MP3 only.");
  }

  const items = accepted.map((file) => ({
    id: makeId(),
    file,
    metadata: { title: null, artist: null, album: null, picture: null },
    metadataStatus: "loading",
  }));

  queue.push(...items);
  renderQueue();

  if (currentIndex < 0) {
    void loadTrack(0, { autoplay: false });
  }

  for (const item of items) void hydrateMetadata(item.id);
}

async function loadTrack(index, { autoplay = false } = {}) {
  const item = queue[index];
  if (!item) return;

  audio.pause();
  if (audioObjectUrl) URL.revokeObjectURL(audioObjectUrl);
  audioObjectUrl = URL.createObjectURL(item.file);

  currentIndex = index;
  audio.src = audioObjectUrl;
  audio.volume = Number(volume.value);
  audio.playbackRate = Number(playbackRate.value);
  audio.load();

  resetTimeline();
  renderCurrentTrack();
  renderQueue();

  if (autoplay) {
    try {
      await audio.play();
      setError();
    } catch {
      setError("Playback could not start on this device.");
    }
  }
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

function seekBy(seconds) {
  if (!audio.src || !Number.isFinite(audio.duration)) return;
  audio.currentTime = clamp(audio.currentTime + seconds, 0, audio.duration);
}

async function goPrevious() {
  const index = previousIndex(queue.length, currentIndex);
  if (index >= 0) await loadTrack(index, { autoplay: true });
}

async function goNext() {
  const index = nextIndex(queue.length, currentIndex);
  if (index >= 0) await loadTrack(index, { autoplay: true });
}

function moveQueueItem(fromIndex, toIndex) {
  if (toIndex < 0 || toIndex >= queue.length) return;
  const activeId = queue[currentIndex]?.id;
  queue = moveItem(queue, fromIndex, toIndex);
  currentIndex = queue.findIndex((item) => item.id === activeId);
  renderQueue();
}

function removeQueueItem(index) {
  if (index < 0 || index >= queue.length) return;

  const wasPlaying = !audio.paused;
  const activeId = queue[currentIndex]?.id;
  const removingActive = queue[index]?.id === activeId;
  queue = removeItem(queue, index);

  if (queue.length === 0) {
    currentIndex = -1;
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
    revokeActiveUrls();
    resetTimeline();
    renderQueue();
    return;
  }

  if (removingActive) {
    const replacementIndex = Math.min(index, queue.length - 1);
    void loadTrack(replacementIndex, { autoplay: wasPlaying });
    return;
  }

  currentIndex = queue.findIndex((item) => item.id === activeId);
  renderQueue();
}

fileInput.addEventListener("change", () => {
  addFiles(fileInput.files);
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
  addFiles(event.dataTransfer?.files);
});

playButton.addEventListener("click", () => void togglePlayback());
previousButton.addEventListener("click", () => void goPrevious());
nextButton.addEventListener("click", () => void goNext());
backButton.addEventListener("click", () => seekBy(-10));
forwardButton.addEventListener("click", () => seekBy(10));

seek.addEventListener("input", () => {
  const requestedTime = Number(seek.value);
  if (Number.isFinite(requestedTime)) audio.currentTime = requestedTime;
});

volume.addEventListener("input", () => {
  const requestedVolume = clamp(Number(volume.value), 0, 1);
  audio.volume = requestedVolume;
  writeSetting(STORAGE_VOLUME, requestedVolume);
});

playbackRate.addEventListener("change", () => {
  const requestedRate = clamp(Number(playbackRate.value), 0.5, 2);
  audio.playbackRate = requestedRate;
  writeSetting(STORAGE_RATE, requestedRate);
});

clearQueueButton.addEventListener("click", () => {
  queue = [];
  currentIndex = -1;
  audio.pause();
  audio.removeAttribute("src");
  audio.load();
  revokeActiveUrls();
  resetTimeline();
  renderQueue();
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

audio.addEventListener("ratechange", () => {
  if (Number(playbackRate.value) !== audio.playbackRate) {
    playbackRate.value = String(audio.playbackRate);
  }
});

audio.addEventListener("ended", () => {
  const index = nextIndex(queue.length, currentIndex);
  if (index >= 0) {
    void loadTrack(index, { autoplay: true });
    return;
  }

  audio.currentTime = 0;
  seek.value = "0";
  currentTime.textContent = "0:00";
});

audio.addEventListener("error", () => {
  setError("This MP3 could not be decoded by the current platform.");
});

document.addEventListener("keydown", (event) => {
  const tagName = event.target?.tagName;
  if (["INPUT", "SELECT", "BUTTON", "TEXTAREA"].includes(tagName)) return;

  if (event.code === "Space") {
    event.preventDefault();
    void togglePlayback();
  } else if (event.code === "ArrowLeft") {
    event.preventDefault();
    seekBy(-10);
  } else if (event.code === "ArrowRight") {
    event.preventDefault();
    seekBy(10);
  }
});

window.addEventListener("beforeunload", revokeActiveUrls);

const initialVolume = clamp(readNumberSetting(STORAGE_VOLUME, DEFAULT_VOLUME), 0, 1);
const storedRate = readNumberSetting(STORAGE_RATE, DEFAULT_PLAYBACK_RATE);
const allowedRates = Array.from(playbackRate.options, (option) => Number(option.value));
const initialRate = allowedRates.includes(storedRate) ? storedRate : DEFAULT_PLAYBACK_RATE;

volume.value = String(initialVolume);
audio.volume = initialVolume;
playbackRate.value = String(initialRate);
audio.playbackRate = initialRate;

configureMediaActions();
renderQueue();
