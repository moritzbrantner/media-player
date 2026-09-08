export const DEFAULT_BLUE_NOISE_SETTINGS = Object.freeze({
  spacing: 4,
  artistWeight: 0.85,
  albumWeight: 0.45,
  seed: "",
});

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

export function normalizeBlueNoiseSettings(settings = {}) {
  return {
    spacing: Math.round(
      clampNumber(settings.spacing, 1, 12, DEFAULT_BLUE_NOISE_SETTINGS.spacing),
    ),
    artistWeight: clampNumber(
      settings.artistWeight,
      0,
      1,
      DEFAULT_BLUE_NOISE_SETTINGS.artistWeight,
    ),
    albumWeight: clampNumber(
      settings.albumWeight,
      0,
      1,
      DEFAULT_BLUE_NOISE_SETTINGS.albumWeight,
    ),
    seed: typeof settings.seed === "string" ? settings.seed.trim() : "",
  };
}

function hashString(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function unitHash(value) {
  return hashString(value) / 4294967296;
}

function normalizedMetadata(value) {
  return typeof value === "string" ? value.trim().toLocaleLowerCase("en-US") : "";
}

function stableItemKey(item, index) {
  const file = item?.file;
  const metadata = item?.metadata;
  const parts = [
    file?.name,
    file?.size,
    file?.lastModified,
    metadata?.title,
    metadata?.artist,
    metadata?.album,
  ].filter((value) => value !== undefined && value !== null && value !== "");
  if (parts.length > 0) return parts.join("|");
  return String(item?.id ?? index);
}

function itemPoint(item, index, seed) {
  const key = stableItemKey(item, index);
  return {
    x: unitHash(`${seed}|${key}|x`),
    y: unitHash(`${seed}|${key}|y`),
    tie: unitHash(`${seed}|${key}|tie`),
  };
}

function toroidalDistanceSquared(left, right) {
  const deltaX = Math.abs(left.x - right.x);
  const deltaY = Math.abs(left.y - right.y);
  const wrappedX = Math.min(deltaX, 1 - deltaX);
  const wrappedY = Math.min(deltaY, 1 - deltaY);
  return wrappedX * wrappedX + wrappedY * wrappedY;
}

function sameMetadata(left, right, field) {
  const leftValue = normalizedMetadata(left?.metadata?.[field]);
  const rightValue = normalizedMetadata(right?.metadata?.[field]);
  return leftValue.length > 0 && leftValue === rightValue;
}

function candidateScore(candidate, recent, settings) {
  if (recent.length === 0) return 1 + candidate.point.tie * 1e-6;

  let distanceScore = 0.5;
  let metadataPenalty = 0;
  let compared = 0;

  for (let offset = 0; offset < recent.length; offset += 1) {
    const previous = recent[recent.length - 1 - offset];
    const recencyWeight = 1 / (offset + 1);
    distanceScore = Math.min(
      distanceScore,
      toroidalDistanceSquared(candidate.point, previous.point),
    );
    if (sameMetadata(candidate.item, previous.item, "artist")) {
      metadataPenalty += settings.artistWeight * recencyWeight;
    }
    if (sameMetadata(candidate.item, previous.item, "album")) {
      metadataPenalty += settings.albumWeight * recencyWeight;
    }
    compared += recencyWeight;
  }

  const normalizedPenalty = compared > 0 ? metadataPenalty / compared : 0;
  return distanceScore - normalizedPenalty + candidate.point.tie * 1e-6;
}

function decorate(items, seed, startIndex = 0) {
  return items.map((item, index) => ({
    item,
    point: itemPoint(item, startIndex + index, seed),
  }));
}

export function blueNoiseOrder(items, options = {}) {
  if (!Array.isArray(items)) return [];
  if (items.length <= 1) return [...items];

  const settings = normalizeBlueNoiseSettings(options);
  const seed = settings.seed || "media-player-blue-noise";
  const historyItems = Array.isArray(options.history) ? options.history : [];
  const recent = decorate(
    historyItems.slice(-settings.spacing),
    seed,
    Math.max(0, items.length - historyItems.length),
  );
  const remaining = decorate(items, seed, historyItems.length);
  const ordered = [];

  while (remaining.length > 0) {
    let bestIndex = 0;
    let bestScore = Number.NEGATIVE_INFINITY;
    const scoreHistory = recent.slice(-settings.spacing);

    for (let index = 0; index < remaining.length; index += 1) {
      const score = candidateScore(remaining[index], scoreHistory, settings);
      if (score > bestScore) {
        bestIndex = index;
        bestScore = score;
      }
    }

    const [chosen] = remaining.splice(bestIndex, 1);
    ordered.push(chosen.item);
    recent.push(chosen);
  }

  return ordered;
}

export function blueNoiseReorderUpcoming(items, currentIndex, options = {}) {
  if (!Array.isArray(items)) return [];

  const settings = normalizeBlueNoiseSettings(options);
  const prefixLength =
    Number.isInteger(currentIndex) && currentIndex >= 0 && currentIndex < items.length
      ? currentIndex + 1
      : 0;
  const prefix = items.slice(0, prefixLength);
  const upcoming = items.slice(prefixLength);
  const history = prefix.slice(-settings.spacing);

  return [
    ...prefix,
    ...blueNoiseOrder(upcoming, {
      ...settings,
      history,
    }),
  ];
}
