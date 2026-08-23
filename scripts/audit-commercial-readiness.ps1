[CmdletBinding()]
param(
  [string]$Repository = "silverlion2/codex-gesture-dock",
  [string]$ReportPath = "work/commercial-release-audit.json",
  [switch]$FailOnBlockers
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$package = Get-Content -LiteralPath (Join-Path $projectRoot "package.json") -Raw |
  ConvertFrom-Json
$version = [string]$package.version
$blockers = [Collections.Generic.List[object]]::new()

function Add-Blocker {
  param([string]$Code, [string]$Message)
  $blockers.Add([ordered]@{ code = $Code; message = $Message })
}

function Invoke-GhJson {
  param([string[]]$Arguments)
  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = "SilentlyContinue"
  $raw = & gh @Arguments 2>$null
  $exitCode = $LASTEXITCODE
  $ErrorActionPreference = $previousErrorActionPreference
  if ($exitCode -ne 0) {
    return $null
  }
  $text = $raw | Out-String
  if ([string]::IsNullOrWhiteSpace($text)) {
    return @()
  }
  return $text | ConvertFrom-Json
}

function Invoke-GitText {
  param([string[]]$Arguments)
  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = "SilentlyContinue"
  $raw = & git -C $projectRoot @Arguments 2>$null
  $exitCode = $LASTEXITCODE
  $ErrorActionPreference = $previousErrorActionPreference
  if ($exitCode -ne 0) {
    return ""
  }
  return ($raw | Out-String).Trim()
}

function As-Items {
  param($Value)
  if ($null -eq $Value) {
    return @()
  }
  return @($Value | Where-Object { $null -ne $_ })
}

function Test-RefPattern {
  param(
    [string]$Pattern,
    [string]$Ref,
    [string]$DefaultRef
  )
  if ($Pattern -eq "~ALL") {
    return $true
  }
  if ($Pattern -eq "~DEFAULT_BRANCH") {
    return $Ref -eq $DefaultRef
  }
  if ([string]::IsNullOrWhiteSpace($Pattern)) {
    return $false
  }
  $wildcard = [Management.Automation.WildcardPattern]::new(
    $Pattern,
    [Management.Automation.WildcardOptions]::IgnoreCase
  )
  return $wildcard.IsMatch($Ref)
}

function Test-RulesetProtectsRef {
  param(
    $Ruleset,
    [string]$Target,
    [string]$Ref,
    [string]$DefaultRef
  )
  if ($Ruleset.enforcement -ne "active" -or $Ruleset.target -ne $Target) {
    return $false
  }
  $detail = Invoke-GhJson @("api", "repos/$Repository/rulesets/$($Ruleset.id)")
  if (-not $detail) {
    return $false
  }
  $include = @($detail.conditions.ref_name.include)
  $exclude = @($detail.conditions.ref_name.exclude)
  $included = @(
    $include | Where-Object {
      Test-RefPattern -Pattern ([string]$_) -Ref $Ref -DefaultRef $DefaultRef
    }
  ).Count -gt 0
  $excluded = @(
    $exclude | Where-Object {
      Test-RefPattern -Pattern ([string]$_) -Ref $Ref -DefaultRef $DefaultRef
    }
  ).Count -gt 0
  return $included -and -not $excluded
}

$branch = Invoke-GitText @("branch", "--show-current")
$head = Invoke-GitText @("rev-parse", "HEAD")
$remoteLine = Invoke-GitText @("ls-remote", "origin", "refs/heads/main")
$remoteMain = if ($remoteLine) { ($remoteLine -split "\s+")[0] } else { "" }
$worktreeChanges = @(& git -C $projectRoot status --porcelain=v1)
$worktreeClean = $worktreeChanges.Count -eq 0
if (-not $worktreeClean) {
  Add-Blocker "worktree-not-clean" "The release candidate has uncommitted or untracked files."
}
if ($branch -ne "main") {
  Add-Blocker "wrong-branch" "The release candidate is not on main."
}
if (-not $remoteMain) {
  Add-Blocker "origin-main-unavailable" "origin/main could not be resolved; check network access and the configured remote."
}
if (-not $remoteMain -or $head -ne $remoteMain -or -not $worktreeClean) {
  Add-Blocker "candidate-not-pushed" "The exact candidate source is not present on origin/main."
}

$secretResult = Invoke-GhJson @(
  "secret", "list", "--repo", $Repository, "--json", "name,updatedAt"
)
$variableResult = Invoke-GhJson @(
  "variable", "list", "--repo", $Repository, "--json", "name,updatedAt"
)
$secrets = As-Items $secretResult
$variables = As-Items $variableResult
$secretNames = @($secrets | ForEach-Object { [string]$_.name })
$variableNames = @($variables | ForEach-Object { [string]$_.name })

foreach ($requiredSecret in @("WIN_CSC_LINK", "WIN_CSC_KEY_PASSWORD")) {
  if ($secretNames -notcontains $requiredSecret) {
    Add-Blocker "missing-secret" "GitHub Actions secret $requiredSecret is not configured."
  }
}
if ($variableNames -notcontains "WIN_CSC_SUBJECT") {
  Add-Blocker "missing-variable" "GitHub Actions variable WIN_CSC_SUBJECT is not configured."
}

$previousErrorActionPreference = $ErrorActionPreference
$ErrorActionPreference = "SilentlyContinue"
$classicProtectionRaw = & gh api "repos/$Repository/branches/main/protection" 2>$null
$classicProtectionExitCode = $LASTEXITCODE
$ErrorActionPreference = $previousErrorActionPreference
$classicProtection = $classicProtectionExitCode -eq 0 -and -not [string]::IsNullOrWhiteSpace(
  ($classicProtectionRaw | Out-String)
)
$rulesetResult = Invoke-GhJson @("api", "repos/$Repository/rulesets")
$rulesets = As-Items $rulesetResult
$mainRef = "refs/heads/main"
$releaseTagRef = "refs/tags/v$version"
$protectingBranchRulesets = @(
  $rulesets | Where-Object {
    Test-RulesetProtectsRef `
      -Ruleset $_ `
      -Target "branch" `
      -Ref $mainRef `
      -DefaultRef $mainRef
  }
)
$protectingTagRulesets = @(
  $rulesets | Where-Object {
    Test-RulesetProtectsRef `
      -Ruleset $_ `
      -Target "tag" `
      -Ref $releaseTagRef `
      -DefaultRef $mainRef
  }
)
$branchProtected = $classicProtection -or $protectingBranchRulesets.Count -gt 0
if (-not $branchProtected) {
  Add-Blocker "main-not-protected" "main has no active branch protection or branch ruleset."
}
if ($protectingTagRulesets.Count -eq 0) {
  Add-Blocker "release-tag-not-protected" "The candidate v* release tag is not covered by an active tag ruleset."
}

$release = Invoke-GhJson @(
  "release", "view", "--repo", $Repository,
  "--json", "tagName,isDraft,isPrerelease,publishedAt"
)
$publishedTag = if ($release) { [string]$release.tagName } else { "" }
$publishedVersion = $publishedTag.TrimStart("v")
$candidateVersionIsNewer = $false
if ($publishedVersion) {
  try {
    $candidateVersionIsNewer = [version]$version -gt [version]$publishedVersion
  } catch {
    $candidateVersionIsNewer = $false
  }
}
if (-not $candidateVersionIsNewer) {
  Add-Blocker "version-not-newer" "Candidate $version is not newer than published $publishedTag."
}

$artifactNames = @(
  "Codex-Gesture-Dock-$version-setup.exe",
  "Codex-Gesture-Dock-$version-portable.exe",
  "win-unpacked/Codex Gesture Dock.exe"
)
$signatureResults = foreach ($name in $artifactNames) {
  $path = Join-Path $projectRoot "artifacts/$name"
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
    [ordered]@{ name = $name; status = "Missing"; signer = ""; timestampSigner = "" }
    continue
  }
  try {
    $signature = Get-AuthenticodeSignature -LiteralPath $path -ErrorAction Stop
  } catch {
    [ordered]@{
      name = $name
      status = "Unavailable"
      signer = ""
      timestampSigner = ""
      error = $_.Exception.Message
    }
    continue
  }
  [ordered]@{
    name = $name
    status = [string]$signature.Status
    signer = if ($signature.SignerCertificate) {
      $signature.SignerCertificate.Subject
    } else {
      ""
    }
    timestampSigner = if ($signature.TimeStamperCertificate) {
      $signature.TimeStamperCertificate.Subject
    } else {
      ""
    }
  }
}
$signaturesValid = @(
  $signatureResults |
    Where-Object {
      $_.status -ne "Valid" -or
      -not $_.signer -or
      -not $_.timestampSigner
    }
).Count -eq 0
if (-not $signaturesValid) {
  Add-Blocker "candidate-not-signed" "Candidate executables are not valid, timestamped Authenticode artifacts."
}

$installReportPath = Join-Path $projectRoot "work/windows-install-verification.json"
$installReport = if (Test-Path -LiteralPath $installReportPath -PathType Leaf) {
  Get-Content -LiteralPath $installReportPath -Raw | ConvertFrom-Json
} else {
  $null
}
$upgradeVerified = [bool](
  $installReport -and
  $installReport.upgradeTested -eq $true -and
  $installReport.smokePassed -eq $true -and
  $installReport.uninstallPassed -eq $true
)
if (-not $upgradeVerified) {
  Add-Blocker "upgrade-not-verified" "No passing real N-to-N+1 install/upgrade/uninstall report exists."
}

$signedUpdateReportPath = Join-Path $projectRoot "work/signed-update-verification.json"
$signedUpdateReport = if (Test-Path -LiteralPath $signedUpdateReportPath -PathType Leaf) {
  Get-Content -LiteralPath $signedUpdateReportPath -Raw | ConvertFrom-Json
} else {
  $null
}
$signedUpdateVerified = [bool](
  $signedUpdateReport -and
  $signedUpdateReport.passed -eq $true
)
if (-not $signedUpdateVerified) {
  Add-Blocker "signed-update-not-verified" "No passing signed updater N-to-N+1 report exists."
}

$runResult = Invoke-GhJson @(
  "run", "list", "--repo", $Repository, "--commit", $head, "--limit", "20",
  "--json", "workflowName,headSha,status,conclusion,url"
)
$runs = As-Items $runResult
$requiredWorkflowNames = @("CI", "Security")
$candidateChecks = foreach ($workflowName in $requiredWorkflowNames) {
  $run = $runs |
    Where-Object {
      $_.workflowName -eq $workflowName -and
      $_.headSha -eq $head -and
      $_.status -eq "completed"
    } |
    Select-Object -First 1
  [ordered]@{
    workflow = $workflowName
    passed = [bool](
      $worktreeClean -and
      $head -eq $remoteMain -and
      $run -and
      $run.conclusion -eq "success"
    )
    url = if ($run) { [string]$run.url } else { "" }
  }
}
if (@($candidateChecks | Where-Object { -not $_.passed }).Count -gt 0) {
  Add-Blocker "candidate-checks-missing" "CI and Security have not both passed for the exact candidate commit."
}

$report = [ordered]@{
  repository = $Repository
  auditedAt = [DateTime]::UtcNow.ToString("o")
  candidate = [ordered]@{
    version = $version
    branch = $branch
    head = $head
    remoteMain = $remoteMain
    worktreeClean = $worktreeClean
    worktreeChangeCount = $worktreeChanges.Count
  }
  github = [ordered]@{
    secretNames = $secretNames
    variableNames = $variableNames
    classicBranchProtection = $classicProtection
    protectingBranchRulesetCount = $protectingBranchRulesets.Count
    protectingTagRulesetCount = $protectingTagRulesets.Count
    publishedTag = $publishedTag
    candidateChecks = $candidateChecks
  }
  artifacts = [ordered]@{
    signatures = $signatureResults
    signaturesValid = $signaturesValid
    upgradeVerified = $upgradeVerified
    signedUpdateVerified = $signedUpdateVerified
  }
  ready = $blockers.Count -eq 0
  blockers = $blockers
}

$absoluteReportPath = if ([IO.Path]::IsPathRooted($ReportPath)) {
  $ReportPath
} else {
  Join-Path $projectRoot $ReportPath
}
New-Item -ItemType Directory -Path (Split-Path -Parent $absoluteReportPath) -Force |
  Out-Null
$report | ConvertTo-Json -Depth 8 |
  Set-Content -LiteralPath $absoluteReportPath -Encoding utf8

Write-Host "Commercial release readiness: $($report.ready)"
Write-Host "Blockers: $($blockers.Count)"
foreach ($blocker in $blockers) {
  Write-Host "- [$($blocker.code)] $($blocker.message)"
}
Write-Host "Report: $absoluteReportPath"

if ($FailOnBlockers -and $blockers.Count -gt 0) {
  exit 1
}
