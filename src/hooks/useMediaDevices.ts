import { useCallback, useEffect, useState } from 'react'

export interface MediaDeviceOption {
  deviceId: string
  label: string
}

function optionsForKind(
  devices: MediaDeviceInfo[],
  kind: MediaDeviceKind,
  fallbackLabel: string,
) {
  return devices
    .filter((device) => device.kind === kind)
    .map((device, index) => ({
      deviceId: device.deviceId,
      label: device.label || `${fallbackLabel} ${index + 1}`,
    }))
}

export function useMediaDevices() {
  const [videoInputs, setVideoInputs] = useState<MediaDeviceOption[]>([])
  const [audioInputs, setAudioInputs] = useState<MediaDeviceOption[]>([])

  const refreshDevices = useCallback(async () => {
    const mediaDevices = navigator.mediaDevices
    if (!mediaDevices?.enumerateDevices) return

    try {
      const devices = await mediaDevices.enumerateDevices()
      setVideoInputs(optionsForKind(devices, 'videoinput', '摄像头'))
      setAudioInputs(optionsForKind(devices, 'audioinput', '麦克风'))
    } catch {
      // Device discovery can be blocked before permission is granted.
    }
  }, [])

  useEffect(() => {
    const mediaDevices = navigator.mediaDevices
    void refreshDevices()
    if (!mediaDevices?.addEventListener) return

    mediaDevices.addEventListener('devicechange', refreshDevices)
    return () =>
      mediaDevices.removeEventListener('devicechange', refreshDevices)
  }, [refreshDevices])

  return { videoInputs, audioInputs, refreshDevices }
}
