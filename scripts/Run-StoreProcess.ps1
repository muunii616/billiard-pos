param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('php-cgi', 'caddy', 'queue', 'scheduler')]
    [string] $Role,

    [Parameter(Mandatory = $true)]
    [string] $AppRoot,

    [Parameter(Mandatory = $true)]
    [string] $PhpPath,

    [Parameter(Mandatory = $true)]
    [string] $PhpCgiPath,

    [Parameter(Mandatory = $true)]
    [string] $CaddyPath,

    [Parameter(Mandatory = $true)]
    [string] $CaddyConfig
)

$ErrorActionPreference = 'Stop'
$resolvedRoot = (Resolve-Path -LiteralPath $AppRoot).Path
$logDirectory = Join-Path $resolvedRoot 'storage\logs'
New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null

$executable = ''
$arguments = @()
switch ($Role) {
    'php-cgi' {
        $executable = $PhpCgiPath
        $arguments = @('-b', '127.0.0.1:9070')
    }
    'caddy' {
        $executable = $CaddyPath
        $arguments = @('run', '--config', $CaddyConfig, '--adapter', 'caddyfile')
    }
    'queue' {
        $executable = $PhpPath
        $arguments = @('artisan', 'queue:work', '--sleep=1', '--tries=3', '--timeout=90')
    }
    'scheduler' {
        $executable = $PhpPath
        $arguments = @('artisan', 'schedule:work', "--run-output-file=$(Join-Path $logDirectory 'scheduler-output.log')")
    }
}

$stdout = Join-Path $logDirectory "$Role-output.log"
$stderr = Join-Path $logDirectory "$Role-error.log"
foreach ($log in @($stdout, $stderr)) {
    if ((Test-Path -LiteralPath $log) -and (Get-Item -LiteralPath $log).Length -gt 10MB) {
        Move-Item -LiteralPath $log -Destination "$log.1" -Force
    }
}

$processOptions = @{
    FilePath = $executable
    ArgumentList = $arguments
    WorkingDirectory = $resolvedRoot
    WindowStyle = 'Hidden'
    RedirectStandardOutput = $stdout
    RedirectStandardError = $stderr
    Wait = $true
    PassThru = $true
}
$process = Start-Process @processOptions

exit $process.ExitCode
