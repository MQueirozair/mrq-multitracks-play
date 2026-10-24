// Comandos de arquivo que não cabem bem nos plugins oficiais (dialog/fs) —
// aqui usamos std::fs diretamente, sem passar pelas "capabilities"/escopo do
// plugin tauri-plugin-fs, porque a pasta de músicas do usuário pode estar em
// qualquer lugar do disco (inclusive outra unidade, no Windows) e o app
// precisa do mesmo acesso livre que já tinha no processo principal do
// Electron.

use serde::Serialize;

#[derive(Serialize)]
pub struct TrackEntry {
    pub name: String,
    #[serde(rename = "filePath")]
    pub file_path: String,
}

const AUDIO_EXTENSIONS: &[&str] = &[
    "wav", "wave", "mp3", "flac", "aiff", "aif", "aifc", "ogg", "oga", "opus", "m4a", "mp4",
    "m4b", "aac", "wma", "webm", "caf", "3gp",
];

#[tauri::command]
pub async fn scan_folder_tracks(folder_path: String) -> Result<Vec<TrackEntry>, String> {
    let dir = std::path::PathBuf::from(&folder_path);
    let mut entries = tokio::fs::read_dir(&dir)
        .await
        .map_err(|e| format!("falha ao ler pasta: {e}"))?;

    let mut tracks = Vec::new();
    while let Some(entry) = entries
        .next_entry()
        .await
        .map_err(|e| format!("falha ao listar pasta: {e}"))?
    {
        let path = entry.path();
        let file_type = match entry.file_type().await {
            Ok(ft) => ft,
            Err(_) => continue,
        };
        if !file_type.is_file() {
            continue;
        }
        let ext = path
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_lowercase();
        if !AUDIO_EXTENSIONS.contains(&ext.as_str()) {
            continue;
        }
        let stem = path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_string();
        tracks.push(TrackEntry {
            name: stem,
            file_path: path.to_string_lossy().to_string(),
        });
    }

    // locale 'pt-BR' real exigiria uma crate de collation; localeCompare
    // simples por ordinal já cobre os casos práticos (nomes de faixa comuns).
    tracks.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(tracks)
}

#[tauri::command]
pub fn local_addresses() -> Vec<String> {
    match if_addrs::get_if_addrs() {
        Ok(addrs) => addrs
            .into_iter()
            .filter(|a| !a.is_loopback())
            .filter_map(|a| match a.addr {
                if_addrs::IfAddr::V4(v4) => Some(v4.ip.to_string()),
                _ => None,
            })
            .collect(),
        Err(_) => Vec::new(),
    }
}
