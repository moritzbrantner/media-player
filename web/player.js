const AUDIO_FORMATS = [
  {
    id: "mp3",
    label: "MP3",
    extensions: [".mp3"],
    mimeTypes: ["audio/mpeg", "audio/mp3"],
  },
  {
    id: "wav",
    label: "WAV",
    extensions: [".wav", ".wave"],
    mimeTypes: ["audio/wav", "audio/wave", "audio/x-wav"],
  },
  {
    id: "flac",
    label: "FLAC",
    extensions: [".flac"],
    mimeTypes: ["audio/flac", "audio/x-flac"],
  },
  {
    id: "ogg",
    label: "Ogg/Opus",
    extensions: [".ogg", ".oga", ".opus"],
    mimeTypes: ["audio/ogg", "audio/opus"],
  },
  {
    id: "mp4-audio",
    label: "M4A/AAC",
    extensions: [".m4a", ".m4b", ".aac"],
    mimeTypes: ["audio/mp4", "audio/aac", "audio/x-m4a"],
  },
  {
    id: "webm-audio",
    label: "WebM audio",
    extensions: [".webm", ".weba"],
    mimeTypes: ["audio/webm"],
  },
];

export const AUDIO_ACCEPT = AUDIO_FORMATS.flatMap((format) => [
  ...format.extensions,
  ...format.mimeTypes,
]).join(",");
export const DEFAULT_PLAYBACK_RATE = 1;
export const DEFAULT_VOLUME = 1;

function normalizedMimeType(file) {
  if (typeof file?.type !== "string") return "";
  return file.type.toLowerCase().split(";", 1)[0].trim();
}

function fileExtension(file) {
  if (typeof file?.name !== "string") return "";
  const name = file.name.toLowerCase();
  const dotIndex = name.lastIndexOf(".");
  return dotIndex >= 0 ? name.slice(dotIndex) : "";
}

export function audioFormatForFile(file) {
  const extension = fileExtension(file);
  if (extension) {
    const extensionMatch = AUDIO_FORMATS.find((format) => format.extensions.includes(extension));
    if (extensionMatch) return extensionMatch;
  }

  const mimeType = normalizedMimeType(file);
  if (!mimeType) return null;
  return AUDIO_FORMATS.find((format) => format.mimeTypes.includes(mimeType)) ?? null;
}

export function isSupportedAudioFile(file) {
  return audioFormatForFile(file) !== null;
}

export function isMp3File(file) {
  return audioFormatForFile(file)?.id === "mp3";
}

export function clamp(value, minimum, maximum) {
  if (!Number.isFinite(value)) return minimum;
  return Math.min(maximum, Math.max(minimum, value));
}

export function formatTime(value) {
  if (!Number.isFinite(value) || value < 0) return "0:00";

  const seconds = Math.floor(value);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
  }

  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";

  const units = ["B", "KB", "MB", "GB"];
  const unitIndex = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** unitIndex;
  const precision = unitIndex === 0 || value >= 10 ? 0 : 1;

  return `${value.toFixed(precision)} ${units[unitIndex]}`;
}

export function displayTitle(item) {
  return item?.metadata?.title?.trim() || item?.file?.name || "Unknown track";
}

export function displaySubtitle(item) {
  const parts = [item?.metadata?.artist, item?.metadata?.album].filter(Boolean);
  return parts.join(" · ") || formatBytes(item?.file?.size ?? 0);
}
