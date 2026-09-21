import { useEffect, useMemo, useState } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { DEFAULT_GALVOS, GROUP_COLORS } from './data'
import type { CoordMode, DatasetInfo, GalvoItem, Locale, ThemeMode } from './types'
import { dictionaries, I18nContext, type TranslationKey } from './i18n'
import { Toolbar } from './components/Toolbar'
import { GalvoSidebar } from './components/GalvoSidebar'
import { ViewerPanel } from './components/ViewerPanel'
import { PlaybackPanel } from './components/PlaybackPanel'
import { SettingsModal } from './components/SettingsModal'
import { CoordMenu } from './components/CoordMenu'
import { scanDataset, selectDatasetFolder, type LayerRequestMode } from './services/tauri'

const appWindow = getCurrentWindow()

function readStoredTheme(): ThemeMode { const value = localStorage.getItem('vtk.theme'); return value === 'light' || value === 'dark' || value === 'system' ? value : 'system' }
function readStoredLocale(): Locale { return localStorage.getItem('vtk.locale') === 'en-US' ? 'en-US' : 'zh-CN' }

export default function App() {
  const [dataset, setDataset] = useState<DatasetInfo | null>(null)
  const [galvos, setGalvos] = useState<GalvoItem[]>(DEFAULT_GALVOS)
  const [gridVisible, setGridVisible] = useState(true)
  const [coordMode, setCoordMode] = useState<CoordMode>('off')
  const [coordMenuOpen, setCoordMenuOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(12)
  const [maxSpeed, setMaxSpeed] = useState(20)
  const [layer, setLayer] = useState(0)
  const [fitSignal, setFitSignal] = useState(0)
  const [scrubbing, setScrubbing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [theme, setTheme] = useState<ThemeMode>(readStoredTheme)
  const [locale, setLocale] = useState<Locale>(readStoredLocale)

  const t = useMemo(() => (key: TranslationKey) => dictionaries[locale][key], [locale])
  const totalLayers = dataset?.totalLayers ?? 0
  const availableLayers = dataset?.availableLayers ?? []
  const layerRequestMode: LayerRequestMode = scrubbing ? 'scrub' : playing ? 'playback' : 'exact'

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const applyTheme = () => {
      const resolved = theme === 'system' ? (media.matches ? 'dark' : 'light') : theme
      document.documentElement.dataset.theme = resolved
    }
    applyTheme()
    media.addEventListener('change', applyTheme)
    return () => media.removeEventListener('change', applyTheme)
  }, [theme])

  useEffect(() => {
    if (!playing || availableLayers.length === 0) return
    const period = Math.max(25, Math.round(1000 / Math.max(1, speed)))
    const timer = window.setInterval(() => setLayer(current => nextLayer(current, availableLayers, 1)), period)
    return () => window.clearInterval(timer)
  }, [playing, speed, availableLayers])

  const openFolder = async () => {
    try {
      setError(null)
      const root = await selectDatasetFolder(t('chooseFolder'))
      if (!root) return
      const info = await scanDataset(root)
      setDataset(info)
      const byId = new Map(info.galvos.map(item => [item.id, item]))
      setGalvos(DEFAULT_GALVOS.map(base => { const source = byId.get(base.id); return { ...base, folder: source?.folder, transform: source?.transform } }))
      setLayer(info.availableLayers[0] ?? 0)
      setPlaying(false); setScrubbing(false)
      requestAnimationFrame(() => setFitSignal(v => v + 1))
    } catch (e) { setError(String(e)) }
  }

  const resetAll = () => {
    setGalvos(prev => prev.map(g => ({ ...g, color: GROUP_COLORS[g.group], visible: true })))
    setGridVisible(true); setCoordMode('off'); setPlaying(false); setScrubbing(false); setSpeed(Math.min(12, maxSpeed)); setLayer(availableLayers[0] ?? 0); setFitSignal(v => v + 1)
  }

  const applyGeneral = (nextTheme: ThemeMode, nextLocale: Locale) => {
    setTheme(nextTheme); setLocale(nextLocale)
    localStorage.setItem('vtk.theme', nextTheme); localStorage.setItem('vtk.locale', nextLocale)
  }

  return (
    <I18nContext.Provider value={{ locale, t }}>
      <main className="app-shell">
        <header className="titlebar" data-tauri-drag-region>
          <div className="app-title" data-tauri-drag-region><div className="app-logo">⬡</div><span>VTK Viewer</span></div>
          <div className="window-controls">
            <button aria-label="Minimize" onClick={() => void appWindow.minimize()}>—</button>
            <button aria-label="Maximize" onClick={() => void appWindow.toggleMaximize()}>□</button>
            <button aria-label="Close" className="window-close" onClick={() => void appWindow.close()}>×</button>
          </div>
        </header>

        <div className="toolbar-wrap">
          <Toolbar gridVisible={gridVisible} onOpenFolder={openFolder} onFit={() => setFitSignal(v => v + 1)} onToggleGrid={() => setGridVisible(v => !v)} onOpenCoordMenu={() => setCoordMenuOpen(v => !v)} onReset={resetAll} onOpenSettings={() => setSettingsOpen(true)} />
          {coordMenuOpen && <CoordMenu value={coordMode} onChange={setCoordMode} onClose={() => setCoordMenuOpen(false)} />}
        </div>

        <div className="workspace">
          <GalvoSidebar galvos={galvos} onToggleGalvo={(id) => setGalvos(prev => prev.map(g => g.id === id ? { ...g, visible: !g.visible } : g))} onChangeColor={(id, color) => setGalvos(prev => prev.map(g => g.id === id ? { ...g, color } : g))} />
          <section className="viewer-column">
            <ViewerPanel root={dataset?.root ?? null} galvos={galvos} gridVisible={gridVisible} coordMode={coordMode} layer={layer} fitSignal={fitSignal} totalLayers={totalLayers} layerRequestMode={layerRequestMode} />
            <PlaybackPanel playing={playing} speed={speed} layer={layer} totalLayers={Math.max(0, totalLayers - 1)} maxSpeed={maxSpeed} onTogglePlaying={() => { setScrubbing(false); setPlaying(v => !v) }} onSpeedChange={setSpeed} onLayerChange={(value) => setLayer(nearestLayer(value, availableLayers))} onPreviousLayer={() => setLayer(v => nextLayer(v, availableLayers, -1))} onNextLayer={() => setLayer(v => nextLayer(v, availableLayers, 1))} onScrubStateChange={(value) => { if (value) setPlaying(false); setScrubbing(value) }} />
          </section>
        </div>

        {error && <div className="error-toast">{error}</div>}
        {dataset?.warnings?.length ? <div className="warning-badge" title={dataset.warnings.join('\n')}>{dataset.warnings.length} {t('dataWarnings')}</div> : null}
        <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} theme={theme} locale={locale} maxSpeed={maxSpeed} onApplyGeneral={applyGeneral} onMaxSpeedChange={(value) => { setMaxSpeed(value); setSpeed(current => Math.min(current, value)) }} />
      </main>
    </I18nContext.Provider>
  )
}

function nextLayer(current: number, layers: number[], direction: -1 | 1): number {
  if (layers.length === 0) return 0
  if (direction > 0) {
    const found = layers.find(v => v > current)
    return found ?? layers[0]
  }
  for (let i = layers.length - 1; i >= 0; i -= 1) if (layers[i] < current) return layers[i]
  return layers[layers.length - 1]
}

function nearestLayer(target: number, layers: number[]): number {
  if (layers.length === 0) return target
  let lo = 0, hi = layers.length - 1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (layers[mid] === target) return target
    if (layers[mid] < target) lo = mid + 1
    else hi = mid - 1
  }
  if (lo >= layers.length) return layers[layers.length - 1]
  if (hi < 0) return layers[0]
  return Math.abs(layers[lo] - target) < Math.abs(target - layers[hi]) ? layers[lo] : layers[hi]
}
