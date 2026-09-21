use std::{
    collections::{HashMap, HashSet},
    fs,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc, Mutex, RwLock,
    },
};

use rayon::{prelude::*, ThreadPool, ThreadPoolBuilder};
use serde::{Deserialize, Serialize};

use crate::{
    fast_vtk::{parse_ascii_polydata, parse_ascii_polydata_cancellable, GalvoGeometry, CANCELLED_MARKER},
    transforms::GALVOS,
};

const MAGIC: &[u8; 8] = b"VGEO0001";
const HEADER_BYTES: usize = 16;
const ITEM_HEADER_BYTES: usize = 16;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PerformanceConfig {
    /// 0 = 自动。建议 SSD/NVMe 使用 6~8；机械盘可手动调低。
    pub io_threads: usize,
    /// 当前层前后各预加载多少层。
    pub preload_layers: u32,
    /// Rust 端已解析图层缓存上限。
    pub max_cache_mb: usize,
}

impl Default for PerformanceConfig {
    fn default() -> Self {
        Self {
            io_threads: 0,
            preload_layers: 1,
            max_cache_mb: 1024,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CacheStats {
    pub entries: usize,
    pub bytes: usize,
    pub max_bytes: usize,
    pub hits: u64,
    pub misses: u64,
}

#[derive(Clone)]
struct CacheEntry {
    data: Arc<Vec<u8>>,
    last_used: u64,
}

struct LayerCache {
    map: HashMap<(PathBuf, u32), CacheEntry>,
    bytes: usize,
    tick: u64,
    hits: u64,
    misses: u64,
}

impl LayerCache {
    fn new() -> Self {
        Self {
            map: HashMap::new(),
            bytes: 0,
            tick: 0,
            hits: 0,
            misses: 0,
        }
    }

    fn get(&mut self, root: &Path, layer: u32) -> Option<Arc<Vec<u8>>> {
        self.tick = self.tick.wrapping_add(1);
        let key = (root.to_path_buf(), layer);
        if let Some(entry) = self.map.get_mut(&key) {
            entry.last_used = self.tick;
            self.hits += 1;
            return Some(entry.data.clone());
        }
        self.misses += 1;
        None
    }

    fn contains(&self, root: &Path, layer: u32) -> bool {
        self.map.contains_key(&(root.to_path_buf(), layer))
    }

    fn insert(&mut self, root: &Path, layer: u32, data: Arc<Vec<u8>>, max_bytes: usize) {
        self.tick = self.tick.wrapping_add(1);
        let key = (root.to_path_buf(), layer);
        if let Some(old) = self.map.remove(&key) {
            self.bytes = self.bytes.saturating_sub(old.data.len());
        }
        self.bytes = self.bytes.saturating_add(data.len());
        self.map.insert(key, CacheEntry { data, last_used: self.tick });
        self.evict(max_bytes);
    }

    fn evict(&mut self, max_bytes: usize) {
        while self.bytes > max_bytes && self.map.len() > 1 {
            let Some(key) = self.map.iter().min_by_key(|(_, v)| v.last_used).map(|(k, _)| k.clone()) else { break };
            if let Some(old) = self.map.remove(&key) {
                self.bytes = self.bytes.saturating_sub(old.data.len());
            }
        }
    }

    fn clear(&mut self) {
        self.map.clear();
        self.bytes = 0;
    }
}

pub struct ViewerEngine {
    config: RwLock<PerformanceConfig>,
    cache: Mutex<LayerCache>,
    pools: Mutex<HashMap<usize, Arc<ThreadPool>>>,
    active_root: RwLock<Option<PathBuf>>,
    available_layers: RwLock<Vec<u32>>,
    generation: AtomicU64,
    prefetch_generation: AtomicU64,
    foreground_generation: AtomicU64,
    layer_locks: Mutex<HashMap<(PathBuf, u32), Arc<Mutex<()>>>>,
}

impl ViewerEngine {
    pub fn new() -> Self {
        Self {
            config: RwLock::new(PerformanceConfig::default()),
            cache: Mutex::new(LayerCache::new()),
            pools: Mutex::new(HashMap::new()),
            active_root: RwLock::new(None),
            available_layers: RwLock::new(Vec::new()),
            generation: AtomicU64::new(0),
            prefetch_generation: AtomicU64::new(0),
            foreground_generation: AtomicU64::new(0),
            layer_locks: Mutex::new(HashMap::new()),
        }
    }

    pub fn config(&self) -> PerformanceConfig {
        self.config.read().unwrap().clone()
    }

    pub fn set_config(&self, config: PerformanceConfig) {
        let normalized = PerformanceConfig {
            io_threads: config.io_threads.min(24),
            preload_layers: config.preload_layers.min(8),
            max_cache_mb: config.max_cache_mb.clamp(128, 16384),
        };
        *self.config.write().unwrap() = normalized.clone();
        let max_bytes = normalized.max_cache_mb * 1024 * 1024;
        self.cache.lock().unwrap().evict(max_bytes);
    }

    pub fn set_root(&self, root: &Path) {
        let mut active = self.active_root.write().unwrap();
        if active.as_deref() != Some(root) {
            *active = Some(root.to_path_buf());
            self.generation.fetch_add(1, Ordering::Relaxed);
            self.prefetch_generation.fetch_add(1, Ordering::Relaxed);
            self.foreground_generation.fetch_add(1, Ordering::Relaxed);
            self.cache.lock().unwrap().clear();
            self.layer_locks.lock().unwrap().clear();
            self.available_layers.write().unwrap().clear();
        }
    }

    pub fn set_available_layers(&self, root: &Path, layers: Vec<u32>) {
        self.set_root(root);
        *self.available_layers.write().unwrap() = layers;
    }

    pub fn begin_latest_request(&self) -> u64 {
        // 新的拖动/精确请求会让旧前台解析尽快停止，同时停止旧预加载。
        self.prefetch_generation.fetch_add(1, Ordering::Relaxed);
        self.foreground_generation.fetch_add(1, Ordering::Relaxed).wrapping_add(1)
    }

    pub fn current_foreground_token(&self) -> u64 {
        self.foreground_generation.load(Ordering::Relaxed)
    }

    pub fn cancel_prefetch(&self) {
        self.prefetch_generation.fetch_add(1, Ordering::Relaxed);
    }

    fn token_is_current(&self, token: u64) -> bool {
        self.foreground_generation.load(Ordering::Relaxed) == token
    }

    fn resolved_threads(&self) -> usize {
        let configured = self.config.read().unwrap().io_threads;
        if configured > 0 {
            return configured.max(1).min(24);
        }
        std::thread::available_parallelism()
            .map(|v| v.get())
            .unwrap_or(4)
            .clamp(2, 8)
    }

    fn pool(&self) -> Result<Arc<ThreadPool>, String> {
        let threads = self.resolved_threads();
        let mut pools = self.pools.lock().unwrap();
        if let Some(pool) = pools.get(&threads) {
            return Ok(pool.clone());
        }
        let pool = ThreadPoolBuilder::new()
            .num_threads(threads)
            .thread_name(|i| format!("vtk-load-{i}"))
            .build()
            .map_err(|e| format!("创建并行加载线程池失败: {e}"))?;
        let pool = Arc::new(pool);
        pools.insert(threads, pool.clone());
        Ok(pool)
    }

    pub fn cache_stats(&self) -> CacheStats {
        let config = self.config();
        let cache = self.cache.lock().unwrap();
        CacheStats {
            entries: cache.map.len(),
            bytes: cache.bytes,
            max_bytes: config.max_cache_mb * 1024 * 1024,
            hits: cache.hits,
            misses: cache.misses,
        }
    }

    pub fn clear_cache(&self) {
        self.cache.lock().unwrap().clear();
    }

    pub fn load_layer(&self, root: &Path, layer: u32) -> Result<Arc<Vec<u8>>, String> {
        self.load_layer_impl(root, layer, None)
    }

    pub fn load_layer_cancellable(&self, root: &Path, layer: u32, token: u64) -> Result<Arc<Vec<u8>>, String> {
        self.load_layer_impl(root, layer, Some(token))
    }

    fn load_layer_impl(&self, root: &Path, layer: u32, token: Option<u64>) -> Result<Arc<Vec<u8>>, String> {
        self.set_root(root);
        if let Some(token) = token {
            if !self.token_is_current(token) {
                return Err(CANCELLED_MARKER.into());
            }
        }

        if let Some(cached) = self.cache.lock().unwrap().get(root, layer) {
            return Ok(cached);
        }

        let key = (root.to_path_buf(), layer);
        let layer_lock = {
            let mut locks = self.layer_locks.lock().unwrap();
            locks.entry(key.clone()).or_insert_with(|| Arc::new(Mutex::new(()))).clone()
        };
        let _guard = layer_lock.lock().unwrap();

        let result = (|| {
            if let Some(token) = token {
                if !self.token_is_current(token) {
                    return Err(CANCELLED_MARKER.into());
                }
            }

            if let Some(cached) = self.cache.lock().unwrap().get(root, layer) {
                return Ok(cached);
            }

            let pool = self.pool()?;
            let geometries: Vec<Result<Option<GalvoGeometry>, String>> = pool.install(|| {
                GALVOS
                    .par_iter()
                    .map(|definition| {
                        if let Some(token) = token {
                            if !self.token_is_current(token) {
                                return Err(CANCELLED_MARKER.into());
                            }
                        }

                        let path = root
                            .join(definition.folder.to_string())
                            .join(format!("{layer}.vtk"));
                        if !path.is_file() {
                            return Ok(None);
                        }

                        let bytes = fs::read(&path)
                            .map_err(|e| format!("读取 {} 失败: {e}", path.display()))?;

                        let geometry = if let Some(token) = token {
                            parse_ascii_polydata_cancellable(definition.folder, &path, &bytes, || {
                                !self.token_is_current(token)
                            })?
                        } else {
                            parse_ascii_polydata(definition.folder, &path, &bytes)?
                        };
                        Ok(Some(geometry))
                    })
                    .collect()
            });

            let mut parsed = Vec::with_capacity(24);
            for geometry in geometries {
                if let Some(geometry) = geometry? {
                    parsed.push(geometry);
                }
            }

            if let Some(token) = token {
                if !self.token_is_current(token) {
                    return Err(CANCELLED_MARKER.into());
                }
            }

            let packed = Arc::new(pack_layer(layer, &parsed));
            let max_bytes = self.config.read().unwrap().max_cache_mb * 1024 * 1024;
            self.cache.lock().unwrap().insert(root, layer, packed.clone(), max_bytes);
            Ok(packed)
        })();

        self.layer_locks.lock().unwrap().remove(&key);
        result
    }

    pub fn prefetch(self: Arc<Self>, root: PathBuf, current: u32, total_layers: u32) {
        let config = self.config();
        if config.preload_layers == 0 || total_layers == 0 {
            return;
        }
        let generation = self.generation.load(Ordering::Relaxed);
        let prefetch_generation = self.prefetch_generation.fetch_add(1, Ordering::Relaxed).wrapping_add(1);
        std::thread::Builder::new()
            .name("vtk-prefetch".into())
            .spawn(move || {
                let available = self.available_layers.read().unwrap().clone();
                let targets = prefetch_targets(&available, current, total_layers, config.preload_layers);

                let mut seen = HashSet::new();
                for layer in targets {
                    if !seen.insert(layer) {
                        continue;
                    }
                    if self.generation.load(Ordering::Relaxed) != generation
                        || self.prefetch_generation.load(Ordering::Relaxed) != prefetch_generation
                    {
                        break;
                    }
                    if self.cache.lock().unwrap().contains(&root, layer) {
                        continue;
                    }
                    let _ = self.load_layer(&root, layer);
                }
            })
            .ok();
    }
}

/// 计算预加载目标层列表（按前后交替顺序生成，调用方负责去重）。
///
/// - `available` 为空时回退到连续层号假设（0..total_layers 均视为存在）；
/// - `available` 非空时以真实存在的层号为准，围绕 `current` 前后各取
///   `preload_layers` 层；`current` 本身缺失时取两侧最近的真实层。
fn prefetch_targets(available: &[u32], current: u32, total_layers: u32, preload_layers: u32) -> Vec<u32> {
    let mut targets = Vec::new();
    if available.is_empty() {
        for d in 1..=preload_layers {
            if let Some(prev) = current.checked_sub(d) {
                targets.push(prev);
            }
            let next = current.saturating_add(d);
            if next < total_layers {
                targets.push(next);
            }
        }
        return targets;
    }

    let insertion = available.partition_point(|v| *v < current);
    let current_index = available.get(insertion).filter(|v| **v == current).map(|_| insertion);
    let pivot = current_index.unwrap_or(insertion);
    for d in 1..=preload_layers as usize {
        if pivot >= d {
            targets.push(available[pivot - d]);
        }
        let next_index = if current_index.is_some() { pivot + d } else { pivot + d - 1 };
        if let Some(next) = available.get(next_index) {
            targets.push(*next);
        }
    }
    targets
}

fn pack_layer(layer: u32, geometries: &[GalvoGeometry]) -> Vec<u8> {
    let payload_bytes: usize = geometries
        .iter()
        .map(|g| ITEM_HEADER_BYTES + g.points.len() * 4 + g.lines.len() * 4)
        .sum();
    let mut out = Vec::with_capacity(HEADER_BYTES + payload_bytes);
    out.extend_from_slice(MAGIC);
    out.extend_from_slice(&layer.to_le_bytes());
    out.extend_from_slice(&(geometries.len() as u32).to_le_bytes());

    for geometry in geometries {
        out.extend_from_slice(&(geometry.folder as u32).to_le_bytes());
        out.extend_from_slice(&((geometry.points.len() / 3) as u32).to_le_bytes());
        out.extend_from_slice(&(geometry.lines.len() as u32).to_le_bytes());
        out.extend_from_slice(&1u32.to_le_bytes());

        for value in &geometry.points {
            out.extend_from_slice(&value.to_le_bytes());
        }
        for value in &geometry.lines {
            out.extend_from_slice(&value.to_le_bytes());
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::prefetch_targets;

    #[test]
    fn empty_available_falls_back_to_contiguous_layers() {
        // 未扫描到真实层时按连续层号假设回退
        assert_eq!(prefetch_targets(&[], 5, 10, 1), vec![4, 6]);
        // 第一层：仅向后
        assert_eq!(prefetch_targets(&[], 0, 10, 2), vec![1, 2]);
        // 最后一层：仅向前（前后交替顺序，前一层先入队）
        assert_eq!(prefetch_targets(&[], 9, 10, 2), vec![8, 7]);
        // preload_layers = 0：无目标
        assert_eq!(prefetch_targets(&[], 5, 10, 0), Vec::<u32>::new());
    }

    #[test]
    fn available_around_existing_current() {
        let available = [0u32, 2, 4, 6, 8];
        assert_eq!(prefetch_targets(&available, 4, 10, 1), vec![2, 6]);
        assert_eq!(prefetch_targets(&available, 4, 10, 2), vec![2, 6, 0, 8]);
        // 第一层：仅向后预加载
        assert_eq!(prefetch_targets(&available, 0, 10, 2), vec![2, 4]);
        // 最后一层：仅向前预加载
        assert_eq!(prefetch_targets(&available, 8, 10, 2), vec![6, 4]);
        // total_layers 不影响非空分支
        assert_eq!(prefetch_targets(&available, 4, 100, 1), vec![2, 6]);
    }

    #[test]
    fn available_around_missing_current() {
        let available = [0u32, 2, 4, 6, 8];
        // current 缺失：取两侧最近的真实层
        assert_eq!(prefetch_targets(&available, 3, 10, 1), vec![2, 4]);
        assert_eq!(prefetch_targets(&available, 1, 10, 2), vec![0, 2, 4]);
        // current 超过最大层：仅向前取
        assert_eq!(prefetch_targets(&available, 100, 10, 1), vec![8]);
    }

    #[test]
    fn available_single_layer_yields_no_targets() {
        // 仅一层时无其他层可预加载，且不越界
        assert_eq!(prefetch_targets(&[5u32], 5, 10, 1), Vec::<u32>::new());
        assert_eq!(prefetch_targets(&[5u32], 5, 10, 4), Vec::<u32>::new());
    }

    #[test]
    fn no_overflow_at_boundaries() {
        // current = u32::MAX：checked_sub / saturating_add 不溢出
        assert_eq!(prefetch_targets(&[], u32::MAX, u32::MAX, 1), vec![u32::MAX - 1]);
        // 大 total_layers 下 next 不越界
        assert_eq!(prefetch_targets(&[], 10, u32::MAX, 1), vec![9, 11]);
    }
}
