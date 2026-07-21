$ErrorActionPreference = 'Stop'
$maximumElements = 80
$maximumQueued = 160
$maximumObserved = 240
$safeNameTypes = @(
  'Button',
  'CheckBox',
  'MenuItem',
  'RadioButton',
  'TabItem',
  'TitleBar',
  'ToolBar',
  'Window'
)

function Get-SafeString {
  param(
    [AllowNull()]
    [object]$Value,
    [int]$Maximum = 120
  )

  if ($null -eq $Value) { return '' }
  $text = ([string]$Value) -replace '[\r\n\t]+', ' '
  $text = ($text -replace '\s+', ' ').Trim()
  if ($text.Length -gt $Maximum) { return $text.Substring(0, $Maximum) }
  return $text
}

function Test-PatternSupport {
  param(
    [object]$Element,
    [object]$Pattern
  )

  try {
    return $null -ne $Element.GetCurrentPattern($Pattern)
  } catch {
    return $false
  }
}

if (-not $PSScriptRoot) { exit 6 }
. (Join-Path $PSScriptRoot 'codex-window-policy.ps1')
$targetIdentity = Get-CodexTargetIdentity
if (-not $targetIdentity) { exit 2 }
$target = $targetIdentity.process
$identity = $targetIdentity.identity
if (-not $identity.verified) { exit 5 }

try {
  Add-Type -AssemblyName UIAutomationClient
  Add-Type -AssemblyName UIAutomationTypes
  $root = [System.Windows.Automation.AutomationElement]::FromHandle(
    [System.IntPtr]$target.MainWindowHandle
  )
  if ($null -eq $root) { exit 5 }

  $walker = [System.Windows.Automation.TreeWalker]::ControlViewWalker
  $queue = New-Object System.Collections.Queue
  $results = New-Object System.Collections.ArrayList
  $truncated = $false
  $observed = 0

  $child = $walker.GetFirstChild($root)
  while ($null -ne $child) {
    if ($queue.Count -ge $maximumQueued) {
      $truncated = $true
      break
    }
    $queue.Enqueue($child)
    $child = $walker.GetNextSibling($child)
  }

  while (
    $queue.Count -gt 0 -and
    $results.Count -lt $maximumElements -and
    $observed -lt $maximumObserved
  ) {
    $element = [System.Windows.Automation.AutomationElement]$queue.Dequeue()
    $observed += 1

    try {
      $current = $element.Current
      $controlType = Get-SafeString (
        $current.ControlType.ProgrammaticName -replace '^ControlType\.', ''
      ) 48
      $isPassword = [bool]$current.IsPassword
      $exposeName = (-not $isPassword) -and ($safeNameTypes -contains $controlType)
      $name = if ($exposeName) { Get-SafeString $current.Name } else { '' }

      [void]$results.Add([pscustomobject]@{
        controlType = $controlType
        automationId = Get-SafeString $current.AutomationId
        name = $name
        nameRedacted = -not $exposeName
        isEnabled = [bool]$current.IsEnabled
        isOffscreen = [bool]$current.IsOffscreen
        isKeyboardFocusable = [bool]$current.IsKeyboardFocusable
        supportsInvoke = Test-PatternSupport $element ([System.Windows.Automation.InvokePattern]::Pattern)
        supportsToggle = Test-PatternSupport $element ([System.Windows.Automation.TogglePattern]::Pattern)
        supportsSelectionItem = Test-PatternSupport $element ([System.Windows.Automation.SelectionItemPattern]::Pattern)
      })
    } catch {
      # A control may disappear while the tree is inspected. Skip it safely.
    }

    $child = $walker.GetFirstChild($element)
    while ($null -ne $child) {
      if ($queue.Count -ge $maximumQueued) {
        $truncated = $true
        break
      }
      $queue.Enqueue($child)
      $child = $walker.GetNextSibling($child)
    }
  }

  if ($queue.Count -gt 0 -or $observed -ge $maximumObserved) { $truncated = $true }

  [pscustomobject]@{
    ok = $true
    mode = 'read-only'
    processId = $target.Id
    processName = Get-SafeString $target.ProcessName 64
    windowTitle = Get-SafeString $target.MainWindowTitle
    identityVerified = $identity.verified
    identityType = $identity.type
    packageName = $identity.packageName
    packageFamily = $identity.packageFamily
    publisher = $identity.publisher
    elementCount = $results.Count
    observedCount = $observed
    truncated = $truncated
    elements = @($results)
  } | ConvertTo-Json -Depth 4 -Compress
  exit 0
} catch {
  exit 5
}
