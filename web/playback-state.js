export const PLAYBACK_STATE_SNAPSHOT_EVENT = "media-player:playback-state-snapshot";
export const PLAYBACK_STATE_RESTORE_EVENT = "media-player:restore-native-queue";
export const MAX_PERSISTED_QUEUE_TRACKS = 500;
export const MAX_PERSISTED_POSITION_SECONDS = 365 * 24 * 60 * 60;

export function isStableLibraryTrackId(value) {
  return typeof value === "string" && /^[0-9a-fA-F]{64}$/.test(value);
}

export function normalizePlaybackPosition(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return 0;
  return Math.min(number, MAX_PERSISTED_POSITION_SECONDS);
}

export function playbackStateSnapshot(queue, currentIndex, positionSeconds = 0) {
  if (!Array.isArray(queue)) return null;

  const queueTrackIds = [];
  const seen = new Set();
  for (const item of queue) {
    const trackId = item?.libraryTrackId;
    if (!isStableLibraryTrackId(trackId) || seen.has(trackId)) continue;
    if (queueTrackIds.length >= MAX_PERSISTED_QUEUE_TRACKS) return null;
    seen.add(trackId);
    queueTrackIds.push(trackId);
  }

  const current = Number.isInteger(currentIndex) ? queue[currentIndex] : null;
  const currentTrackId = isStableLibraryTrackId(current?.libraryTrackId)
    && seen.has(current.libraryTrackId)
    ? current.libraryTrackId
    : null;

  return {
    queueTrackIds,
    currentTrackId,
    positionSeconds: currentTrackId ? normalizePlaybackPosition(positionSeconds) : 0,
  };
}

export function normalizePersistedPlaybackState(value) {
  if (!value || !Array.isArray(value.queueTrackIds)) return null;
  if (value.queueTrackIds.length > MAX_PERSISTED_QUEUE_TRACKS) return null;

  const seen = new Set();
  const queueTrackIds = [];
  for (const trackId of value.queueTrackIds) {
    if (!isStableLibraryTrackId(trackId) || seen.has(trackId)) return null;
    seen.add(trackId);
    queueTrackIds.push(trackId);
  }

  const currentTrackId = value.currentTrackId ?? null;
  if (currentTrackId !== null) {
    if (!isStableLibraryTrackId(currentTrackId) || !seen.has(currentTrackId)) return null;
  }

  const positionSeconds = normalizePlaybackPosition(value.positionSeconds);
  if (currentTrackId === null && positionSeconds !== 0) return null;

  return { queueTrackIds, currentTrackId, positionSeconds };
}

export function restoredCurrentIndex(items, currentTrackId) {
  if (!Array.isArray(items) || items.length === 0) return -1;
  if (isStableLibraryTrackId(currentTrackId)) {
    const index = items.findIndex((item) => item?.libraryTrackId === currentTrackId);
    if (index >= 0) return index;
  }
  return 0;
}

export function boundedRestorePosition(positionSeconds, duration) {
  const position = normalizePlaybackPosition(positionSeconds);
  const mediaDuration = Number(duration);
  if (!Number.isFinite(mediaDuration) || mediaDuration <= 0) return position;
  return Math.min(position, Math.max(0, mediaDuration - 0.05));
}
