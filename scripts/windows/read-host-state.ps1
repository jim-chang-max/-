$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$taskName = 'DiscreteMathReviewWebsite'
$firewallRuleName = 'Discrete Math Review Website'
$result = [ordered]@{}

try {
  $task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
  if ($null -eq $task) {
    $result.startupTask = @{
      accessible = $true
      installed = $false
      state = 'not_installed'
    }
  } else {
    $result.startupTask = @{
      accessible = $true
      installed = $true
      state = [string]$task.State
      enabled = [bool]$task.Settings.Enabled
    }
  }
} catch {
  $result.startupTask = @{
    accessible = $false
    installed = $false
    state = 'unknown'
  }
}

try {
  $rules = @(Get-NetFirewallRule -DisplayName $firewallRuleName -ErrorAction SilentlyContinue)
  if ($rules.Count -eq 0) {
    $result.firewall = @{
      accessible = $true
      installed = $false
      state = 'not_installed'
    }
  } else {
    $rule = $rules[0]
    $portFilter = $rule | Get-NetFirewallPortFilter
    $addressFilter = $rule | Get-NetFirewallAddressFilter
    $result.firewall = @{
      accessible = $true
      installed = $true
      enabled = [string]$rule.Enabled
      profile = [string]$rule.Profile
      direction = [string]$rule.Direction
      action = [string]$rule.Action
      protocol = [string]$portFilter.Protocol
      localPort = [string]$portFilter.LocalPort
      remoteAddress = [string]$addressFilter.RemoteAddress
    }
  }
} catch {
  $result.firewall = @{
    accessible = $false
    installed = $false
    state = 'unknown'
  }
}

try {
  $profiles = @(
    Get-NetConnectionProfile |
      Where-Object { $_.IPv4Connectivity -ne 'Disconnected' } |
      Select-Object Name, InterfaceAlias, NetworkCategory, IPv4Connectivity
  )
  $result.networkProfiles = @{
    accessible = $true
    items = $profiles
  }
} catch {
  $result.networkProfiles = @{
    accessible = $false
    items = @()
  }
}

$result | ConvertTo-Json -Depth 6 -Compress
