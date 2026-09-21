import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles.css'

// vtk.js OpenGL 渲染后端的 view node 注册是副作用导入。
// 生产构建（Rollup tree-shaking）下必须显式引入，否则运行时
// getViewNodeFor(renderer) 返回 undefined 导致白屏。
import '@kitware/vtk.js/Rendering/OpenGL/Renderer'
import '@kitware/vtk.js/Rendering/OpenGL/Actor'
import '@kitware/vtk.js/Rendering/OpenGL/PolyDataMapper'
import '@kitware/vtk.js/Rendering/OpenGL/Camera'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
