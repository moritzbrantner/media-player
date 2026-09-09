use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs::{self, File, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use tauri::Manager;

const STATE_VERSION: u32 = 1;
const STATE_FILE: &str = "playback-state-v1.json";
const MAX_QUEUE_TRACKS: usize = 500;
const MAX_POSITION_SECONDS: f64 = 365.0 * 24.0 * 60.0 * 60.0;

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaybackStateSnapshot {
    pub queue_track_ids: Vec<String>,
    pub current_track_id: Option<String>,
    pub position_seconds: f64,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
struct PlaybackStateFile {
    version: u32,
    queue_track_ids: Vec<String>,
    current_track_id: Option<String>,
    position_seconds: f64,
}

impl PlaybackStateFile {
    fn from_snapshot(snapshot: PlaybackStateSnapshot) -> Self {
        Self {
            version: STATE_VERSION,
            queue_track_ids: snapshot.queue_track_ids,
            current_track_id: snapshot.current_track_id,
            position_seconds: snapshot.position_seconds,
        }
    }

    fn snapshot(self) -> PlaybackStateSnapshot {
        PlaybackStateSnapshot {
            queue_track_ids: self.queue_track_ids,
            current_track_id: self.current_track_id,
            position_seconds: self.position_seconds,
        }
    }
}

#[derive(Clone)]
struct PlaybackStateStore {
    root: PathBuf,
}

impl PlaybackStateStore {
    fn new(root: PathBuf) -> Self {
        Self { root }
    }

    fn state_path(&self) -> PathBuf {
        self.root.join(STATE_FILE)
    }

    fn pending_path(&self) -> PathBuf {
        self.root.join(format!("{STATE_FILE}.new"))
    }

    fn lock_path(&self) -> PathBuf {
        self.root.join("playback-state.lock")
    }

    fn ensure_dir(&self) -> Result<(), String> {
        fs::create_dir_all(&self.root).map_err(io_error("create playback state directory"))
    }

    fn with_lock<T>(&self, operation: impl FnOnce() -> Result<T, String>) -> Result<T, String> {
        self.ensure_dir()?;
        let lock_file = OpenOptions::new()
            .create(true)
            .read(true)
            .write(true)
            .open(self.lock_path())
            .map_err(io_error("open playback state lock"))?;
        lock_file
            .lock()
            .map_err(io_error("lock playback state"))?;
        let result = operation();
        drop(lock_file);
        result
    }

    fn recover_transaction_unlocked(&self) -> Result<(), String> {
        let pending = self.pending_path();
        let committed = self.state_path();
        if !pending.exists() {
            return Ok(());
        }

        if committed.exists() {
            fs::remove_file(pending).map_err(io_error("remove stale playback state transaction"))?;
            return Ok(());
        }

        let bytes = fs::read(&pending).map_err(io_error("read pending playback state"))?;
        decode_state(&bytes)?;
        fs::rename(&pending, &committed).map_err(io_error("recover playback state"))
    }

    fn load(&self) -> Result<Option<PlaybackStateSnapshot>, String> {
        self.with_lock(|| {
            self.recover_transaction_unlocked()?;
            let path = self.state_path();
            if !path.exists() {
                return Ok(None);
            }
            let bytes = fs::read(path).map_err(io_error("read playback state"))?;
            Ok(Some(decode_state(&bytes)?.snapshot()))
        })
    }

    fn save(&self, snapshot: PlaybackStateSnapshot) -> Result<(), String> {
        validate_snapshot(&snapshot)?;
        self.with_lock(|| {
            self.recover_transaction_unlocked()?;
            let committed = self.state_path();
            if committed.exists() {
                let existing = fs::read(&committed).map_err(io_error("read existing playback state"))?;
                decode_state(&existing)?;
            }

            let state = PlaybackStateFile::from_snapshot(snapshot);
            let bytes = serde_json::to_vec_pretty(&state)
                .map_err(|error| format!("serialize playback state: {error}"))?;
            let pending = self.pending_path();
            let mut file = OpenOptions::new()
                .create(true)
                .truncate(true)
                .write(true)
                .open(&pending)
                .map_err(io_error("create playback state transaction"))?;
            file.write_all(&bytes)
                .map_err(io_error("write playback state transaction"))?;
            file.sync_all()
                .map_err(io_error("sync playback state transaction"))?;
            drop(file);
            replace_file(&pending, &committed).map_err(io_error("commit playback state"))
        })
    }
}

fn playback_state_store(app: &tauri::AppHandle) -> Result<PlaybackStateStore, String> {
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("resolve app data directory: {error}"))?;
    Ok(PlaybackStateStore::new(app_data.join("playback-state")))
}

#[tauri::command]
pub fn load_playback_state(
    app: tauri::AppHandle,
) -> Result<Option<PlaybackStateSnapshot>, String> {
    playback_state_store(&app)?.load()
}

#[tauri::command]
pub fn save_playback_state(
    app: tauri::AppHandle,
    state: PlaybackStateSnapshot,
) -> Result<(), String> {
    playback_state_store(&app)?.save(state)
}

fn decode_state(bytes: &[u8]) -> Result<PlaybackStateFile, String> {
    let state: PlaybackStateFile = serde_json::from_slice(bytes)
        .map_err(|error| format!("parse playback state: {error}"))?;
    if state.version != STATE_VERSION {
        return Err(format!(
            "unsupported playback state version {}",
            state.version
        ));
    }
    validate_snapshot(&state.clone().snapshot())?;
    Ok(state)
}

fn validate_snapshot(snapshot: &PlaybackStateSnapshot) -> Result<(), String> {
    if snapshot.queue_track_ids.len() > MAX_QUEUE_TRACKS {
        return Err(format!(
            "playback queue exceeds the {MAX_QUEUE_TRACKS}-track persistence limit"
        ));
    }

    let mut unique = HashSet::with_capacity(snapshot.queue_track_ids.len());
    for id in &snapshot.queue_track_ids {
        validate_track_id(id)?;
        if !unique.insert(id) {
            return Err("playback state contains a duplicate track id".to_string());
        }
    }

    if let Some(current) = &snapshot.current_track_id {
        validate_track_id(current)?;
        if !unique.contains(current) {
            return Err("playback state current track is not in its queue".to_string());
        }
    } else if snapshot.position_seconds != 0.0 {
        return Err("playback state without a current track must have zero position".to_string());
    }

    if !snapshot.position_seconds.is_finite()
        || snapshot.position_seconds < 0.0
        || snapshot.position_seconds > MAX_POSITION_SECONDS
    {
        return Err("playback state position is outside the supported range".to_string());
    }

    Ok(())
}

fn validate_track_id(id: &str) -> Result<(), String> {
    if id.len() == 64 && id.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        Ok(())
    } else {
        Err("invalid playback-state track id".to_string())
    }
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

    fn test_store(name: &str) -> PlaybackStateStore {
        let root = std::env::temp_dir().join(format!(
            "media-player-playback-state-{name}-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&root);
        PlaybackStateStore::new(root)
    }

    fn id(character: char) -> String {
        character.to_string().repeat(64)
    }

    fn snapshot() -> PlaybackStateSnapshot {
        PlaybackStateSnapshot {
            queue_track_ids: vec![id('a'), id('b')],
            current_track_id: Some(id('b')),
            position_seconds: 42.5,
        }
    }

    #[test]
    fn playback_state_round_trips_transactionally() {
        let store = test_store("roundtrip");
        let expected = snapshot();

        store.save(expected.clone()).unwrap();

        assert_eq!(store.load().unwrap(), Some(expected));
        assert!(!store.pending_path().exists());
        let _ = fs::remove_dir_all(&store.root);
    }

    #[test]
    fn valid_pending_state_is_recovered_when_committed_state_is_missing() {
        let store = test_store("recover");
        store.ensure_dir().unwrap();
        let expected = PlaybackStateFile::from_snapshot(snapshot());
        fs::write(
            store.pending_path(),
            serde_json::to_vec_pretty(&expected).unwrap(),
        )
        .unwrap();

        assert_eq!(store.load().unwrap(), Some(expected.clone().snapshot()));
        assert!(store.state_path().is_file());
        assert!(!store.pending_path().exists());
        let _ = fs::remove_dir_all(&store.root);
    }

    #[test]
    fn future_committed_state_blocks_overwrite_and_preserves_evidence() {
        let store = test_store("future");
        store.ensure_dir().unwrap();
        let future = serde_json::json!({
            "version": STATE_VERSION + 1,
            "queueTrackIds": [],
            "currentTrackId": null,
            "positionSeconds": 0.0,
        });
        let bytes = serde_json::to_vec_pretty(&future).unwrap();
        fs::write(store.state_path(), &bytes).unwrap();

        let error = store.save(snapshot()).unwrap_err();

        assert!(error.contains("unsupported playback state version"));
        assert_eq!(fs::read(store.state_path()).unwrap(), bytes);
        let _ = fs::remove_dir_all(&store.root);
    }

    #[test]
    fn invalid_pending_state_blocks_save_without_destroying_transaction() {
        let store = test_store("invalid-pending");
        store.ensure_dir().unwrap();
        let bytes = b"not-json";
        fs::write(store.pending_path(), bytes).unwrap();

        let error = store.save(snapshot()).unwrap_err();

        assert!(error.contains("parse playback state"));
        assert_eq!(fs::read(store.pending_path()).unwrap(), bytes);
        assert!(!store.state_path().exists());
        let _ = fs::remove_dir_all(&store.root);
    }

    #[test]
    fn playback_state_requires_unique_stable_ids_and_current_membership() {
        let duplicate = PlaybackStateSnapshot {
            queue_track_ids: vec![id('a'), id('a')],
            current_track_id: Some(id('a')),
            position_seconds: 0.0,
        };
        assert!(validate_snapshot(&duplicate).unwrap_err().contains("duplicate"));

        let missing_current = PlaybackStateSnapshot {
            queue_track_ids: vec![id('a')],
            current_track_id: Some(id('b')),
            position_seconds: 0.0,
        };
        assert!(validate_snapshot(&missing_current)
            .unwrap_err()
            .contains("not in its queue"));
    }

    #[test]
    fn playback_state_without_current_track_requires_zero_position() {
        let invalid = PlaybackStateSnapshot {
            queue_track_ids: vec![id('a')],
            current_track_id: None,
            position_seconds: 1.0,
        };
        assert!(validate_snapshot(&invalid)
            .unwrap_err()
            .contains("zero position"));
    }
}
