//! Plain-text file storage for Throughline artifacts.
//!
//! The source of truth is a directory on disk (typically inside the user's own
//! git repo). Each artifact is a single `.md` file — YAML frontmatter plus a
//! markdown body — stored under a per-kind subfolder:
//!
//! ```text
//! <project>/
//!   stakeholders/   SH-001.md, SH-002.md, ...
//!   needs/          N-001.md, N-002.md, ...
//!   use-cases/      UC-001.md, ...
//!   requirements/   R-001.md, ...
//!   components/     C-001.md, ...
//!   flows/          FL-001.md, ...
//! ```
//!
//! Rust deliberately does no YAML parsing: it moves raw file text in and out and
//! lets the TypeScript layer own the schema. That keeps the model in one place.

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Duration;

use notify::{RecommendedWatcher, RecursiveMode};
use notify_debouncer_mini::{new_debouncer, DebounceEventResult, Debouncer};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};

/// The artifact kinds in this slice, and their on-disk folder names.
const KIND_DIRS: &[(&str, &str)] = &[
    ("stakeholder", "stakeholders"),
    ("need", "needs"),
    ("use-case", "use-cases"),
    ("requirement", "requirements"),
    ("component", "components"),
    ("flow", "flows"),
];

/// A single artifact file as raw text, tagged with its kind.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ArtifactFile {
    /// Logical kind: "need" | "use-case" | "requirement".
    pub kind: String,
    /// File name only, e.g. "N-001.md".
    pub filename: String,
    /// Full raw file contents (frontmatter + body).
    pub content: String,
}

fn dir_for_kind(kind: &str) -> Result<&'static str, String> {
    KIND_DIRS
        .iter()
        .find(|(k, _)| *k == kind)
        .map(|(_, d)| *d)
        .ok_or_else(|| format!("unknown artifact kind: {kind}"))
}

/// Reject anything that could escape the artifact folder.
fn safe_filename(name: &str) -> Result<&str, String> {
    if name.is_empty()
        || name.contains('/')
        || name.contains('\\')
        || name.contains("..")
        || Path::new(name).is_absolute()
    {
        return Err(format!("unsafe filename: {name}"));
    }
    Ok(name)
}

fn kind_path(project_dir: &str, kind: &str) -> Result<PathBuf, String> {
    Ok(Path::new(project_dir).join(dir_for_kind(kind)?))
}

/// Create the project directory and the per-kind subfolders if they don't exist.
#[tauri::command]
pub fn ensure_project(project_dir: String) -> Result<(), String> {
    for (_, dir) in KIND_DIRS {
        let p = Path::new(&project_dir).join(dir);
        fs::create_dir_all(&p).map_err(|e| format!("creating {}: {e}", p.display()))?;
    }
    Ok(())
}

/// Read every artifact file across all kinds. Missing folders are treated as empty.
#[tauri::command]
pub fn read_project(project_dir: String) -> Result<Vec<ArtifactFile>, String> {
    let mut out = Vec::new();
    for (kind, dir) in KIND_DIRS {
        let folder = Path::new(&project_dir).join(dir);
        if !folder.exists() {
            continue;
        }
        let entries = fs::read_dir(&folder).map_err(|e| format!("reading {}: {e}", folder.display()))?;
        for entry in entries {
            let entry = entry.map_err(|e| e.to_string())?;
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) != Some("md") {
                continue;
            }
            let filename = path
                .file_name()
                .and_then(|f| f.to_str())
                .ok_or("bad file name")?
                .to_string();
            let content =
                fs::read_to_string(&path).map_err(|e| format!("reading {}: {e}", path.display()))?;
            out.push(ArtifactFile {
                kind: (*kind).to_string(),
                filename,
                content,
            });
        }
    }
    Ok(out)
}

/// Write (create or overwrite) a single artifact file.
#[tauri::command]
pub fn write_artifact(
    project_dir: String,
    kind: String,
    filename: String,
    content: String,
) -> Result<(), String> {
    let name = safe_filename(&filename)?;
    let folder = kind_path(&project_dir, &kind)?;
    fs::create_dir_all(&folder).map_err(|e| format!("creating {}: {e}", folder.display()))?;
    let target = folder.join(name);
    fs::write(&target, content).map_err(|e| format!("writing {}: {e}", target.display()))?;
    Ok(())
}

/// Delete a single artifact file. A missing file is not an error.
#[tauri::command]
pub fn delete_artifact(project_dir: String, kind: String, filename: String) -> Result<(), String> {
    let name = safe_filename(&filename)?;
    let target = kind_path(&project_dir, &kind)?.join(name);
    if target.exists() {
        fs::remove_file(&target).map_err(|e| format!("deleting {}: {e}", target.display()))?;
    }
    Ok(())
}

/// Event emitted to the frontend when `.md` files change on disk. The payload is
/// the list of changed file basenames (e.g. `["N-001.md", "R-004.md"]`).
pub const CHANGE_EVENT: &str = "project-files-changed";

/// Holds the active filesystem watcher for the lifetime of the app. Kept in
/// Tauri-managed state so it isn't dropped (which would stop watching) and so
/// opening a different project folder can replace it.
#[derive(Default)]
pub struct WatcherState(pub Mutex<Option<Debouncer<RecommendedWatcher>>>);

/// Start (or restart) watching a project folder for external `.md` edits — made
/// by an editor, an LLM, git, or anything outside the app — and forward them to
/// the frontend as [`CHANGE_EVENT`].
///
/// Writes the app makes itself are seen here too; the frontend tracks its own
/// saves and only reloads on genuinely external changes. Events are debounced so
/// a burst of edits collapses into a single notification.
#[tauri::command]
pub fn watch_project(
    app: AppHandle,
    state: State<'_, WatcherState>,
    project_dir: String,
) -> Result<(), String> {
    let root = Path::new(&project_dir).to_path_buf();
    if !root.exists() {
        return Err(format!("project folder does not exist: {}", root.display()));
    }

    let app_handle = app.clone();
    let mut debouncer = new_debouncer(
        Duration::from_millis(300),
        move |result: DebounceEventResult| {
            let events = match result {
                Ok(events) => events,
                Err(_) => return,
            };
            let mut files: Vec<String> = events
                .iter()
                .filter(|e| e.path.extension().and_then(|x| x.to_str()) == Some("md"))
                .filter_map(|e| e.path.file_name().and_then(|f| f.to_str()).map(String::from))
                .collect();
            files.sort();
            files.dedup();
            if !files.is_empty() {
                let _ = app_handle.emit(CHANGE_EVENT, files);
            }
        },
    )
    .map_err(|e| format!("creating watcher: {e}"))?;

    // Watch the whole project folder recursively so every per-kind subfolder is
    // covered, including ones created after the watch starts.
    debouncer
        .watcher()
        .watch(&root, RecursiveMode::Recursive)
        .map_err(|e| format!("watching {}: {e}", root.display()))?;

    // Replace any previous watcher; dropping it stops the old folder's watch.
    *state.0.lock().map_err(|e| e.to_string())? = Some(debouncer);
    Ok(())
}
