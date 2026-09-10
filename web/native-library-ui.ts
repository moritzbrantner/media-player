import { AUDIO_ACCEPT, formatBytes, isSupportedAudioFile } from "./player.js";
import {
  createNativeLibraryApi,
  dispatchLibraryQueueAdd,
  dispatchLibraryQueueRemove,
  filterLibraryTracks,
  queueItemFromLibraryTrack,
} from "./native-library.js";

const api = createNativeLibraryApi();
const section = document.querySelector("#native-library-section");

if (api && section) {
  const importInput = document.querySelector("#library-import-input");
  const refreshButton = document.querySelector("#library-refresh-button");
  const integrityButton = document.querySelector("#library-integrity-button");
  const status = document.querySelector("#library-status");
  const integrityList = document.querySelector("#library-integrity-list");
  const list = document.querySelector("#library-list");
  const filterInput = document.createElement("input");
  let tracks = [];

  section.hidden = false;
  importInput.accept = AUDIO_ACCEPT;
  filterInput.id = "library-filter-input";
  filterInput.className = "library-filter";
  filterInput.type = "search";
  filterInput.placeholder = "Filter imported tracks";
  filterInput.setAttribute("aria-label", "Filter imported tracks");
  status.insertAdjacentElement("afterend", filterInput);

  function setStatus(message, state = "idle") {
    status.textContent = message;
    status.dataset.state = state;
  }

  function clearIntegrityReport() {
    integrityList.replaceChildren();
    integrityList.hidden = true;
  }

  function integrityKindLabel(kind) {
    return {
      "invalid-id": "Invalid identity",
      "unsafe-path": "Unsafe path",
      "missing-file": "Missing file",
      "unreadable-file": "Unreadable file",
      "size-mismatch": "Size mismatch",
      "content-mismatch": "Content mismatch",
    }[kind] || "Integrity issue";
  }

  function renderIntegrityReport(report) {
    clearIntegrityReport();
    const issues = Array.isArray(report?.issues) ? report.issues : [];
    const checkedTracks = Number(report?.checkedTracks) || 0;
    const healthyTracks = Number(report?.healthyTracks) || 0;

    if (issues.length === 0) {
      setStatus(
        `Library integrity passed: ${healthyTracks}/${checkedTracks} track${checkedTracks === 1 ? "" : "s"} healthy.`,
        "success",
      );
      return;
    }

    for (const issue of issues) {
      const row = document.createElement("li");
      row.className = "library-integrity-item";
      const name = document.createElement("strong");
      name.textContent = issue?.name || issue?.id || "Imported track";
      const detail = document.createElement("span");
      detail.textContent = `${integrityKindLabel(issue?.kind)} · ${issue?.detail || "Review this imported entry."}`;
      row.append(name, detail);
      integrityList.append(row);
    }
    integrityList.hidden = false;
    setStatus(
      `Library integrity found ${issues.length} issue${issues.length === 1 ? "" : "s"}; no library entries were changed.`,
      "error",
    );
  }

  function actionButton(label, handler, className = "text-button") {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.textContent = label;
    button.addEventListener("click", () => void handler(button));
    return button;
  }

  async function queueLibraryTrack(track, { autoplay = false } = {}) {
    const sourceUrl = await api.resolveSource(track.id);
    const item = queueItemFromLibraryTrack(track, sourceUrl);
    dispatchLibraryQueueAdd(window, item, { autoplay });
  }

  function renderTracks() {
    const visibleTracks = filterLibraryTracks(tracks, filterInput.value);
    list.replaceChildren();

    if (tracks.length === 0) {
      const empty = document.createElement("li");
      empty.className = "library-empty";
      empty.textContent = "No imported tracks yet.";
      list.append(empty);
      return;
    }

    if (visibleTracks.length === 0) {
      const empty = document.createElement("li");
      empty.className = "library-empty";
      empty.textContent = "No imported tracks match this filter.";
      list.append(empty);
      return;
    }

    for (const track of visibleTracks) {
      const row = document.createElement("li");
      row.className = "library-item";

      const copy = document.createElement("div");
      copy.className = "library-item-copy";
      const name = document.createElement("strong");
      name.textContent = track.name;
      const detail = document.createElement("span");
      detail.textContent = [track.mimeType || "audio", formatBytes(track.size)].join(" · ");
      copy.append(name, detail);

      const actions = document.createElement("div");
      actions.className = "library-actions";
      actions.append(
        actionButton("Add to queue", async (button) => {
          button.disabled = true;
          try {
            await queueLibraryTrack(track);
            setStatus(`${track.name} is in the visible queue.`, "success");
          } catch (error) {
            setStatus(`Could not add ${track.name}: ${error?.message || error}`, "error");
          } finally {
            button.disabled = false;
          }
        }),
        actionButton("Play now", async (button) => {
          button.disabled = true;
          try {
            await queueLibraryTrack(track, { autoplay: true });
            setStatus(`Playing ${track.name}.`, "success");
          } catch (error) {
            setStatus(`Could not play ${track.name}: ${error?.message || error}`, "error");
          } finally {
            button.disabled = false;
          }
        }),
        actionButton("Delete imported copy", async (button) => {
          if (!window.confirm(`Delete the imported copy of ${track.name}?`)) return;
          button.disabled = true;
          try {
            await api.removeTrack(track.id);
            dispatchLibraryQueueRemove(window, track.id);
            setStatus(`Removed ${track.name} from the native library.`, "success");
            await refreshLibrary();
          } catch (error) {
            setStatus(`Could not remove ${track.name}: ${error?.message || error}`, "error");
            button.disabled = false;
          }
        }),
      );

      row.append(copy, actions);
      list.append(row);
    }
  }

  async function refreshLibrary() {
    refreshButton.disabled = true;
    try {
      tracks = await api.listTracks();
      clearIntegrityReport();
      renderTracks();
      setStatus(
        tracks.length === 0
          ? "Import audio once to keep it in this installed app."
          : `${tracks.length} imported track${tracks.length === 1 ? "" : "s"} available after restart.`,
      );
    } catch (error) {
      tracks = [];
      list.replaceChildren();
      clearIntegrityReport();
      setStatus(`Could not read the native library: ${error?.message || error}`, "error");
    } finally {
      refreshButton.disabled = false;
    }
  }

  importInput.addEventListener("change", () => {
    const allFiles = Array.from(importInput.files ?? []);
    importInput.value = "";
    const files = allFiles.filter(isSupportedAudioFile);
    if (files.length === 0) {
      setStatus("Choose one or more supported audio files to import.", "error");
      return;
    }

    void (async () => {
      try {
        let imported = 0;
        for (const file of files) {
          setStatus(`Importing ${file.name}…`, "busy");
          await api.importFile(file);
          imported += 1;
        }
        const skipped = allFiles.length - files.length;
        setStatus(
          `Imported ${imported} track${imported === 1 ? "" : "s"}${skipped ? `; skipped ${skipped} unsupported file${skipped === 1 ? "" : "s"}` : ""}.`,
          "success",
        );
        await refreshLibrary();
      } catch (error) {
        setStatus(`Import failed: ${error?.message || error}`, "error");
      }
    })();
  });

  integrityButton.addEventListener("click", () => {
    void (async () => {
      integrityButton.disabled = true;
      setStatus("Checking library integrity…", "busy");
      try {
        renderIntegrityReport(await api.inspectIntegrity());
      } catch (error) {
        clearIntegrityReport();
        setStatus(`Could not inspect library integrity: ${error?.message || error}`, "error");
      } finally {
        integrityButton.disabled = false;
      }
    })();
  });

  filterInput.addEventListener("input", renderTracks);
  refreshButton.addEventListener("click", () => void refreshLibrary());
  void refreshLibrary();
}
