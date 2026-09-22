# 0.1.6 Release 渲染白屏修复

## 根因
`vtkGenericRenderWindow` 依赖 vtk.js 渲染后端的 ViewNode 注册。开发模式中依赖图较宽，注册模块可能碰巧被带入；生产 Rollup tree-shaking 后，如果没有显式导入 Rendering Profile，WebGL Renderer/Camera/Actor/Mapper 等注册副作用可能不在最终 bundle 中，导致 `getViewNodeFor(renderer)` 得到 `undefined`，随后在 traverse 阶段崩溃。

## 修复
- 在 `VtkScene.ts` 顶部显式 `import '@kitware/vtk.js/Rendering/Profiles/Geometry'`。
- manualChunks 改为按模块路径分包，不再把 `@kitware/vtk.js` 根包作为人工 chunk 入口。
- Viewer 初始化增加局部 try/catch 和错误覆盖层；即使后续 vtk.js 初始化出错，也不会把工具栏、振镜栏、播放栏一起变成空白。

## 验证重点
1. `npm run build` 后使用 `npm run tauri build`。
2. 运行 release exe，确认完整 UI 可见。
3. 打开数据集后确认白色全视口栅格、VTK 线条、全局/局部坐标系均可显示。
