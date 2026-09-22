import { ChevronDown, Eye, EyeOff } from 'lucide-react'
import type { GalvoGroupName, GalvoItem } from '../types'
import { useI18n } from '../i18n'

type Props = {
  galvos: GalvoItem[]
  onToggleGalvo: (id: string) => void
  onChangeColor: (id: string, color: string) => void
}

export function GalvoSidebar({ galvos, onToggleGalvo, onChangeColor }: Props) {
  const { t } = useI18n()
  const groups = ['A','B','C','D','E','F'] as GalvoGroupName[]

  return (
    <aside className="galvo-sidebar">
      {groups.map(group => {
        const items = galvos.filter(item => item.group === group)
        const groupColor = items[0]?.color ?? '#999'

        return (
          <section className="galvo-group" key={group}>
            <div className="galvo-group-header">
              <ChevronDown size={15} />
              <input
                className="group-color-input"
                type="color"
                value={groupColor}
                onChange={(e) => items.forEach(item => onChangeColor(item.id, e.target.value))}
                title={`${group}组颜色`}
              />
              <strong>{group}</strong>
            </div>

            <div className="galvo-group-items">
              {items.map(item => (
                <div className="galvo-row" key={item.id}>
                  <button
                    className="icon-button"
                    onClick={() => onToggleGalvo(item.id)}
                    title={item.visible ? t('hidden') : t('shown')}
                  >
                    {item.visible ? <Eye size={16} /> : <EyeOff size={16} />}
                  </button>

                  <input
                    className="galvo-color-input"
                    type="color"
                    value={item.color}
                    onChange={(e) => onChangeColor(item.id, e.target.value)}
                    title={`${item.id}颜色`}
                  />

                  <span>{item.id}</span>
                </div>
              ))}
            </div>
          </section>
        )
      })}
    </aside>
  )
}
