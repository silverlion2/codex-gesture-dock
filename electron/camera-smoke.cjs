// Explicit local-hardware acceptance probe. Never saves camera pixels/landmarks.
async function runCameraSmoke(window) {
  return window.webContents.executeJavaScript(`(async () => {
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
    const deadline = Date.now() + 45000
    const button = document.querySelector('[aria-label="一键启动极简 Windows 桌面手势控制"]')
    if (!button) throw new Error('Minimal gesture startup control is missing')
    button.click()
    let firstFrameTime = null
    let previousVideoTime = -1
    let advancingSamples = 0
    while (Date.now() < deadline) {
      const root = document.querySelector('.widget-root')
      const video = document.querySelector('video')
      if (root?.dataset.gesturePhase === 'error') {
        throw new Error(root.dataset.gestureError || 'Gesture model failed')
      }
      if (root?.dataset.cameraPhase === 'error') throw new Error('Real camera startup failed')
      if (video && video.readyState >= 2 && video.videoWidth > 0 &&
          root?.dataset.gesturePhase === 'ready' &&
          root.classList.contains('is-minimal')) {
        firstFrameTime ??= Date.now()
        if (video.currentTime > previousVideoTime) advancingSamples++
        previousVideoTime = video.currentTime
        const processedFrames = Number(root.dataset.gestureFrames || 0)
        if (Date.now() - firstFrameTime >= 8000 && advancingSamples >= 8 && processedFrames >= 8) {
          return {
            passed: true, realCamera: true, gestureModelReady: true,
            minimal: true, visible: !document.hidden,
            videoWidth: video.videoWidth, videoHeight: video.videoHeight,
            advancingSamples, processedFrames, observedMs: Date.now() - firstFrameTime,
            desktopActionsSuppressed: true,
            handGestureAccuracyVerified: false,
          }
        }
      }
      await sleep(500)
    }
    throw new Error('Camera/model/minimal readiness timed out')
  })()`, true)
}

module.exports = { runCameraSmoke }
