export type CameraFraming = 'cover' | 'contain'

export interface MediaPreferences {
  videoDeviceId: string
  audioDeviceId: string
  cameraFraming: CameraFraming
  cameraMirrored: boolean
}

const STORAGE_KEY = 'codex-gesture-dock.media-preferences.v1'

const defaults: MediaPreferences = {
  videoDeviceId: '',
  audioDeviceId: '',
  cameraFraming: 'cover',
  cameraMirrored: true,
}

function isMediaPreferences(value: unknown): value is MediaPreferences {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<MediaPreferences>
  return (
    typeof candidate.videoDeviceId === 'string' &&
    typeof candidate.audioDeviceId === 'string' &&
    (candidate.cameraFraming === 'cover' ||
      candidate.cameraFraming === 'contain') &&
    typeof candidate.cameraMirrored === 'boolean'
  )
}

export function loadMediaPreferences(): MediaPreferences {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (!stored) return { ...defaults }
    const parsed: unknown = JSON.parse(stored)
    return isMediaPreferences(parsed) ? parsed : { ...defaults }
  } catch {
    return { ...defaults }
  }
}

export function saveMediaPreferences(preferences: MediaPreferences) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences))
  } catch {
    // Device preferences are a convenience; media controls remain functional.
  }
}
