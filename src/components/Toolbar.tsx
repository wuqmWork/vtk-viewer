import { FolderOpen, Maximize2, Grid3X3, Axis3D, RotateCcw, Settings } from 'lucide-react'
import { useI18n } from '../i18n'

type Props = {
  gridVisible: boolean
  onOpenFolder: () => void
  onFit: () => void
  onToggleGrid: () => void
  onOpenCoordMenu: () => void
  onReset: () => void
  onOpenSettings: () => void
}

export function Toolbar(props: Props) {
  const { t } = useI18n()
  return (
    <div className="toolbar">
      <button className="tool-button" onClick={props.onOpenFolder}><FolderOpen size={18}/><span>{t('openFolder')}</span></button>
      <div className="tool-separator" />
      <button className="tool-button" onClick={props.onFit}><Maximize2 size={18}/><span>{t('fitView')}</span></button>
      <div className="tool-separator" />
      <button className={`tool-button ${props.gridVisible ? 'is-active' : ''}`} onClick={props.onToggleGrid}><Grid3X3 size={18}/><span>{t('grid')}</span></button>
      <div className="tool-separator" />
      <button className="tool-button" onClick={props.onOpenCoordMenu}><Axis3D size={18}/><span>{t('coord')}</span></button>
      <div className="tool-separator" />
      <button className="tool-button" onClick={props.onReset}><RotateCcw size={18}/><span>{t('reset')}</span></button>
      <div className="toolbar-spacer" />
      <button className="tool-button" onClick={props.onOpenSettings}><Settings size={18}/><span>{t('settings')}</span></button>
    </div>
  )
}
