param(
  [switch]$Probe
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$utf8 = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = $utf8
$OutputEncoding = $utf8

function Write-VoiceEvent {
  param([hashtable]$Value)
  [Console]::Out.WriteLine(($Value | ConvertTo-Json -Compress -Depth 3))
  [Console]::Out.Flush()
}

function U {
  param([string]$Value)
  return [System.Text.RegularExpressions.Regex]::Unescape($Value)
}

$engine = $null
$sourceIdentifier = 'CodexGestureDock.VoiceRecognized'

try {
  Add-Type -AssemblyName System.Speech
  $recognizers = @(
    [System.Speech.Recognition.SpeechRecognitionEngine]::InstalledRecognizers()
  )
  if ($recognizers.Count -eq 0) {
    Write-VoiceEvent @{
      type = 'unavailable'
      code = 'no-recognizer'
      message = "Windows $(U '\u6ca1\u6709\u5b89\u88c5\u517c\u5bb9\u7684\u8bed\u97f3\u8bc6\u522b\u8bed\u8a00\uff0c\u8bf7\u5148\u5b89\u88c5\u7b80\u4f53\u4e2d\u6587\u6216 English \u8bed\u97f3\u5305\u3002')"
    }
    exit 2
  }

  $currentCulture = [System.Globalization.CultureInfo]::CurrentUICulture.Name
  $recognizerInfo = $recognizers |
    Where-Object { $_.Culture.Name -eq $currentCulture -and ($_.Culture.Name -like 'zh-*' -or $_.Culture.Name -like 'en-*') } |
    Select-Object -First 1
  if ($null -eq $recognizerInfo) {
    $recognizerInfo = $recognizers |
      Where-Object { $_.Culture.Name -eq 'zh-CN' } |
      Select-Object -First 1
  }
  if ($null -eq $recognizerInfo) {
    $recognizerInfo = $recognizers |
      Where-Object { $_.Culture.Name -like 'en-*' } |
      Select-Object -First 1
  }
  if ($null -eq $recognizerInfo) {
    Write-VoiceEvent @{
      type = 'unavailable'
      code = 'unsupported-culture'
      message = "$(U '\u5f53\u524d\u53ea\u652f\u6301\u5df2\u5b89\u88c5\u7684\u7b80\u4f53\u4e2d\u6587\u6216 English Windows \u8bed\u97f3\u8bc6\u522b\u5668\u3002')"
    }
    exit 2
  }

  $cultureName = $recognizerInfo.Culture.Name
  if ($cultureName -like 'zh-*') {
    $commands = [ordered]@{}
    $commands[(U '\u52a9\u624b \u6253\u5f00\u5bf9\u8bdd')] = 'quick_chat'
    $commands[(U '\u52a9\u624b \u5f00\u59cb\u542c\u5199')] = 'dictation'
    $commands[(U '\u52a9\u624b \u6253\u5f00\u547d\u4ee4')] = 'command_menu'
    $commands[(U '\u52a9\u624b \u4ee3\u7801\u5ba1\u67e5')] = 'review'
    $commands[(U '\u52a9\u624b \u5207\u6362\u7ec8\u7aef')] = 'terminal'
    $commands[(U '\u52a9\u624b \u5207\u6362\u4fa7\u680f')] = 'sidebar'
    $commands[(U '\u52a9\u624b \u641c\u7d22\u4efb\u52a1')] = 'search_tasks'
    $commands[(U '\u52a9\u624b \u6253\u5f00\u4efb\u52a1')] = 'open_task_picker'
    $commands[(U '\u52a9\u624b \u5f00\u59cb\u76d1\u6d4b')] = 'start_monitoring'
    $commands[(U '\u52a9\u624b \u505c\u6b62\u76d1\u6d4b')] = 'stop_monitoring'
    $commands[(U '\u52a9\u624b \u6700\u5c0f\u5316\u7a97\u53e3')] = 'minimize_window'
    $commands[(U '\u52a9\u624b \u6062\u590d\u7a97\u53e3')] = 'restore_window'
    $commands[(U '\u52a9\u624b \u663e\u793a\u684c\u9762')] = 'show_desktop'
    $commands[(U '\u52a9\u624b \u4efb\u52a1\u89c6\u56fe')] = 'task_view'
    $commands[(U '\u52a9\u624b \u6253\u5f00\u8d44\u6e90\u7ba1\u7406\u5668')] = 'open_explorer'
    $commands[(U '\u52a9\u624b \u97f3\u91cf\u589e\u5927')] = 'volume_up'
    $commands[(U '\u52a9\u624b \u97f3\u91cf\u51cf\u5c0f')] = 'volume_down'
    $commands[(U '\u52a9\u624b \u9759\u97f3')] = 'volume_mute'
    $commands[(U '\u52a9\u624b \u5173\u95ed\u8bed\u97f3')] = 'disable_voice_commands'
  } else {
    $commands = [ordered]@{
      'codex open quick chat' = 'quick_chat'
      'codex start dictation' = 'dictation'
      'codex open command menu' = 'command_menu'
      'codex review code' = 'review'
      'codex switch terminal' = 'terminal'
      'codex toggle sidebar' = 'sidebar'
      'codex search tasks' = 'search_tasks'
      'codex open tasks' = 'open_task_picker'
      'codex start monitoring' = 'start_monitoring'
      'codex stop monitoring' = 'stop_monitoring'
      'codex minimize window' = 'minimize_window'
      'codex restore window' = 'restore_window'
      'codex show desktop' = 'show_desktop'
      'codex task view' = 'task_view'
      'codex open explorer' = 'open_explorer'
      'codex volume up' = 'volume_up'
      'codex volume down' = 'volume_down'
      'codex mute volume' = 'volume_mute'
      'codex disable voice' = 'disable_voice_commands'
    }
  }

  $choices = New-Object System.Speech.Recognition.Choices
  $choices.Add([string[]]@($commands.Keys))
  $builder = New-Object System.Speech.Recognition.GrammarBuilder
  $builder.Culture = $recognizerInfo.Culture
  $builder.Append($choices)
  $grammar = New-Object System.Speech.Recognition.Grammar($builder)
  $grammar.Name = 'Codex Gesture Dock fixed voice commands'
  # The parameterless constructor uses the Windows default in-process recognizer.
  # Some Windows images enumerate recognizer IDs that cannot be reopened directly.
  $engine = New-Object System.Speech.Recognition.SpeechRecognitionEngine
  $engine.LoadGrammar($grammar)

  if ($Probe) {
    Write-VoiceEvent @{
      type = 'ready'
      culture = $cultureName
      recognizer = $recognizerInfo.Description
      commandCount = $commands.Count
      listening = $false
    }
    exit 0
  }

  $engine.SetInputToDefaultAudioDevice()
  $subscription = Register-ObjectEvent `
    -InputObject $engine `
    -EventName SpeechRecognized `
    -SourceIdentifier $sourceIdentifier
  $engine.RecognizeAsync([System.Speech.Recognition.RecognizeMode]::Multiple)
  Write-VoiceEvent @{
    type = 'ready'
    culture = $cultureName
    recognizer = $recognizerInfo.Description
    commandCount = $commands.Count
    listening = $true
  }

  while ($true) {
    $eventRecord = Wait-Event -SourceIdentifier $sourceIdentifier -Timeout 1
    if ($null -eq $eventRecord) { continue }
    try {
      $result = $eventRecord.SourceEventArgs.Result
      $phrase = [string]$result.Text
      $action = $commands[$phrase]
      if ($null -ne $action) {
        Write-VoiceEvent @{
          type = 'command'
          action = [string]$action
          phrase = $phrase
          confidence = [math]::Round([double]$result.Confidence, 4)
        }
      }
    } finally {
      Remove-Event -EventIdentifier $eventRecord.EventIdentifier -ErrorAction SilentlyContinue
    }
  }
} catch {
  $message = ([string]$_.Exception.Message -replace '[\r\n\t]+', ' ').Trim()
  if ($message.Length -gt 240) { $message = $message.Substring(0, 240) }
  Write-VoiceEvent @{
    type = 'error'
    code = 'recognizer-error'
    message = $(if ($message) { $message } else { "Windows $(U '\u672c\u673a\u8bed\u97f3\u8bc6\u522b\u542f\u52a8\u5931\u8d25\u3002')" })
  }
  exit 1
} finally {
  Unregister-Event -SourceIdentifier $sourceIdentifier -ErrorAction SilentlyContinue
  if ($null -ne $engine) {
    try { $engine.RecognizeAsyncCancel() } catch { }
    try { $engine.SetInputToNull() } catch { }
    try { $engine.Dispose() } catch { }
  }
}
