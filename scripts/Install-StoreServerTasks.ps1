param(
    [Parameter(Mandatory = $true)]
    [ValidateScript({ Test-Path -LiteralPath $_ -PathType Leaf })]
    [string] $PhpPath,

    [Parameter(Mandatory = $true)]
    [ValidateScript({ Test-Path -LiteralPath $_ -PathType Leaf })]
    [string] $PhpCgiPath,

    [Parameter(Mandatory = $true)]
    [ValidateScript({ Test-Path -LiteralPath $_ -PathType Leaf })]
    [string] $CaddyPath,

    [string] $AppRoot = (Split-Path $PSScriptRoot -Parent),
    [string] $TaskPrefix = 'Lox Billiard POS'
)

$ErrorActionPreference = 'Stop'
$resolvedRoot = (Resolve-Path -LiteralPath $AppRoot).Path
$runner = Join-Path $resolvedRoot 'scripts\Run-StoreProcess.ps1'
$healthRunner = Join-Path $resolvedRoot 'scripts\Test-StoreHealth.ps1'
$runtimeDirectory = Join-Path $resolvedRoot 'storage\app\server'
$caddyConfig = Join-Path $runtimeDirectory 'Caddyfile'
$publicDirectory = (Join-Path $resolvedRoot 'public').Replace('\', '/')
$accessLog = (Join-Path $resolvedRoot 'storage\logs\caddy-access.log').Replace('\', '/')

New-Item -ItemType Directory -Path $runtimeDirectory -Force | Out-Null
@"
{
    admin off
    auto_https off
}

http://127.0.0.1:8080 {
    root * "$publicDirectory"
    encode gzip
    php_fastcgi 127.0.0.1:9070
    file_server
    log {
        output file "$accessLog" {
            roll_size 10mb
            roll_keep 5
        }
    }
}
"@ | Set-Content -LiteralPath $caddyConfig -Encoding UTF8

$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
$startup = New-ScheduledTaskTrigger -AtStartup
$settingsOptions = @{
    AllowStartIfOnBatteries = $true
    DontStopIfGoingOnBatteries = $true
    StartWhenAvailable = $true
    RestartCount = 999
    RestartInterval = New-TimeSpan -Minutes 1
    ExecutionTimeLimit = [TimeSpan]::Zero
    MultipleInstances = 'IgnoreNew'
}
$settings = New-ScheduledTaskSettingsSet @settingsOptions

foreach ($role in @('php-cgi', 'caddy', 'queue', 'scheduler')) {
    $arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$runner`" -Role $role -AppRoot `"$resolvedRoot`" -PhpPath `"$PhpPath`" -PhpCgiPath `"$PhpCgiPath`" -CaddyPath `"$CaddyPath`" -CaddyConfig `"$caddyConfig`""
    $action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $arguments -WorkingDirectory $resolvedRoot
    Register-ScheduledTask -TaskName "$TaskPrefix - $role" -Action $action -Trigger $startup -Settings $settings -Principal $principal -Force | Out-Null
}

$healthArguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$healthRunner`" -AppRoot `"$resolvedRoot`""
$healthAction = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $healthArguments -WorkingDirectory $resolvedRoot
$healthTrigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 5) -RepetitionDuration (New-TimeSpan -Days 3650)
Register-ScheduledTask -TaskName "$TaskPrefix - health" -Action $healthAction -Trigger $healthTrigger -Settings $settings -Principal $principal -Force | Out-Null

Write-Output 'Store-server tasks installed. Configure Tailscale unattended access, start the tasks, then check storage/logs/health.log.'
