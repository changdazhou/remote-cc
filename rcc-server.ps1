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
$ErrLogFile  = "$env:TEMP\rcc.err.log"
# 兼容 Windows PowerShell 5.1（不支持 ?. 运算符）
$NodeCmd     = Get-Command node -ErrorAction SilentlyContinue
$NodeExe     = if ($NodeCmd) { $NodeCmd.Source } else { $null }
if (-not $NodeExe) { Write-Error "Node.js not found in PATH"; exit 1 }

$Env:RC_USER  = if ($env:RC_USER)  { $env:RC_USER  } else { "admin" }
$Env:RC_PASS  = if ($env:RC_PASS)  { $env:RC_PASS  } else { "changeme" }
$Env:PORT     = if ($env:PORT)     { $env:PORT     } else { "8310" }

# pid 文件残留时 PID 可能已被无关进程复用：核对命令行确实是本服务的 index.js，避免误杀
function Is-RccPid($procId) {
    if (-not $procId) { return $false }
    $proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
    if ($proc -eq $null) { return $false }
    $cim = Get-CimInstance Win32_Process -Filter "ProcessId = $procId" -ErrorAction SilentlyContinue
    if ($cim -eq $null -or -not $cim.CommandLine) { return $true }
    return $cim.CommandLine -like "*index.js*"
}

function Is-Running {
    if (-not (Test-Path $PidFile)) { return $false }
    $serverPid = Get-Content $PidFile -ErrorAction SilentlyContinue
    return Is-RccPid $serverPid
}

function Start-Server {
    if (Is-Running) {
        Write-Host "rcc-server already running (pid $(Get-Content $PidFile))"
        return
    }
    Write-Host "Starting rcc-server on port $($Env:PORT)..."
    $proc = Start-Process -FilePath $NodeExe `
        -ArgumentList ('"' + (Join-Path $ServerDir "index.js") + '"') `
        -WorkingDirectory $ServerDir `
        -RedirectStandardOutput $LogFile `
        -RedirectStandardError $ErrLogFile `
        -PassThru -WindowStyle Hidden
    $proc.Id | Set-Content $PidFile
    Start-Sleep -Seconds 2
    if (Is-Running) {
        Write-Host "Started (pid $($proc.Id)), log: $LogFile"
    } else {
        Write-Error "Failed to start. Check log: $LogFile / $ErrLogFile"
    }
}

function Stop-Server {
    if (-not (Is-Running)) { Write-Host "rcc-server not running"; Remove-Item $PidFile -ErrorAction SilentlyContinue; return }
    $serverPid = Get-Content $PidFile
    Write-Host "Stopping rcc-server (pid $serverPid)..."
    Stop-Process -Id $serverPid -Force -ErrorAction SilentlyContinue
    Remove-Item $PidFile -ErrorAction SilentlyContinue
    # 强制结束不会触发 index.js 的退出清理，残留的 lock / token 会让下次启动误判
    Remove-Item (Join-Path $HOME ".rcc\server.lock") -ErrorAction SilentlyContinue
    Remove-Item (Join-Path $HOME ".rcc\local.token") -ErrorAction SilentlyContinue
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
