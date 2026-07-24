[CmdletBinding(SupportsShouldProcess)]
param(
  [int]$Port = 3000,
  [string]$RuleName = 'Discrete Math Review Website'
)

$ErrorActionPreference = 'Stop'
if ($Port -lt 1 -or $Port -gt 65535) {
  throw '端口必须在 1 到 65535 之间。'
}

$identity = [System.Security.Principal.WindowsIdentity]::GetCurrent()
$principal = [System.Security.Principal.WindowsPrincipal]::new($identity)
$isAdmin = $principal.IsInRole([System.Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin -and -not $WhatIfPreference) {
  throw '请使用“以管理员身份运行”的 PowerShell 执行此脚本。'
}

$existing = Get-NetFirewallRule -DisplayName $RuleName -ErrorAction SilentlyContinue
if ($existing) {
  Write-Host "防火墙规则已存在：$RuleName"
  return
}

# 只开放专用网络，并把远程来源限制在当前本地子网。
if ($PSCmdlet.ShouldProcess("$RuleName (TCP $Port)", '创建 Windows 防火墙入站规则')) {
  New-NetFirewallRule `
    -DisplayName $RuleName `
    -Direction Inbound `
    -Action Allow `
    -Protocol TCP `
    -LocalPort $Port `
    -Profile Private `
    -RemoteAddress LocalSubnet | Out-Null
  Write-Host "已开放专用网络本地子网端口：$Port"
}
