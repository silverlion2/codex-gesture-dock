import path from 'node:path'

// Source: https://github.com/Brooooooklyn/canvas/blob/v1.0.3/LICENSE
export const napiCanvasLicenseSha256 =
  '8802fecf9da4367bc23bcf20b21cc143785fc6c92b152f3fa7fbe6ce08d344d6'

export const napiCanvasParentPackage = '@napi-rs/canvas'
export const napiCanvasApprovedVersion = '1.0.3'

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
