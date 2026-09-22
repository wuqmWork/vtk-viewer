import type { GalvoGroupName, GalvoItem } from './types'

export const GROUP_COLORS: Record<GalvoGroupName, string> = {
  A: '#2684ff',
  B: '#18b95f',
  C: '#f8b915',
  D: '#ff671d',
  E: '#7447e8',
  F: '#16b8bd',
}

export const DEFAULT_GALVOS: GalvoItem[] = (['A','B','C','D','E','F'] as GalvoGroupName[])
  .flatMap(group => Array.from({ length: 4 }, (_, index) => ({
    id: `${group}${index}`,
    group,
    visible: true,
    color: GROUP_COLORS[group],
  })))
