$port = 8000
Write-Host "Aggressively cleaning port $port..."

for ($i = 0; $i -lt 10; $i++) {
    $processes = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
    if ($processes) {
        foreach ($proc in $processes) {
            $pid_val = $proc.OwningProcess
            if ($pid_val -ne 0) {
                Write-Host "Killing PID $pid_val on port $port"
                Stop-Process -Id $pid_val -Force -ErrorAction SilentlyContinue
            }
        }
    }
    # Also kill by name
    Get-Process -Name "python" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    
    Start-Sleep -Seconds 1
}

# 2. Kill by Name (Python/Uvicorn) - CAREFUL: This kills ALL python
# taskkill /F /IM python.exe /T 

# Wait and Check
Start-Sleep -Seconds 2
$check = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
if ($check) {
    Write-Host "WARNING: Port $port still in use by PID $($check.OwningProcess)"
    exit 1
}
else {
    Write-Host "SUCCESS: Port $port is free."
    exit 0
}
