import type { CoordMode } from '../types'
import { useI18n } from '../i18n'

type Props = {
  value: CoordMode
  onChange: (value: CoordMode) => void
  onClose: () => void
}

export function CoordMenu({ value, onChange, onClose }: Props) {
  const { t } = useI18n()
  const items: Array<{ value: CoordMode; label: string }> = [
    { value: 'off', label: t('coordOff') },
    { value: 'global', label: t('globalCoord') },
    { value: 'local', label: t('localCoord') },
  ]

  return (
    <div className="coord-popover" onMouseLeave={onClose}>
      <div className="coord-popover-title">{t('coord')}</div>
      {items.map(item => (
        <button
          key={item.value}
          className="coord-item"
          onClick={() => {
            onChange(item.value)
            onClose()
          }}
        >
          <span className="checkmark">{value === item.value ? '✓' : ''}</span>
          <span>{item.label}</span>
        </button>
      ))}
    </div>
  )
}
