use std::{fs, path::{Path, PathBuf}, sync::Arc};

use serde::Serialize;
use tauri::{ipc::Response, State};

use crate::{
    engine::{CacheStats, PerformanceConfig, ViewerEngine},
    transforms::{GALVOS, Transform2D},
};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GalvoFolderInfo {
    pub folder: u8,
    pub id: &'static str,
    pub layer_count: usize,
    pub min_layer: Option<u32>,
    pub max_layer: Option<u32>,
    pub transform: Transform2D,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DatasetInfo {
    pub root: String,
    pub total_layers: u32,
    pub available_layers: Vec<u32>,
    pub galvos: Vec<GalvoFolderInfo>,
    pub warnings: Vec<String>,
}

fn vtk_layers(folder: &Path) -> Result<Vec<u32>, String> {
    if !folder.is_dir() {
        return Ok(Vec::new());
    }

    let mut layers = Vec::new();
    let entries = fs::read_dir(folder)
        .map_err(|e| format!("无法读取目录 {}: {e}", folder.display()))?;

    for entry in entries {
        let entry = entry.map_err(|e| format!("读取目录项失败: {e}"))?;
        let path = entry.path();
        if path.extension().and_then(|v| v.to_str()).map(|v| v.eq_ignore_ascii_case("vtk")) != Some(true) {
            continue;
        }
        if let Some(stem) = path.file_stem().and_then(|v| v.to_str()) {
            if let Ok(layer) = stem.parse::<u32>() {
                layers.push(layer);
            }
        }
    }
    layers.sort_unstable();
    layers.dedup();
    Ok(layers)
}

fn first_vtk_header(path: &Path) -> Option<String> {
    use std::io::Read;
    let mut file = fs::File::open(path).ok()?;
    let mut bytes = vec![0u8; 2048];
    let n = file.read(&mut bytes).ok()?;
    bytes.truncate(n);
    Some(String::from_utf8_lossy(&bytes).into_owned())
}

#[tauri::command]
pub fn scan_dataset(root: String, engine: State<'_, Arc<ViewerEngine>>) -> Result<DatasetInfo, String> {
    let root_path = PathBuf::from(&root);
    if !root_path.is_dir() {
        return Err("选择的路径不是有效文件夹".into());
    }
    engine.set_root(&root_path);

    let mut infos = Vec::with_capacity(24);
    let mut warnings = Vec::new();
    let mut global_max = None::<u32>;
    let mut all_layers = std::collections::BTreeSet::<u32>::new();

    for definition in GALVOS {
        let folder_path = root_path.join(definition.folder.to_string());
        let layers = vtk_layers(&folder_path)?;
        for layer in &layers { all_layers.insert(*layer); }
        let min_layer = layers.first().copied();
        let max_layer = layers.last().copied();

        if layers.is_empty() {
            warnings.push(format!("{}（文件夹 {}）没有找到按数字命名的 VTK 文件", definition.id, definition.folder));
        } else {
            global_max = Some(global_max.map_or(max_layer.unwrap(), |m| m.max(max_layer.unwrap())));
            if let Some(first) = min_layer {
                let first_file = folder_path.join(format!("{first}.vtk"));
                if let Some(header) = first_vtk_header(&first_file) {
                    let upper = header.to_ascii_uppercase();
                    if !upper.contains("ASCII") || !upper.contains("DATASET POLYDATA") {
                        warnings.push(format!("{} 的 {} 不是当前高速路径支持的 Legacy ASCII POLYDATA", definition.id, first_file.display()));
                    }
                }
            }
        }

        infos.push(GalvoFolderInfo {
            folder: definition.folder,
            id: definition.id,
            layer_count: layers.len(),
            min_layer,
            max_layer,
            transform: definition.transform,
        });
    }

    let available_layers: Vec<u32> = all_layers.iter().copied().collect();
    engine.set_available_layers(&root_path, available_layers.clone());

    if let Some(max_layer) = global_max {
        let existing = all_layers.len() as u32;
        let expected = max_layer.saturating_add(1);
        if existing < expected {
            warnings.push(format!("检测到 {} 个整层缺失；播放时将自动跳过", expected - existing));
        }
    }

    Ok(DatasetInfo {
        root,
        total_layers: global_max.map_or(0, |v| v.saturating_add(1)),
        available_layers,
        galvos: infos,
        warnings,
    })
}

/// 第二轮主加载路径：
/// - scrub/exact: latest-wins，新的请求会取消旧 ASCII 解析；
/// - playback: 当前帧不被下一帧打断，前端只保留最新待播层；
/// - scrub 不触发前后预加载，避免拖动期间抢占 SSD/CPU；
/// - exact/playback 完成后恢复预加载。
#[tauri::command]
pub async fn load_layer_fast(
    root: String,
    layer: u32,
    total_layers: u32,
    request_mode: Option<String>,
    engine: State<'_, Arc<ViewerEngine>>,
) -> Result<Response, String> {
    let mode = request_mode.as_deref().unwrap_or("exact");
    let root_path = PathBuf::from(root);
    let engine = engine.inner().clone();
    engine.cancel_prefetch();

    let token = match mode {
        "playback" => engine.current_foreground_token(),
        _ => engine.begin_latest_request(),
    };

    let load_engine = engine.clone();
    let load_root = root_path.clone();
    let data = tauri::async_runtime::spawn_blocking(move || {
        load_engine.load_layer_cancellable(&load_root, layer, token)
    })
    .await
    .map_err(|e| format!("加载任务失败: {e}"))??;

    if mode != "scrub" {
        engine.prefetch(root_path, layer, total_layers);
    }
    Ok(Response::new(data.as_ref().clone()))
}

#[tauri::command]
pub fn get_performance_config(engine: State<'_, Arc<ViewerEngine>>) -> PerformanceConfig {
    engine.config()
}

#[tauri::command]
pub fn set_performance_config(config: PerformanceConfig, engine: State<'_, Arc<ViewerEngine>>) {
    engine.set_config(config);
}

#[tauri::command]
pub fn clear_geometry_cache(engine: State<'_, Arc<ViewerEngine>>) {
    engine.clear_cache();
}

#[tauri::command]
pub fn get_cache_stats(engine: State<'_, Arc<ViewerEngine>>) -> CacheStats {
    engine.cache_stats()
}
