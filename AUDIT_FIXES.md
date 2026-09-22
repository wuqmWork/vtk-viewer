# 复审修复记录（0.1.2）

本版本针对 `VTK-Viewer 0.1.1` 复审报告中的回归项继续修复。

## 本轮修复

1. **恢复 Vite/Tauri 开发端口一致性**
   - `vite.config.ts` 恢复 `server.port = 1420`。
   - 开启 `strictPort: true`，避免端口被占用时 Vite 静默切换到 5173 等其他端口，导致 Tauri WebView 加载空白地址。

2. **移除 `by_folder` 死代码**
   - 删除 `transforms.rs` 中已无调用方的 `by_folder`，消除对应 `dead_code` 警告源。

3. **开发/生产 CSP 分离**
   - 生产 `csp` 保持严格 `script-src 'self'`。
   - 新增 `devCsp`，仅开发环境允许 Vite React Refresh 所需的 inline script，并保留 localhost/ws HMR 连接。

4. **版本升级到 0.1.2**
   - 同步更新 Tauri、Cargo、package.json 与关于页版本号。

## 建议验收命令

```bash
npm install
npm run build

cd src-tauri
cargo check
cargo test
cd ..

npm run tauri dev
```

重点确认：
- Vite 固定监听 `http://localhost:1420`；
- Tauri 开发窗口正常加载前端；
- React HMR 不被 CSP 拦截；
- `cargo check` 不再出现 `by_folder` 的 dead_code 警告。
