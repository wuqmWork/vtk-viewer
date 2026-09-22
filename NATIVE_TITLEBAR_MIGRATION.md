# 0.1.4 Windows 原生标题栏

本版本将 VTK Viewer 从 React 自绘无边框标题栏切换为 Windows/Tauri 原生标题栏。

## 变更
- `decorations: true`
- 删除前端 `getCurrentWindow()` 窗口控制代码
- 删除自定义最小化 / 最大化 / 关闭按钮
- 删除 `startDragging()` 与 `data-tauri-drag-region`
- 删除对应的 Window ACL 权限
- 主体布局从“自定义标题栏 + 工具栏 + 工作区”改为“工具栏 + 工作区”
- 保留设置弹窗、VTK Viewer、振镜列表、播放控制等业务 UI 不变

## 好处
窗口拖动、最小化、最大化、还原、关闭全部交回 Windows 原生窗口框架处理，
不再依赖 Tauri `plugin:window` IPC/ACL。
