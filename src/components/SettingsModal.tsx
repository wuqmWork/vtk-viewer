import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Monitor, Gauge, Database, Info, Sun, Moon, Laptop, X, Settings as SettingsIcon } from 'lucide-react'
import type { Locale, ThemeMode } from '../types'
import { useI18n } from '../i18n'
import { clearGeometryCache, getCacheStats, getPerformanceConfig, setPerformanceConfig, type CacheStats } from '../services/tauri'

type Page = 'general' | 'performance' | 'cache' | 'about'

type Props = {
  open: boolean
  onClose: () => void
  theme: ThemeMode
  locale: Locale
  maxSpeed: number
  onApplyGeneral: (theme: ThemeMode, locale: Locale) => void
  onMaxSpeedChange?: (value: number) => void
}

export function SettingsModal({ open, onClose, theme, locale, maxSpeed: outerMaxSpeed, onApplyGeneral, onMaxSpeedChange }: Props) {
  const { t } = useI18n()
  const [page, setPage] = useState<Page>('general')
  const [draftTheme, setDraftTheme] = useState<ThemeMode>(theme)
  const [draftLocale, setDraftLocale] = useState<Locale>(locale)
  const [maxSpeed, setMaxSpeed] = useState(outerMaxSpeed)
  const [cacheMb, setCacheMb] = useState(1024)
  const [preload, setPreload] = useState(1)
  const [ioThreads, setIoThreads] = useState(0)
  const [cacheStats, setCacheStats] = useState<CacheStats | null>(null)

  useEffect(() => {
    if (!open) return
    setDraftTheme(theme)
    setDraftLocale(locale)
    setMaxSpeed(outerMaxSpeed)
    void getPerformanceConfig().then(config => {
      setPreload(config.preloadLayers); setCacheMb(config.maxCacheMb); setIoThreads(config.ioThreads)
    }).catch(() => undefined)
    void getCacheStats().then(setCacheStats).catch(() => undefined)
  }, [open, theme, locale, outerMaxSpeed])

  if (!open) return null

  const apply = async () => {
    await setPerformanceConfig({ ioThreads, preloadLayers: preload, maxCacheMb: cacheMb })
    onApplyGeneral(draftTheme, draftLocale)
    onMaxSpeedChange?.(maxSpeed)
    onClose()
  }

  const clearCache = async () => { await clearGeometryCache(); setCacheStats(await getCacheStats()) }

  return (
    <div className="modal-backdrop">
      <div className="settings-modal">
        <div className="modal-titlebar">
          <div className="modal-title"><SettingsIcon size={19} /><span>{t('settings')}</span></div>
          <button className="icon-button close-button" onClick={onClose}><X size={19} /></button>
        </div>
        <div className="settings-body">
          <nav className="settings-nav">
            <SettingsNavButton active={page === 'general'} icon={<Monitor size={18} />} label={t('general')} onClick={() => setPage('general')} />
            <SettingsNavButton active={page === 'performance'} icon={<Gauge size={18} />} label={t('performance')} onClick={() => setPage('performance')} />
            <SettingsNavButton active={page === 'cache'} icon={<Database size={18} />} label={t('logsCache')} onClick={() => setPage('cache')} />
            <SettingsNavButton active={page === 'about'} icon={<Info size={18} />} label={t('about')} onClick={() => setPage('about')} />
          </nav>
          <section className="settings-content">
            {page === 'general' && <>
              <h2>{t('general')}</h2><p className="section-subtitle">{t('generalSub')}</p><div className="section-rule" />
              <h3>{t('theme')}</h3><p className="hint">{t('themeHint')}</p>
              <div className="theme-grid">
                <ThemeCard selected={draftTheme === 'light'} icon={<Sun size={30} />} title={t('light')} onClick={() => setDraftTheme('light')} />
                <ThemeCard selected={draftTheme === 'system'} icon={<Laptop size={30} />} title={t('system')} onClick={() => setDraftTheme('system')} />
                <ThemeCard selected={draftTheme === 'dark'} icon={<Moon size={30} />} title={t('dark')} onClick={() => setDraftTheme('dark')} />
              </div>
              <h3>{t('language')}</h3><p className="hint">{t('languageHint')}</p>
              <select className="select-control" value={draftLocale} onChange={e => setDraftLocale(e.target.value as Locale)}>
                <option value="zh-CN">{t('chinese')}</option><option value="en-US">{t('english')}</option>
              </select>
            </>}

            {page === 'performance' && <>
              <h2>{t('performance')}</h2><p className="section-subtitle">{t('performanceSub')}</p><div className="section-rule" />
              <SettingRow label={t('maxPlayback')} description={t('maxPlaybackDesc')}><input className="number-input" type="number" min={1} max={200} value={maxSpeed} onChange={e => setMaxSpeed(Number(e.target.value))} /><span>{t('layersPerSecond')}</span></SettingRow>
              <SettingRow label={t('preload')} description={t('preloadDesc')}><input className="number-input" type="number" min={0} max={8} value={preload} onChange={e => setPreload(Number(e.target.value))} /><span>{t('layers')}</span></SettingRow>
              <SettingRow label={t('ioThreads')} description={t('ioThreadsDesc')}><select className="small-select" value={ioThreads} onChange={e => setIoThreads(Number(e.target.value))}><option value={0}>{t('auto')}</option>{[2,4,6,8,12,16].map(v => <option key={v} value={v}>{v}</option>)}</select></SettingRow>
              <SettingRow label={t('dataPath')} description={t('dataPathDesc')}><span>{t('fastPath')}</span></SettingRow>
            </>}

            {page === 'cache' && <>
              <h2>{t('logsCache')}</h2><p className="section-subtitle">{t('cacheSub')}</p><div className="section-rule" />
              <SettingRow label={t('maxCache')} description={t('maxCacheDesc')}><input className="number-input wide" type="number" min={128} max={16384} step={128} value={cacheMb} onChange={e => setCacheMb(Number(e.target.value))} /><span>MB</span></SettingRow>
              <SettingRow label={t('currentCache')} description={t('currentCacheDesc')}><span>{cacheStats ? `${cacheStats.entries} ${t('layers')} / ${(cacheStats.bytes/1024/1024).toFixed(1)} MB` : '—'}</span></SettingRow>
              <SettingRow label={t('cacheHit')} description={t('cacheHitDesc')}><span>{cacheStats ? `${cacheStats.hits} ${t('hit')} / ${cacheStats.misses} ${t('miss')}` : '—'}</span></SettingRow>
              <div className="settings-actions-line"><button className="secondary-button" onClick={() => void clearCache()}>{t('clearCache')}</button></div>
            </>}

            {page === 'about' && <>
              <h2>{t('about')}</h2><p className="section-subtitle">{t('aboutSub')}</p><div className="section-rule" />
              <div className="about-card"><div className="about-title">VTK Viewer</div><div className="about-subtitle">{t('toolDesc')}</div>
                <dl className="about-list">
                  <div><dt>{t('version')}</dt><dd>0.1.6</dd></div><div><dt>{t('desktop')}</dt><dd>Tauri 2</dd></div><div><dt>{t('frontend')}</dt><dd>React + TypeScript</dd></div><div><dt>{t('icons')}</dt><dd>Lucide React</dd></div><div><dt>{t('core')}</dt><dd>Rust</dd></div><div><dt>{t('vtkRender')}</dt><dd>vtk.js</dd></div>
                </dl>
              </div>
            </>}
          </section>
        </div>
        <div className="modal-footer"><button className="secondary-button" onClick={onClose}>{t('cancel')}</button><button className="primary-button" onClick={() => void apply()}>{t('apply')}</button></div>
      </div>
    </div>
  )
}

function SettingsNavButton({ active, icon, label, onClick }: { active: boolean; icon: ReactNode; label: string; onClick: () => void }) { return <button className={`settings-nav-button ${active ? 'active' : ''}`} onClick={onClick}>{icon}<span>{label}</span></button> }
function ThemeCard({ selected, icon, title, onClick }: { selected: boolean; icon: ReactNode; title: string; onClick: () => void }) { return <button className={`theme-card ${selected ? 'selected' : ''}`} onClick={onClick}><div>{icon}</div><strong>{title}</strong><span className="radio-dot">{selected ? '●' : '○'}</span></button> }
function SettingRow({ label, description, children }: { label: string; description: string; children: ReactNode }) { return <div className="setting-row"><div><strong>{label}</strong><p>{description}</p></div><div className="setting-control">{children}</div></div> }
