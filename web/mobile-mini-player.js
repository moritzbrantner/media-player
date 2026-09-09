export function mobileControlSnapshot(source) {
  const text = String(source?.textContent || "").trim();
  const ariaLabel = source?.getAttribute?.("aria-label") || text;
  return {
    disabled: Boolean(source?.disabled),
    text,
    ariaLabel,
  };
}

export function shouldShowMobileMiniPlayer({ playerHidden, audioSource }) {
  return !playerHidden && typeof audioSource === "string" && audioSource.length > 0;
}

export function setupMobileMiniPlayer(doc = globalThis.document) {
  if (!doc) return null;

  const dock = doc.querySelector("#mobile-mini-player");
  const audio = doc.querySelector("#audio");
  const player = doc.querySelector("#player");
  const trackTitle = doc.querySelector("#track-title");
  const trackArtist = doc.querySelector("#track-artist");
  const miniTitle = doc.querySelector("#mobile-mini-title");
  const miniArtist = doc.querySelector("#mobile-mini-artist");
  const summaryButton = doc.querySelector("#mobile-mini-summary");
  const controls = [
    [doc.querySelector("#previous-button"), doc.querySelector("#mobile-previous-button")],
    [doc.querySelector("#play-button"), doc.querySelector("#mobile-play-button")],
    [doc.querySelector("#next-button"), doc.querySelector("#mobile-next-button")],
  ];

  if (
    !dock ||
    !audio ||
    !player ||
    !trackTitle ||
    !trackArtist ||
    !miniTitle ||
    !miniArtist ||
    !summaryButton ||
    controls.some(([source, target]) => !source || !target)
  ) {
    return null;
  }

  function syncControl(source, target) {
    const snapshot = mobileControlSnapshot(source);
    target.disabled = snapshot.disabled;
    target.textContent = snapshot.text;
    target.setAttribute("aria-label", snapshot.ariaLabel);
  }

  function sync() {
    const visible = shouldShowMobileMiniPlayer({
      playerHidden: player.hidden,
      audioSource: audio.getAttribute("src") || "",
    });

    dock.hidden = !visible;
    if (visible) doc.documentElement.dataset.mobileMiniPlayer = "active";
    else delete doc.documentElement.dataset.mobileMiniPlayer;

    miniTitle.textContent = trackTitle.textContent || "Track";
    miniArtist.textContent = trackArtist.textContent || "Local audio";
    for (const [source, target] of controls) syncControl(source, target);
  }

  for (const [source, target] of controls) {
    target.addEventListener("click", () => source.click());
  }

  summaryButton.addEventListener("click", () => {
    player.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  for (const eventName of ["loadstart", "loadedmetadata", "play", "pause", "emptied"]) {
    audio.addEventListener(eventName, sync);
  }

  const MutationObserverImpl = doc.defaultView?.MutationObserver || globalThis.MutationObserver;
  const observer = MutationObserverImpl ? new MutationObserverImpl(sync) : null;
  observer?.observe(player, { attributes: true, attributeFilter: ["hidden"] });
  observer?.observe(trackTitle, { childList: true, subtree: true });
  observer?.observe(trackArtist, { childList: true, subtree: true, attributes: true });
  for (const [source] of controls) {
    observer?.observe(source, { attributes: true, childList: true, subtree: true });
  }

  sync();
  return {
    sync,
    destroy() {
      observer?.disconnect();
      delete doc.documentElement.dataset.mobileMiniPlayer;
    },
  };
}

if (globalThis.document) setupMobileMiniPlayer(globalThis.document);
