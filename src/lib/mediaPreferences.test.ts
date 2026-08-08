// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest'
import {
  loadMediaPreferences,
  saveMediaPreferences,
  type MediaPreferences,
} from './mediaPreferences'

const preferences: MediaPreferences = {
  videoDeviceId: 'front-camera',
  audioDeviceId: 'desk-microphone',
  cameraFraming: 'contain',
  cameraMirrored: false,
}

describe('media preferences', () => {
  beforeEach(() => window.localStorage.clear())

  it('round-trips selected devices and camera presentation', () => {
    saveMediaPreferences(preferences)
    expect(loadMediaPreferences()).toEqual(preferences)
  })

  it('falls back safely when stored data is invalid', () => {
    window.localStorage.setItem(
      'codex-gesture-dock.media-preferences.v1',
      JSON.stringify({ videoDeviceId: 42 }),
    )

    expect(loadMediaPreferences()).toEqual({
      videoDeviceId: '',
      audioDeviceId: '',
      cameraFraming: 'cover',
      cameraMirrored: true,
    })
  })
})
