import { createContext, useContext } from 'react'
import type { Locale } from './types'

const zh = {
  openFolder: '打开文件夹', fitView: '适应视图', grid: '栅格', coord: '坐标系', reset: '恢复默认', settings: '设置',
  hidden: '隐藏', shown: '显示', coordOff: '不显示', globalCoord: '全局坐标系', localCoord: '局部坐标系',
  previousLayer: '上一层', nextLayer: '下一层', play: '播放', pause: '暂停', speed: '速度', layer: '图层', layersPerSecond: '层/秒',
  chooseFolder: '选择24振镜VTK总文件夹', dataWarnings: '条数据警告',
  general: '常规', performance: '性能', logsCache: '日志与缓存', about: '关于', cancel: '取消', apply: '应用',
  generalSub: '设置界面外观与语言等基础选项', theme: '主题', themeHint: '选择应用的外观主题', light: '浅色', system: '跟随系统', dark: '深色',
  language: '语言', languageHint: '选择界面显示的语言', chinese: '中文（简体）', english: 'English',
  performanceSub: '控制播放、并行读取和前后层预加载', maxPlayback: '最大播放速度', maxPlaybackDesc: '控制主界面速度滑块的最大值',
  preload: '预加载层数', preloadDesc: '后台提前解析当前层前后图层，默认前后各 1 层', ioThreads: '并行加载线程数', ioThreadsDesc: '自动模式最多使用 8 个线程；机械硬盘建议手动调低', auto: '自动',
  dataPath: '数据路径', dataPathDesc: 'ASCII VTK 在 Rust 中解析为 Float32/Uint32，再一次 IPC 发送整层 24 振镜', fastPath: '高速路径',
  cacheSub: '管理已解析图层的内存缓存', maxCache: '最大缓存大小', maxCacheDesc: '缓存的是解析后的二进制几何，不是原始 ASCII 文件', currentCache: '当前缓存', currentCacheDesc: '命中缓存时无需重新读取和解析 VTK', cacheHit: '缓存命中', cacheHitDesc: '用于观察连续播放时缓存是否有效', clearCache: '清空几何缓存',
  aboutSub: 'VTK Viewer 技术信息', toolDesc: '24 振镜 VTK 图层查看工具', version: '版本号', desktop: '桌面框架', frontend: '前端', icons: '图标', core: '核心处理', vtkRender: 'VTK 渲染',
  hit: '命中', miss: '未命中', layers: '层',
}

const en: typeof zh = {
  openFolder: 'Open Folder', fitView: 'Fit View', grid: 'Grid', coord: 'Coordinates', reset: 'Reset', settings: 'Settings',
  hidden: 'Hide', shown: 'Show', coordOff: 'Off', globalCoord: 'Global coordinates', localCoord: 'Local coordinates',
  previousLayer: 'Previous layer', nextLayer: 'Next layer', play: 'Play', pause: 'Pause', speed: 'Speed', layer: 'Layer', layersPerSecond: 'layers/s',
  chooseFolder: 'Select 24-galvo VTK root folder', dataWarnings: 'data warnings',
  general: 'General', performance: 'Performance', logsCache: 'Logs & Cache', about: 'About', cancel: 'Cancel', apply: 'Apply',
  generalSub: 'Basic appearance and language settings', theme: 'Theme', themeHint: 'Choose the application appearance', light: 'Light', system: 'System', dark: 'Dark',
  language: 'Language', languageHint: 'Choose the interface language', chinese: '中文（简体）', english: 'English',
  performanceSub: 'Control playback, parallel I/O and preloading', maxPlayback: 'Max playback speed', maxPlaybackDesc: 'Maximum value of the main speed slider',
  preload: 'Preload layers', preloadDesc: 'Pre-parse layers before and after the current layer', ioThreads: 'Parallel I/O threads', ioThreadsDesc: 'Auto uses up to 8 threads; lower values may suit HDDs', auto: 'Auto',
  dataPath: 'Data path', dataPathDesc: 'Rust parses ASCII VTK to Float32/Uint32 and sends one packed layer via IPC', fastPath: 'Fast path',
  cacheSub: 'Manage parsed in-memory geometry cache', maxCache: 'Max cache size', maxCacheDesc: 'Caches parsed binary geometry, not source ASCII files', currentCache: 'Current cache', currentCacheDesc: 'Cache hits avoid reading and parsing VTK again', cacheHit: 'Cache hits', cacheHitDesc: 'Useful for checking sequential playback effectiveness', clearCache: 'Clear geometry cache',
  aboutSub: 'VTK Viewer technical information', toolDesc: '24-galvo VTK layer viewer', version: 'Version', desktop: 'Desktop framework', frontend: 'Frontend', icons: 'Icons', core: 'Core processing', vtkRender: 'VTK rendering',
  hit: 'hits', miss: 'misses', layers: 'layers',
}

export type TranslationKey = keyof typeof zh
export const dictionaries = { 'zh-CN': zh, 'en-US': en }

export const I18nContext = createContext({ locale: 'zh-CN' as Locale, t: (key: TranslationKey) => zh[key] })
export const useI18n = () => useContext(I18nContext)
