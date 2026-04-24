# rcc-server.ps1 - RemoteCC Windows 服务管理脚本
# 用法:
#   .\rcc-server.ps1 start
#   .\rcc-server.ps1 stop
#   .\rcc-server.ps1 status
#   .\rcc-server.ps1 restart
#   .\rcc-server.ps1 log

param([string]$Action = "start")

$ScriptDir   = Split-Path -Parent $MyInvocation.MyCommand.Path
$ServerDir   = Join-Path $ScriptDir "server"
$PidFile     = "$env:TEMP\rcc-server.pid"
$LogFile     = "$env:TEMP\rcc.log"
$NodeExe     = (Get-Command node -ErrorAction SilentlyContinue)?.Source
if (-not $NodeExe) { Write-Error "Node.js not found in PATH"; exit 1 }

$Env:RC_USER  = if ($env:RC_USER)  { $env:RC_USER  } else { "admin" }
$Env:RC_PASS  = if ($env:RC_PASS)  { $env:RC_PASS  } else { "changeme" }
$Env:PORT     = if ($env:PORT)     { $env:PORT     } else { "8310" }

function Is-Running {
    if (-not (Test-Path $PidFile)) { return $false }
    $pid = Get-Content $PidFile -ErrorAction SilentlyContinue
    if (-not $pid) { return $false }
    $proc = Get-Process -Id $pid -ErrorAction SilentlyContinue
    return $proc -ne $null
}

function Start-Server {
    if (Is-Running) {
        Write-Host "rcc-server already running (pid $(Get-Content $PidFile))"
        return
    }
    Write-Host "Starting rcc-server on port $($Env:PORT)..."
    $proc = Start-Process -FilePath $NodeExe `
        -ArgumentList (Join-Path $ServerDir "index.js") `
        -WorkingDirectory $ServerDir `
        -RedirectStandardOutput $LogFile `
        -RedirectStandardError $LogFile `
        -PassThru -WindowStyle Hidden
    $proc.Id | Set-Content $PidFile
    Start-Sleep -Seconds 2
    if (Is-Running) {
        Write-Host "Started (pid $($proc.Id)), log: $LogFile"
    } else {
        Write-Error "Failed to start. Check log: $LogFile"
    }
}

function Stop-Server {
    if (-not (Is-Running)) { Write-Host "rcc-server not running"; Remove-Item $PidFile -ErrorAction SilentlyContinue; return }
    $pid = Get-Content $PidFile
    Write-Host "Stopping rcc-server (pid $pid)..."
    Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
    Remove-Item $PidFile -ErrorAction SilentlyContinue
    Write-Host "Stopped."
}

function Show-Status {
    if (Is-Running) {
        Write-Host "rcc-server running (pid $(Get-Content $PidFile)) on port $($Env:PORT)"
        Write-Host "Log: $LogFile"
    } else {
        Write-Host "rcc-server not running"
    }
}

switch ($Action.ToLower()) {
    "start"   { Start-Server }
    "stop"    { Stop-Server }
    "restart" { Stop-Server; Start-Sleep -Seconds 1; Start-Server }
    "status"  { Show-Status }
    "log"     { Get-Content $LogFile -Wait -Tail 50 }
    default   { Write-Error "Unknown action: $Action. Use: start|stop|restart|status|log" }
}
