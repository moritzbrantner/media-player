export const MP3_ACCEPT = ".mp3,audio/mpeg,audio/mp3";
export const DEFAULT_PLAYBACK_RATE = 1;
export const DEFAULT_VOLUME = 1;

export function isMp3File(file) {
  const name = typeof file?.name === "string" ? file.name.toLowerCase() : "";
  const type = typeof file?.type === "string" ? file.type.toLowerCase() : "";
  return name.endsWith(".mp3") || type === "audio/mpeg" || type === "audio/mp3";
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
