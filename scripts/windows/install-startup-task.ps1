[CmdletBinding(SupportsShouldProcess)]
param(
  [string]$TaskName = 'DiscreteMathReviewWebsite',
  [switch]$StartNow
)

$ErrorActionPreference = 'Stop'
$projectDirectory = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$nodePath = (Get-Command node -ErrorAction Stop).Source
$supervisorPath = Join-Path $projectDirectory 'scripts\service-supervisor.js'
$currentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name

if ($PSCmdlet.ShouldProcess($TaskName, '注册离散数学网站开机启动任务')) {
  # 登录当前 Windows 账号后延迟 30 秒启动，给 MySQL 留出启动时间。
  $action = New-ScheduledTaskAction `
    -Execute $nodePath `
    -Argument "`"$supervisorPath`"" `
    -WorkingDirectory $projectDirectory
  $trigger = New-ScheduledTaskTrigger -AtLogOn -User $currentUser
  $trigger.Delay = 'PT30S'
  $settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -ExecutionTimeLimit ([TimeSpan]::Zero) `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 1)

  Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -User $currentUser `
    -RunLevel Limited `
    -Force | Out-Null

  if ($StartNow) {
    Start-ScheduledTask -TaskName $TaskName
  }
  Write-Host "已注册计划任务：$TaskName"
}
