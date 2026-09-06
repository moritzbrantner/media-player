export const MP3_ACCEPT = ".mp3,audio/mpeg,audio/mp3";

export function isMp3File(file) {
  const name = typeof file?.name === "string" ? file.name.toLowerCase() : "";
  const type = typeof file?.type === "string" ? file.type.toLowerCase() : "";
  return name.endsWith(".mp3") || type === "audio/mpeg" || type === "audio/mp3";
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
