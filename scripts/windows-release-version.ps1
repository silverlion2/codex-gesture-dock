Set-StrictMode -Version Latest

function ConvertTo-ReleaseVersion {
  param([string]$Value)
  try {
    $parsed = [version]$Value
  } catch {
    throw "Invalid Windows release version: $Value"
  }
  if ($parsed.Major -lt 0 -or $parsed.Minor -lt 0 -or $parsed.Build -lt 0) {
    throw "Windows release version must contain major, minor, and patch: $Value"
  }
  if ($parsed.Revision -gt 0) {
    throw "Windows release version has an unexpected non-zero revision: $Value"
  }
  return [version]::new($parsed.Major, $parsed.Minor, $parsed.Build)
}

function Test-ReleaseVersionMatch {
  param([string]$Actual, [string]$Expected)
  return (ConvertTo-ReleaseVersion -Value $Actual) -eq
    (ConvertTo-ReleaseVersion -Value $Expected)
}
