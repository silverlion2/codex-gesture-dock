let runtimePromise: Promise<typeof import('@mediapipe/tasks-vision')> | null = null

export async function loadVisionRuntime() {
  if (!runtimePromise) runtimePromise = import('@mediapipe/tasks-vision')
  try {
    return await runtimePromise
  } catch (error) {
    runtimePromise = null
    throw error
  }
}
