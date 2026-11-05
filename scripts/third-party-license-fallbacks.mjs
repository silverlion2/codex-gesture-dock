import path from 'node:path'

// Source: https://github.com/Brooooooklyn/canvas/blob/v1.1.0/LICENSE
// Includes the MIT terms and the embedded Chromium broken-image attribution.
export const napiCanvasLicenseSha256 =
  '0b8e3b4f0042f33677406344854c1dcce3a2878eb3a3f6baee58c6f5752655ce'

export const napiCanvasParentPackage = '@napi-rs/canvas'
export const napiCanvasApprovedVersion = '1.1.0'

export const napiCanvasPlatformPackages = Object.freeze([
  '@napi-rs/canvas-win32-x64-msvc',
  '@napi-rs/canvas-linux-x64-gnu',
  '@napi-rs/canvas-linux-x64-musl',
])

export function napiCanvasLicensePath(projectRoot) {
  return path.join(
    projectRoot,
    'third_party_licenses',
    'Napi-RS-Canvas-MIT.txt',
  )
}

export function createNapiCanvasLicenseFallbacks(projectRoot) {
  const licensePath = napiCanvasLicensePath(projectRoot)
  return napiCanvasPlatformPackages.map((packageName) => [
    packageName,
    licensePath,
  ])
}

export function usesNapiCanvasParentNotice(packageName) {
  return napiCanvasPlatformPackages.includes(packageName)
}
