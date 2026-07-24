[CmdletBinding(SupportsShouldProcess)]
param(
  [string]$TaskName = 'DiscreteMathReviewWebsite'
)

$ErrorActionPreference = 'Stop'
if (-not (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue)) {
  Write-Host "计划任务不存在：$TaskName"
  return
}

if ($PSCmdlet.ShouldProcess($TaskName, '删除离散数学网站开机启动任务')) {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
  Write-Host "已删除计划任务：$TaskName"
}
