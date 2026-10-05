# Crea en el Escritorio un acceso directo "Dashboard" que enciende el dashboard (Windows).
#   powershell -ExecutionPolicy Bypass -File scripts\crear-acceso-directo.ps1
$raiz = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$escritorio = [Environment]::GetFolderPath('Desktop')
$destino = Join-Path $escritorio 'Dashboard.lnk'

$shell = New-Object -ComObject WScript.Shell
$lnk = $shell.CreateShortcut($destino)
$lnk.TargetPath = Join-Path $raiz 'dashboard-start.bat'
$lnk.WorkingDirectory = $raiz
$lnk.IconLocation = (Join-Path $PSScriptRoot 'dashboard.ico') + ',0'
$lnk.WindowStyle = 7   # ventana minimizada: solo se ve el navegador
$lnk.Description = 'Enciende el dashboard y lo abre en el navegador'
$lnk.Save()
Write-Host "Creado: $destino"
