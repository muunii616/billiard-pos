param(
    [Parameter(Mandatory = $true)]
    [string] $AppRoot,

    [string] $HealthUrl = 'http://127.0.0.1:8080/up'
)

$ErrorActionPreference = 'Stop'
$resolvedRoot = (Resolve-Path -LiteralPath $AppRoot).Path
$environmentFile = Join-Path $resolvedRoot '.env'
$tokenLine = if (Test-Path -LiteralPath $environmentFile) {
    Get-Content -LiteralPath $environmentFile | Where-Object { $_ -match '^POS_HEALTH_TOKEN=' } | Select-Object -First 1
} else {
    $null
}
$token = if ($tokenLine) { ($tokenLine -split '=', 2)[1].Trim().Trim('"').Trim("'") } else { '' }
$log = Join-Path $resolvedRoot 'storage\logs\health.log'

try {
    if (-not $token) {
        throw 'POS_HEALTH_TOKEN is not configured.'
    }

    $response = Invoke-RestMethod -Uri $HealthUrl -Headers @{ Authorization = "Bearer $token" } -TimeoutSec 15
    if ($response.status -ne 'healthy') {
        throw 'The application reported an unhealthy state.'
    }

    exit 0
}
catch {
    Add-Content -LiteralPath $log -Value "$(Get-Date -Format o) health check failed: $($_.Exception.Message)"
    exit 1
}
