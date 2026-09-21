import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react'
import { useI18n } from '../i18n'

type Props = {
  playing: boolean
  speed: number
  layer: number
  totalLayers: number
  maxSpeed: number
  onTogglePlaying: () => void
  onSpeedChange: (value: number) => void
  onLayerChange: (value: number) => void
  onPreviousLayer: () => void
  onNextLayer: () => void
  onScrubStateChange: (scrubbing: boolean) => void
}

export function PlaybackPanel({
  playing,
  speed,
  layer,
  totalLayers,
  maxSpeed,
  onTogglePlaying,
  onSpeedChange,
  onLayerChange,
  onPreviousLayer,
  onNextLayer,
  onScrubStateChange,
}: Props) {
  const { t } = useI18n()
  const endScrub = () => onScrubStateChange(false)

  return (
    <div className="playback-panel">
      <div className="playback-row">
        <button className="nav-button" aria-label={t('previousLayer')} onClick={onPreviousLayer}>
          <ChevronLeft size={20} />
        </button>

        <button className="play-button" onClick={onTogglePlaying}>
          {playing ? <Pause size={18} /> : <Play size={18} />}
          <span>{playing ? t('pause') : t('play')}</span>
        </button>

        <button className="nav-button" aria-label={t('nextLayer')} onClick={onNextLayer}>
          <ChevronRight size={20} />
        </button>

        <span className="control-label">{t('speed')}</span>
        <input
          className="range"
          type="range"
          min={1}
          max={maxSpeed}
          step={1}
          value={speed}
          onChange={(e) => onSpeedChange(Number(e.target.value))}
        />
        <span className="value-label">{speed} {t('layersPerSecond')}</span>
      </div>

      <div className="playback-row">
        <span className="control-label">{t('layer')}</span>
        <span className="layer-value">{layer} / {totalLayers}</span>
        <input
          className="range"
          type="range"
          min={0}
          max={totalLayers}
          value={layer}
          onPointerDown={() => onScrubStateChange(true)}
          onPointerUp={endScrub}
          onPointerCancel={endScrub}
          onBlur={endScrub}
          onKeyDown={() => onScrubStateChange(true)}
          onKeyUp={endScrub}
          onChange={(e) => onLayerChange(Number(e.target.value))}
        />
      </div>
    </div>
  )
}
