use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fmt::Write as _;
use std::fs::{self, File, OpenOptions};
use std::io::{Read, Write};
use std::path::{Component, Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::Manager;

const INDEX_VERSION: u32 = 1;
const INDEX_FILE: &str = "library-v1.json";
const MAX_IMPORT_CHUNK_BYTES: usize = 1024 * 1024;
const MAX_TRACK_BYTES: u64 = 8 * 1024 * 1024 * 1024;
static IMPORT_COUNTER: AtomicU64 = AtomicU64::new(0);

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryTrack {
    pub id: String,
    pub name: String,
    pub mime_type: String,
    pub size: u64,
    pub relative_path: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryImportStarted {
    pub session_id: String,
    pub max_chunk_bytes: usize,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryIntegrityReport {
    pub checked_tracks: usize,
    pub healthy_tracks: usize,
    pub issues: Vec<LibraryIntegrityIssue>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryIntegrityIssue {
    pub id: String,
    pub name: String,
    pub kind: LibraryIntegrityIssueKind,
    pub detail: String,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum LibraryIntegrityIssueKind {
    InvalidId,
    UnsafePath,
    MissingFile,
    UnreadableFile,
    SizeMismatch,
    ContentMismatch,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
struct LibraryIndex {
    version: u32,
    tracks: Vec<LibraryTrack>,
}

impl Default for LibraryIndex {
    fn default() -> Self {
        Self {
            version: INDEX_VERSION,
            tracks: Vec::new(),
        }
    }
}

struct ImportSession {
    file: File,
    temp_path: PathBuf,
    name: String,
    mime_type: String,
    expected_size: u64,
    received_size: u64,
}

#[derive(Default)]
pub struct LibraryImportState {
    sessions: Mutex<HashMap<String, ImportSession>>,
}

#[derive(Clone)]
struct LibraryStore {
    root: PathBuf,
}

impl LibraryStore {
    fn new(root: PathBuf) -> Self {
        Self { root }
    }

    fn media_dir(&self) -> PathBuf {
        self.root.join("media")
    }

    fn imports_dir(&self) -> PathBuf {
        self.root.join("imports")
    }

    fn index_path(&self) -> PathBuf {
        self.root.join(INDEX_FILE)
    }

    fn pending_index_path(&self) -> PathBuf {
        self.root.join(format!("{INDEX_FILE}.new"))
    }

    fn ensure_dirs(&self) -> Result<(), String> {
        fs::create_dir_all(self.media_dir()).map_err(io_error("create media library directory"))?;
        fs::create_dir_all(self.imports_dir()).map_err(io_error("create import directory"))?;
        Ok(())
    }

    fn recover_startup(&self) -> Result<(), String> {
        self.ensure_dirs()?;

        for entry in fs::read_dir(self.imports_dir()).map_err(io_error("scan import directory"))? {
            let entry = entry.map_err(io_error("read import directory entry"))?;
            let path = entry.path();
            let is_stale_import = entry
                .file_type()
                .map_err(io_error("read import entry type"))?
                .is_file()
                && path.extension().and_then(|extension| extension.to_str()) == Some("part");
            if is_stale_import {
                fs::remove_file(path).map_err(io_error("remove stale library import"))?;
            }
        }

        let pending_index = self.pending_index_path();
        let final_index = self.index_path();
        if pending_index.exists() {
            if final_index.exists() {
                fs::remove_file(&pending_index)
                    .map_err(io_error("remove stale media library index transaction"))?;
            } else {
                let bytes = fs::read(&pending_index)
                    .map_err(io_error("read pending media library index"))?;
                decode_index(&bytes)?;
                fs::rename(&pending_index, &final_index)
                    .map_err(io_error("recover media library index"))?;
            }
        }

        Ok(())
    }

    fn load_index(&self) -> Result<LibraryIndex, String> {
        let path = self.index_path();
        if !path.exists() {
            return Ok(LibraryIndex::default());
        }

        let bytes = fs::read(&path).map_err(io_error("read media library index"))?;
        decode_index(&bytes)
    }

    fn write_index(&self, index: &LibraryIndex) -> Result<(), String> {
        self.ensure_dirs()?;
        let bytes = serde_json::to_vec_pretty(index)
            .map_err(|error| format!("serialize media library index: {error}"))?;
        let temporary = self.pending_index_path();
        let final_path = self.index_path();

        let mut file = OpenOptions::new()
            .create(true)
            .truncate(true)
            .write(true)
            .open(&temporary)
            .map_err(io_error("create media library index"))?;
        file.write_all(&bytes)
            .map_err(io_error("write media library index"))?;
        file.sync_all()
            .map_err(io_error("sync media library index"))?;
        drop(file);

        replace_file(&temporary, &final_path).map_err(io_error("commit media library index"))
    }

    fn begin_import(
        &self,
        state: &LibraryImportState,
        name: String,
        mime_type: String,
        expected_size: u64,
    ) -> Result<LibraryImportStarted, String> {
        if expected_size == 0 {
            return Err("cannot import an empty audio file".to_string());
        }
        if expected_size > MAX_TRACK_BYTES {
            return Err(format!(
                "audio file exceeds the {} byte native-library limit",
                MAX_TRACK_BYTES
            ));
        }

        self.ensure_dirs()?;
        let session_id = next_session_id();
        let temp_path = self.imports_dir().join(format!("{session_id}.part"));
        let file = OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(&temp_path)
            .map_err(io_error("create library import"))?;
        let session = ImportSession {
            file,
            temp_path,
            name: safe_display_name(&name),
            mime_type,
            expected_size,
            received_size: 0,
        };

        state
            .sessions
            .lock()
            .map_err(|_| "media library import state is unavailable".to_string())?
            .insert(session_id.clone(), session);

        Ok(LibraryImportStarted {
            session_id,
            max_chunk_bytes: MAX_IMPORT_CHUNK_BYTES,
        })
    }

    fn append_import(
        &self,
        state: &LibraryImportState,
        session_id: &str,
        chunk: &[u8],
    ) -> Result<u64, String> {
        if chunk.is_empty() {
            return Err("library import chunk must not be empty".to_string());
        }
        if chunk.len() > MAX_IMPORT_CHUNK_BYTES {
            return Err(format!(
                "library import chunk exceeds {} bytes",
                MAX_IMPORT_CHUNK_BYTES
            ));
        }

        let mut sessions = state
            .sessions
            .lock()
            .map_err(|_| "media library import state is unavailable".to_string())?;
        let session = sessions
            .get_mut(session_id)
            .ok_or_else(|| "unknown media library import session".to_string())?;
        let next_size = session
            .received_size
            .checked_add(chunk.len() as u64)
            .ok_or_else(|| "media library import size overflow".to_string())?;
        if next_size > session.expected_size {
            return Err("library import received more data than declared".to_string());
        }

        session
            .file
            .write_all(chunk)
            .map_err(io_error("write library import chunk"))?;
        session.received_size = next_size;
        Ok(next_size)
    }

    fn commit_import(
        &self,
        state: &LibraryImportState,
        session_id: &str,
    ) -> Result<LibraryTrack, String> {
        let mut session = state
            .sessions
            .lock()
            .map_err(|_| "media library import state is unavailable".to_string())?
            .remove(session_id)
            .ok_or_else(|| "unknown media library import session".to_string())?;

        if session.received_size != session.expected_size {
            let _ = fs::remove_file(&session.temp_path);
            return Err(format!(
                "library import is incomplete: received {} of {} bytes",
                session.received_size, session.expected_size
            ));
        }

        session
            .file
            .flush()
            .map_err(io_error("flush library import"))?;
        session
            .file
            .sync_all()
            .map_err(io_error("sync library import"))?;

        self.commit_temp_import(session)
    }

    fn abort_import(&self, state: &LibraryImportState, session_id: &str) -> Result<(), String> {
        let session = state
            .sessions
            .lock()
            .map_err(|_| "media library import state is unavailable".to_string())?
            .remove(session_id)
            .ok_or_else(|| "unknown media library import session".to_string())?;
        drop(session.file);
        match fs::remove_file(&session.temp_path) {
            Ok(()) => Ok(()),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(error) => Err(format!("abort media library import: {error}")),
        }
    }

    fn commit_temp_import(&self, session: ImportSession) -> Result<LibraryTrack, String> {
        let ImportSession {
            file,
            temp_path,
            name,
            mime_type,
            expected_size,
            received_size: _,
        } = session;
        drop(file);

        self.ensure_dirs()?;
        let id = sha256_file(&temp_path)?;
        let mut index = self.load_index()?;

        if let Some(existing) = index.tracks.iter().find(|track| track.id == id).cloned() {
            let existing_path = self.track_path(&existing)?;
            if existing_path.exists() {
                let _ = fs::remove_file(&temp_path);
                return Ok(existing);
            }
        }

        let relative_path = library_relative_path(&id, &name);
        let final_path = self.root.join(&relative_path);
        let created_file = if final_path.exists() {
            fs::remove_file(&temp_path).map_err(io_error("discard duplicate library import"))?;
            false
        } else {
            fs::rename(&temp_path, &final_path).map_err(io_error("commit library media file"))?;
            true
        };

        let track = LibraryTrack {
            id: id.clone(),
            name,
            mime_type,
            size: expected_size,
            relative_path,
        };
        index.tracks.retain(|candidate| candidate.id != id);
        index.tracks.push(track.clone());

        if let Err(error) = self.write_index(&index) {
            if created_file {
                let _ = fs::remove_file(&final_path);
            }
            return Err(error);
        }

        Ok(track)
    }

    fn list_tracks(&self) -> Result<Vec<LibraryTrack>, String> {
        Ok(self.load_index()?.tracks)
    }

    fn inspect_integrity(&self) -> Result<LibraryIntegrityReport, String> {
        let index = self.load_index()?;
        let checked_tracks = index.tracks.len();
        let mut healthy_tracks = 0;
        let mut issues = Vec::new();

        for track in &index.tracks {
            if let Err(detail) = validate_track_id(&track.id) {
                issues.push(integrity_issue(
                    track,
                    LibraryIntegrityIssueKind::InvalidId,
                    detail,
                ));
                continue;
            }

            let path = match self.track_path(track) {
                Ok(path) => path,
                Err(detail) => {
                    issues.push(integrity_issue(
                        track,
                        LibraryIntegrityIssueKind::UnsafePath,
                        detail,
                    ));
                    continue;
                }
            };

            let metadata = match fs::metadata(&path) {
                Ok(metadata) => metadata,
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                    issues.push(integrity_issue(
                        track,
                        LibraryIntegrityIssueKind::MissingFile,
                        "media library track file is missing".to_string(),
                    ));
                    continue;
                }
                Err(error) => {
                    issues.push(integrity_issue(
                        track,
                        LibraryIntegrityIssueKind::UnreadableFile,
                        format!("read media library track metadata: {error}"),
                    ));
                    continue;
                }
            };

            if !metadata.is_file() {
                issues.push(integrity_issue(
                    track,
                    LibraryIntegrityIssueKind::UnreadableFile,
                    "media library track path is not a regular file".to_string(),
                ));
                continue;
            }

            if metadata.len() != track.size {
                issues.push(integrity_issue(
                    track,
                    LibraryIntegrityIssueKind::SizeMismatch,
                    format!(
                        "expected {} bytes, found {} bytes",
                        track.size,
                        metadata.len()
                    ),
                ));
                continue;
            }

            let digest = match sha256_file(&path) {
                Ok(digest) => digest,
                Err(detail) => {
                    issues.push(integrity_issue(
                        track,
                        LibraryIntegrityIssueKind::UnreadableFile,
                        detail,
                    ));
                    continue;
                }
            };

            if digest != track.id {
                issues.push(integrity_issue(
                    track,
                    LibraryIntegrityIssueKind::ContentMismatch,
                    "media library track content does not match its stable identity".to_string(),
                ));
                continue;
            }

            healthy_tracks += 1;
        }

        Ok(LibraryIntegrityReport {
            checked_tracks,
            healthy_tracks,
            issues,
        })
    }

    fn resolve_track(&self, id: &str) -> Result<String, String> {
        validate_track_id(id)?;
        let index = self.load_index()?;
        let track = index
            .tracks
            .iter()
            .find(|track| track.id == id)
            .ok_or_else(|| "media library track not found".to_string())?;
        let path = self.track_path(track)?;
        if !path.is_file() {
            return Err("media library track file is missing".to_string());
        }
        path.to_str()
            .map(str::to_owned)
            .ok_or_else(|| "media library track path is not valid UTF-8".to_string())
    }

    fn remove_track(&self, id: &str) -> Result<(), String> {
        validate_track_id(id)?;
        let original = self.load_index()?;
        let track = original
            .tracks
            .iter()
            .find(|track| track.id == id)
            .cloned()
            .ok_or_else(|| "media library track not found".to_string())?;
        let path = self.track_path(&track)?;
        let mut updated = original.clone();
        updated.tracks.retain(|candidate| candidate.id != id);
        self.write_index(&updated)?;

        match fs::remove_file(path) {
            Ok(()) => Ok(()),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(error) => {
                let restore = self.write_index(&original);
                match restore {
                    Ok(()) => Err(format!("remove media library track: {error}")),
                    Err(restore_error) => Err(format!(
                        "remove media library track: {error}; failed to restore index: {restore_error}"
                    )),
                }
            }
        }
    }

    fn track_path(&self, track: &LibraryTrack) -> Result<PathBuf, String> {
        let relative = Path::new(&track.relative_path);
        if relative.is_absolute()
            || !relative.starts_with(Path::new("media"))
            || relative
                .components()
                .any(|component| !matches!(component, Component::Normal(_)))
        {
            return Err("media library index contains an unsafe path".to_string());
        }
        Ok(self.root.join(relative))
    }
}

pub fn recover_library(app: &tauri::AppHandle) -> Result<(), String> {
    library_store(app)?.recover_startup()
}

fn library_store(app: &tauri::AppHandle) -> Result<LibraryStore, String> {
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("resolve app data directory: {error}"))?;
    Ok(LibraryStore::new(app_data.join("media-library")))
}

#[tauri::command]
pub fn begin_library_import(
    app: tauri::AppHandle,
    state: tauri::State<'_, LibraryImportState>,
    name: String,
    mime_type: Option<String>,
    expected_size: u64,
) -> Result<LibraryImportStarted, String> {
    library_store(&app)?.begin_import(&state, name, mime_type.unwrap_or_default(), expected_size)
}

#[tauri::command]
pub fn append_library_import(
    app: tauri::AppHandle,
    state: tauri::State<'_, LibraryImportState>,
    session_id: String,
    chunk: Vec<u8>,
) -> Result<u64, String> {
    library_store(&app)?.append_import(&state, &session_id, &chunk)
}

#[tauri::command]
pub fn commit_library_import(
    app: tauri::AppHandle,
    state: tauri::State<'_, LibraryImportState>,
    session_id: String,
) -> Result<LibraryTrack, String> {
    library_store(&app)?.commit_import(&state, &session_id)
}

#[tauri::command]
pub fn abort_library_import(
    app: tauri::AppHandle,
    state: tauri::State<'_, LibraryImportState>,
    session_id: String,
) -> Result<(), String> {
    library_store(&app)?.abort_import(&state, &session_id)
}

#[tauri::command]
pub fn list_library_tracks(app: tauri::AppHandle) -> Result<Vec<LibraryTrack>, String> {
    library_store(&app)?.list_tracks()
}

#[tauri::command]
pub fn inspect_library_integrity(
    app: tauri::AppHandle,
) -> Result<LibraryIntegrityReport, String> {
    library_store(&app)?.inspect_integrity()
}

#[tauri::command]
pub fn resolve_library_track(app: tauri::AppHandle, id: String) -> Result<String, String> {
    library_store(&app)?.resolve_track(&id)
}

#[tauri::command]
pub fn remove_library_track(app: tauri::AppHandle, id: String) -> Result<(), String> {
    library_store(&app)?.remove_track(&id)
}

fn decode_index(bytes: &[u8]) -> Result<LibraryIndex, String> {
    let index: LibraryIndex = serde_json::from_slice(bytes)
        .map_err(|error| format!("parse media library index: {error}"))?;
    migrate_index(index)
}

fn migrate_index(index: LibraryIndex) -> Result<LibraryIndex, String> {
    match index.version {
        INDEX_VERSION => Ok(index),
        version => Err(format!("unsupported media library index version {version}")),
    }
}

fn integrity_issue(
    track: &LibraryTrack,
    kind: LibraryIntegrityIssueKind,
    detail: String,
) -> LibraryIntegrityIssue {
    LibraryIntegrityIssue {
        id: track.id.clone(),
        name: track.name.clone(),
        kind,
        detail,
    }
}

fn next_session_id() -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let counter = IMPORT_COUNTER.fetch_add(1, Ordering::Relaxed);
    format!("{nanos:x}-{counter:x}")
}

fn safe_display_name(name: &str) -> String {
    Path::new(name)
        .file_name()
        .and_then(|value| value.to_str())
        .filter(|value| !value.trim().is_empty())
        .unwrap_or("audio")
        .to_string()
}

fn normalized_extension(name: &str) -> Option<String> {
    let extension = Path::new(name).extension()?.to_str()?.to_ascii_lowercase();
    if extension.is_empty()
        || extension.len() > 10
        || !extension
            .chars()
            .all(|character| character.is_ascii_alphanumeric())
    {
        return None;
    }
    Some(extension)
}

fn library_relative_path(id: &str, name: &str) -> String {
    match normalized_extension(name) {
        Some(extension) => format!("media/{id}.{extension}"),
        None => format!("media/{id}"),
    }
}

fn validate_track_id(id: &str) -> Result<(), String> {
    if id.len() == 64 && id.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        Ok(())
    } else {
        Err("invalid media library track id".to_string())
    }
}

fn sha256_file(path: &Path) -> Result<String, String> {
    let mut file = File::open(path).map_err(io_error("open library media for hashing"))?;
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let read = file
            .read(&mut buffer)
            .map_err(io_error("hash library media"))?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }

    let digest = hasher.finalize();
    let mut encoded = String::with_capacity(digest.len() * 2);
    for byte in digest {
        let _ = write!(&mut encoded, "{byte:02x}");
    }
    Ok(encoded)
}

fn replace_file(source: &Path, target: &Path) -> std::io::Result<()> {
    match fs::rename(source, target) {
        Ok(()) => Ok(()),
        Err(error) if target.exists() => {
            fs::remove_file(target)?;
            fs::rename(source, target).map_err(|_| error)
        }
        Err(error) => Err(error),
    }
}

fn io_error(context: &'static str) -> impl FnOnce(std::io::Error) -> String {
    move |error| format!("{context}: {error}")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_store(name: &str) -> LibraryStore {
        let unique = next_session_id();
        let root = std::env::temp_dir().join(format!("media-player-{name}-{unique}"));
        let _ = fs::remove_dir_all(&root);
        LibraryStore::new(root)
    }

    fn import_bytes(store: &LibraryStore, name: &str, bytes: &[u8]) -> LibraryTrack {
        store.ensure_dirs().unwrap();
        let temp_path = store
            .imports_dir()
            .join(format!("{}.part", next_session_id()));
        fs::write(&temp_path, bytes).unwrap();
        let file = OpenOptions::new().append(true).open(&temp_path).unwrap();
        store
            .commit_temp_import(ImportSession {
                file,
                temp_path,
                name: safe_display_name(name),
                mime_type: "audio/mpeg".to_string(),
                expected_size: bytes.len() as u64,
                received_size: bytes.len() as u64,
            })
            .unwrap()
    }

    #[test]
    fn content_hash_is_stable_and_duplicate_import_is_idempotent() {
        let store = test_store("idempotent");
        let first = import_bytes(&store, "../Song.MP3", b"abc");
        let second = import_bytes(&store, "another.mp3", b"abc");

        assert_eq!(
            first.id,
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
        assert_eq!(first, second);
        assert_eq!(first.name, "Song.MP3");
        assert_eq!(store.list_tracks().unwrap(), vec![first]);
        let _ = fs::remove_dir_all(&store.root);
    }

    #[test]
    fn chunked_import_rejects_incomplete_commit_and_cleans_temp_file() {
        let store = test_store("incomplete");
        let state = LibraryImportState::default();
        let started = store
            .begin_import(&state, "song.mp3".to_string(), "audio/mpeg".to_string(), 4)
            .unwrap();
        store
            .append_import(&state, &started.session_id, b"ab")
            .unwrap();
        let error = store
            .commit_import(&state, &started.session_id)
            .unwrap_err();

        assert!(error.contains("incomplete"));
        assert!(store.list_tracks().unwrap().is_empty());
        assert!(fs::read_dir(store.imports_dir()).unwrap().next().is_none());
        let _ = fs::remove_dir_all(&store.root);
    }

    #[test]
    fn startup_recovery_removes_only_stale_import_parts() {
        let store = test_store("startup-import-recovery");
        store.ensure_dirs().unwrap();
        let stale = store.imports_dir().join("stale.part");
        let unrelated = store.imports_dir().join("keep.tmp");
        let committed = store.media_dir().join("committed.mp3");
        fs::write(&stale, b"partial").unwrap();
        fs::write(&unrelated, b"keep").unwrap();
        fs::write(&committed, b"media").unwrap();

        store.recover_startup().unwrap();

        assert!(!stale.exists());
        assert!(unrelated.exists());
        assert!(committed.exists());
        let _ = fs::remove_dir_all(&store.root);
    }

    #[test]
    fn startup_recovery_promotes_a_valid_pending_index_when_final_is_missing() {
        let store = test_store("startup-index-recovery");
        store.ensure_dirs().unwrap();
        let index = LibraryIndex::default();
        fs::write(
            store.pending_index_path(),
            serde_json::to_vec_pretty(&index).unwrap(),
        )
        .unwrap();

        store.recover_startup().unwrap();

        assert!(!store.pending_index_path().exists());
        assert!(store.index_path().is_file());
        assert_eq!(store.load_index().unwrap(), index);
        let _ = fs::remove_dir_all(&store.root);
    }

    #[test]
    fn persisted_index_can_be_reopened_and_track_removed() {
        let store = test_store("persisted");
        let track = import_bytes(&store, "song.flac", b"persistent audio");
        let reopened = LibraryStore::new(store.root.clone());

        assert_eq!(reopened.list_tracks().unwrap(), vec![track.clone()]);
        assert!(Path::new(&reopened.resolve_track(&track.id).unwrap()).is_file());

        reopened.remove_track(&track.id).unwrap();
        assert!(reopened.list_tracks().unwrap().is_empty());
        assert!(reopened.resolve_track(&track.id).is_err());
        let _ = fs::remove_dir_all(&store.root);
    }

    #[test]
    fn integrity_inspection_reports_damage_without_mutating_the_library() {
        let store = test_store("integrity");
        let healthy = import_bytes(&store, "healthy.mp3", b"healthy");
        let missing = import_bytes(&store, "missing.mp3", b"missing");
        let wrong_size = import_bytes(&store, "wrong-size.mp3", b"size");
        let wrong_content = import_bytes(&store, "wrong-content.mp3", b"same");

        fs::remove_file(store.track_path(&missing).unwrap()).unwrap();
        fs::write(store.track_path(&wrong_size).unwrap(), b"different length").unwrap();
        fs::write(store.track_path(&wrong_content).unwrap(), b"else").unwrap();
        let index_before = fs::read(store.index_path()).unwrap();

        let report = store.inspect_integrity().unwrap();

        assert_eq!(report.checked_tracks, 4);
        assert_eq!(report.healthy_tracks, 1);
        assert_eq!(report.issues.len(), 3);
        assert!(report.issues.iter().any(|issue| {
            issue.id == missing.id && issue.kind == LibraryIntegrityIssueKind::MissingFile
        }));
        assert!(report.issues.iter().any(|issue| {
            issue.id == wrong_size.id && issue.kind == LibraryIntegrityIssueKind::SizeMismatch
        }));
        assert!(report.issues.iter().any(|issue| {
            issue.id == wrong_content.id
                && issue.kind == LibraryIntegrityIssueKind::ContentMismatch
        }));
        assert_eq!(fs::read(store.index_path()).unwrap(), index_before);
        assert!(store.track_path(&healthy).unwrap().is_file());
        let _ = fs::remove_dir_all(&store.root);
    }

    #[test]
    fn future_index_versions_fail_closed_without_overwriting_evidence() {
        let store = test_store("future-index");
        store.ensure_dirs().unwrap();
        let future = LibraryIndex {
            version: INDEX_VERSION + 1,
            tracks: Vec::new(),
        };
        let bytes = serde_json::to_vec_pretty(&future).unwrap();
        fs::write(store.index_path(), &bytes).unwrap();

        let error = store.load_index().unwrap_err();

        assert!(error.contains("unsupported media library index version"));
        assert_eq!(fs::read(store.index_path()).unwrap(), bytes);
        let _ = fs::remove_dir_all(&store.root);
    }

    #[test]
    fn invalid_pending_index_is_preserved_for_diagnosis() {
        let store = test_store("invalid-pending-index");
        store.ensure_dirs().unwrap();
        let pending = store.pending_index_path();
        let bytes = br#"{"version":2,"tracks":[]}"#;
        fs::write(&pending, bytes).unwrap();

        let error = store.recover_startup().unwrap_err();

        assert!(error.contains("unsupported media library index version"));
        assert_eq!(fs::read(&pending).unwrap(), bytes);
        assert!(!store.index_path().exists());
        let _ = fs::remove_dir_all(&store.root);
    }

    #[test]
    fn library_tracks_cannot_escape_the_media_directory() {
        let store = test_store("non-media-path");
        let track = LibraryTrack {
            id: "a".repeat(64),
            name: "song.mp3".to_string(),
            mime_type: "audio/mpeg".to_string(),
            size: 3,
            relative_path: "library-v1.json".to_string(),
        };

        assert!(store.track_path(&track).is_err());
        let _ = fs::remove_dir_all(&store.root);
    }

    #[test]
    fn unsafe_index_paths_are_rejected() {
        let store = test_store("unsafe");
        let track = LibraryTrack {
            id: "a".repeat(64),
            name: "song.mp3".to_string(),
            mime_type: "audio/mpeg".to_string(),
            size: 3,
            relative_path: "../outside.mp3".to_string(),
        };

        assert!(store.track_path(&track).is_err());
        let _ = fs::remove_dir_all(&store.root);
    }
}
