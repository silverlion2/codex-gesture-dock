$script:CodexPackageName = 'OpenAI.Codex'
$script:CodexPackageFamilySuffix = '__2p2nqsd0c76g0'
$script:CodexPublisher = 'CN=50BDFD77-8903-4850-9FFE-6E8522F64D5B'

function Get-CodexTargetProcess {
  Get-Process | Where-Object {
    $_.MainWindowHandle -ne 0 -and (
      $_.ProcessName -eq 'Codex' -or
      ($_.ProcessName -eq 'ChatGPT' -and $_.MainWindowTitle -match '(?i)^Codex(?:\s|$)')
    )
  } | Sort-Object StartTime -Descending | Select-Object -First 1
}

function Get-CodexProcessIdentity {
  param(
    [Parameter(Mandatory = $true)]
    [object]$Process
  )

  $executablePath = ''
  try { $executablePath = [string]$Process.Path } catch { }
  $identity = [ordered]@{
    verified = $false
    type = 'unknown'
    executablePath = $executablePath
    packageName = ''
    packageFamily = ''
    publisher = ''
    message = 'Codex executable identity could not be verified'
  }

  if ([string]::IsNullOrWhiteSpace($executablePath)) {
    return [pscustomobject]$identity
  }

  $fileName = [System.IO.Path]::GetFileName($executablePath)
  $appDirectory = Split-Path -Parent $executablePath
  $packageDirectory = Split-Path -Parent $appDirectory
  $packageFolderName = Split-Path -Leaf $packageDirectory
  $windowsAppsRoot = Join-Path $env:ProgramFiles 'WindowsApps'

  if (
    $fileName -eq 'ChatGPT.exe' -and
    $appDirectory -eq (Join-Path $packageDirectory 'app') -and
    $packageDirectory.StartsWith($windowsAppsRoot, [System.StringComparison]::OrdinalIgnoreCase) -and
    $packageFolderName.StartsWith('OpenAI.Codex_', [System.StringComparison]::OrdinalIgnoreCase) -and
    $packageFolderName.EndsWith($script:CodexPackageFamilySuffix, [System.StringComparison]::OrdinalIgnoreCase)
  ) {
    $identity.type = 'msix'
    $manifestPath = Join-Path $packageDirectory 'AppxManifest.xml'
    try {
      [xml]$manifest = Get-Content -LiteralPath $manifestPath -Raw -ErrorAction Stop
      $manifestIdentity = $manifest.Package.Identity
      $identity.packageName = [string]$manifestIdentity.Name
      $identity.packageFamily = $packageFolderName
      $identity.publisher = [string]$manifestIdentity.Publisher
      $identity.verified =
        $identity.packageName -eq $script:CodexPackageName -and
        $identity.publisher -eq $script:CodexPublisher
      $identity.message = if ($identity.verified) {
        'Codex MSIX package identity verified'
      } else {
        'Codex MSIX manifest identity mismatch'
      }
    } catch {
      $identity.message = 'Codex MSIX manifest could not be read'
    }
    return [pscustomobject]$identity
  }

  if ($fileName -eq 'Codex.exe') {
    $identity.type = 'authenticode'
    try {
      $signature = Get-AuthenticodeSignature -LiteralPath $executablePath
      $identity.publisher = if ($signature.SignerCertificate) {
        [string]$signature.SignerCertificate.Subject
      } else {
        ''
      }
      $identity.verified =
        $signature.Status -eq [System.Management.Automation.SignatureStatus]::Valid -and
        $identity.publisher -match '(?i)\bOpenAI\b'
      $identity.message = if ($identity.verified) {
        'Codex Authenticode identity verified'
      } else {
        'Codex Authenticode signature or publisher mismatch'
      }
    } catch {
      $identity.message = 'Codex Authenticode signature could not be read'
    }
  }

  return [pscustomobject]$identity
}

function Get-CodexTargetIdentity {
  $target = Get-CodexTargetProcess
  if (-not $target) { return $null }
  [pscustomobject]@{
    process = $target
    identity = Get-CodexProcessIdentity -Process $target
  }
}
