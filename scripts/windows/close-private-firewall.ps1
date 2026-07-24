[CmdletBinding(SupportsShouldProcess)]
param(
  [string]$RuleName = 'Discrete Math Review Website'
)

$ErrorActionPreference = 'Stop'
$existing = Get-NetFirewallRule -DisplayName $RuleName -ErrorAction SilentlyContinue
if (-not $existing) {
  Write-Host "防火墙规则不存在：$RuleName"
  return
}

if ($PSCmdlet.ShouldProcess($RuleName, '删除 Windows 防火墙入站规则')) {
  Remove-NetFirewallRule -DisplayName $RuleName
  Write-Host "已删除防火墙规则：$RuleName"
}
