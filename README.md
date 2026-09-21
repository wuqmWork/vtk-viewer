# VTK Viewer

24 振镜 VTK 图层查看器，Tauri 2 + Rust + React/TypeScript + vtk.js。

## 0.1.2 复审修复

- 修复 C3 `Transform2D` 整数字面量导致的 Rust 编译错误。
- 补充 Windows/Tauri 应用图标。
- `VtkScene.unmount()` 增加 disposed/requestSerial 失效保护，避免异步回调访问已释放 vtk 对象。
- 自定义标题栏已连接 Tauri 2 最小化/最大化/关闭 API。
- 主题与语言设置已真正生效并使用 localStorage 持久化。
- 删除未使用的 `read_vtk_file` 旧加载路径。
- 删除运行时未使用的 `transform_data.json`，运行时唯一变换源为 `src-tauri/src/transforms.rs`；`docs/galvo-transforms.xlsx` 仅保留为标定原始文档。
- 数据集扫描新增 `availableLayers`，播放和上一/下一层会跳过 24 个振镜都不存在的整层；某一个振镜缺层时该振镜在该层隐藏，其他振镜继续显示。
- vtk.js 拆为独立 Vite chunk。
- Tauri CSP 从 `null` 改为本地桌面应用白名单。
- 保留 Rust 并行解析、LRU 缓存、双缓冲、latest-wins、50ms scrub 预览与前后层预加载。

### 0.1.2 追加修复

- 恢复 Vite 开发端口 `1420` 并启用 `strictPort`，与 Tauri `devUrl` 保持一致。
- 删除残留 `by_folder` 死代码。
- 新增 `devCsp`：开发模式兼容 Vite React Refresh，生产 CSP 继续保持严格策略。
- 版本统一更新为 `0.1.2`。


## 坐标

原始 VTK 为各振镜局部坐标。主视图几何始终通过 Actor 变换显示到 C3 全局坐标。

变换：

```text
x_global = a*x_local - b*y_local + tx
y_global = b*x_local + a*y_local + ty
```

“全局坐标系/局部坐标系”只改变坐标轴显示方式，不改变 24 个振镜几何位置。

## 开发运行

```bash
npm install
npm run build
cd src-tauri
cargo check
cargo test
cd ..
npm run tauri dev
```

> 本打包环境未提供完整 Rust/Tauri 编译工具链，因此打包阶段不能在此处替代 Windows 本机构建验证；请使用以上命令做最终验证。
