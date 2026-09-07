export const ACCEPTANCE_TARGETS = ["browser", "desktop", "android", "ios"];
export const DEFAULT_ACCEPTANCE_TARGET = "browser";
export const REQUIRED_ACCEPTANCE_CHECKS = [
  "metadata",
  "play",
  "advance",
  "seek",
  "pause",
  "audible",
];

export function normalizeAcceptanceTarget(value) {
  return ACCEPTANCE_TARGETS.includes(value) ? value : DEFAULT_ACCEPTANCE_TARGET;
}

export function acceptanceTargetFromSearch(search = "") {
  const params = new URLSearchParams(search);
  return normalizeAcceptanceTarget(params.get("target"));
}

export function acceptanceTargetUrl(target, base = "./acceptance.html") {
  const normalized = normalizeAcceptanceTarget(target);
  const separator = base.includes("?") ? "&" : "?";
  return `${base}${separator}target=${encodeURIComponent(normalized)}`;
}

export function summarizeAcceptance(checks = {}) {
  const failed = [];
  const pending = [];

  for (const name of REQUIRED_ACCEPTANCE_CHECKS) {
    if (checks[name] === false) failed.push(name);
    else if (checks[name] !== true) pending.push(name);
  }

  return {
    status: failed.length > 0 ? "fail" : pending.length > 0 ? "pending" : "pass",
    failed,
    pending,
  };
}

export function seekTarget(duration, currentTime) {
  if (!Number.isFinite(duration) || duration <= 0) return null;

  const current = Number.isFinite(currentTime) ? Math.max(0, currentTime) : 0;
  const safeEnd = Math.max(0, duration - Math.min(0.05, duration / 10));
  if (safeEnd <= 0) return 0;

  const step = Math.min(1, Math.max(0.1, duration / 3));
  let target = Math.min(safeEnd, current + step);
  if (Math.abs(target - current) < 0.05) target = safeEnd / 2;
  return Math.max(0, target);
}
