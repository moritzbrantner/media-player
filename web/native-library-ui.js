import { AUDIO_ACCEPT, formatBytes, isSupportedAudioFile } from "./player.js";
import {
  createNativeLibraryApi,
  dispatchLibraryQueueAdd,
  dispatchLibraryQueueRemove,
  queueItemFromLibraryTrack,
} from "./native-library.js";

const api = createNativeLibraryApi();
const section = document.querySelector("#native-library-section");

if (api && section) {
  const importInput = document.querySelector("#library-import-input");
  const refreshButton = document.querySelector("#library-refresh-button");
  const status = document.querySelector("#library-status");
  const list = document.querySelector("#library-list");

  section.hidden = false;
  importInput.accept = AUDIO_ACCEPT;

  function setStatus(message, state = "idle") {
    status.textContent = message;
    status.dataset.state = state;
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

  function renderTracks(tracks) {
    list.replaceChildren();

    if (tracks.length === 0) {
      const empty = document.createElement("li");
      empty.className = "library-empty";
      empty.textContent = "No imported tracks yet.";
      list.append(empty);
      return;
    }

    for (const track of tracks) {
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
      const tracks = await api.listTracks();
      renderTracks(tracks);
      setStatus(
        tracks.length === 0
          ? "Import audio once to keep it in this installed app."
          : `${tracks.length} imported track${tracks.length === 1 ? "" : "s"} available after restart.`,
      );
    } catch (error) {
      list.replaceChildren();
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

  refreshButton.addEventListener("click", () => void refreshLibrary());
  void refreshLibrary();
}
