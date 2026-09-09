export const MOBILE_VIEWS = Object.freeze(["library", "now-playing", "queue"]);
export const MOBILE_NAVIGATION_EVENT = "media-player:navigate-mobile";

export function mobileViewFromSearch(search = "") {
  const view = new URLSearchParams(search).get("view");
  return MOBILE_VIEWS.includes(view) ? view : null;
}

export function mobileViewSearch(search = "", view = "library") {
  const normalized = MOBILE_VIEWS.includes(view) ? view : "library";
  const params = new URLSearchParams(search);
  params.set("view", normalized);
  const serialized = params.toString();
  return serialized ? `?${serialized}` : "";
}

export function mobileViewUrl(locationLike, view) {
  const pathname = locationLike?.pathname || "";
  const search = mobileViewSearch(locationLike?.search || "", view);
  const hash = locationLike?.hash || "";
  return `${pathname}${search}${hash}`;
}

export function resolveMobileView(requestedView, availableViews = MOBILE_VIEWS) {
  const available = MOBILE_VIEWS.filter((view) => availableViews.includes(view));
  if (available.includes(requestedView)) return requestedView;
  if (available.includes("library")) return "library";
  return available[0] || "library";
}

export function setupMobileNavigation(doc = globalThis.document) {
  if (!doc) return null;

  const nav = doc.querySelector("#mobile-view-nav");
  const player = doc.querySelector("#player");
  const queue = doc.querySelector("#queue-section");
  const buttons = new Map(
    MOBILE_VIEWS.map((view) => [view, doc.querySelector(`[data-mobile-view-target="${view}"]`)]),
  );

  if (!nav || !player || !queue || [...buttons.values()].some((button) => !button)) return null;

  const viewWindow = doc.defaultView || globalThis.window;
  const locationLike = viewWindow?.location || globalThis.location;
  const historyLike = viewWindow?.history || globalThis.history;
  let requestedView = mobileViewFromSearch(locationLike?.search || "") || "library";

  nav.hidden = false;

  function availableViews() {
    const available = ["library"];
    if (!player.hidden) available.push("now-playing");
    if (!queue.hidden) available.push("queue");
    return available;
  }

  function sync() {
    const available = availableViews();
    const activeView = resolveMobileView(requestedView, available);
    doc.documentElement.dataset.mobileView = activeView;

    for (const [view, button] of buttons) {
      const isAvailable = available.includes(view);
      button.disabled = !isAvailable;
      button.setAttribute("aria-pressed", String(view === activeView));
    }

    return activeView;
  }

  function navigate(view, { replace = false } = {}) {
    if (!MOBILE_VIEWS.includes(view)) return sync();
    requestedView = view;

    if (historyLike && locationLike && mobileViewFromSearch(locationLike.search || "") !== view) {
      const url = mobileViewUrl(locationLike, view);
      if (replace) historyLike.replaceState(historyLike.state ?? null, "", url);
      else historyLike.pushState(historyLike.state ?? null, "", url);
    }

    return sync();
  }

  const buttonHandlers = new Map();
  for (const [view, button] of buttons) {
    const handler = () => {
      if (!button.disabled) navigate(view);
    };
    buttonHandlers.set(button, handler);
    button.addEventListener("click", handler);
  }

  const handlePopState = () => {
    requestedView = mobileViewFromSearch(locationLike?.search || "") || "library";
    sync();
  };

  const handleNavigationEvent = (event) => {
    const view = event.detail?.view;
    if (MOBILE_VIEWS.includes(view)) navigate(view);
  };

  viewWindow?.addEventListener("popstate", handlePopState);
  viewWindow?.addEventListener(MOBILE_NAVIGATION_EVENT, handleNavigationEvent);

  const MutationObserverImpl = doc.defaultView?.MutationObserver || globalThis.MutationObserver;
  const observer = MutationObserverImpl ? new MutationObserverImpl(sync) : null;
  observer?.observe(player, { attributes: true, attributeFilter: ["hidden"] });
  observer?.observe(queue, { attributes: true, attributeFilter: ["hidden"] });

  sync();
  return {
    navigate,
    sync,
    destroy() {
      observer?.disconnect();
      for (const [button, handler] of buttonHandlers) button.removeEventListener("click", handler);
      viewWindow?.removeEventListener("popstate", handlePopState);
      viewWindow?.removeEventListener(MOBILE_NAVIGATION_EVENT, handleNavigationEvent);
      nav.hidden = true;
      delete doc.documentElement.dataset.mobileView;
    },
  };
}

if (globalThis.document) setupMobileNavigation(globalThis.document);
