mod dataset;
mod engine;
mod fast_vtk;
mod transforms;

use std::sync::Arc;
use engine::ViewerEngine;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(Arc::new(ViewerEngine::new()))
        .invoke_handler(tauri::generate_handler![
            dataset::get_galvo_layout,
            dataset::scan_dataset,
            dataset::load_layer_fast,
            dataset::get_performance_config,
            dataset::set_performance_config,
            dataset::clear_geometry_cache,
            dataset::get_cache_stats,
        ])
        .run(tauri::generate_context!())
        .expect("error while running VTK Viewer");
}
