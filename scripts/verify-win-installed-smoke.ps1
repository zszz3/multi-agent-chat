$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$Package = Get-Content (Join-Path $RepoRoot "package.json") -Raw | ConvertFrom-Json
$Installer = Join-Path $RepoRoot "dist\$($Package.productName)-$($Package.version)-x64-setup.exe"
$InstallRoot = Join-Path $env:RUNNER_TEMP "Multi Agent Chat 测试安装"
$Executable = Join-Path $InstallRoot "MultiAgentChat.exe"

if (-not (Test-Path $Installer -PathType Leaf)) {
  throw "Windows installer is missing: $Installer"
}

Remove-Item $InstallRoot -Recurse -Force -ErrorAction SilentlyContinue
$InstallerArguments = "/S `"/D=$InstallRoot`""
$InstallerProcess = Start-Process -FilePath $Installer -ArgumentList $InstallerArguments -Wait -PassThru
if ($InstallerProcess.ExitCode -ne 0) {
  throw "Silent installer exited with $($InstallerProcess.ExitCode)"
}
if (-not (Test-Path $Executable -PathType Leaf)) {
  throw "Installed executable is missing: $Executable"
}

$OriginalPath = $env:PATH
try {
  # Explorer does not inherit a developer shell PATH. Keep only Windows system tools.
  $env:PATH = "$env:SystemRoot\System32;$env:SystemRoot"
  $AppProcess = Start-Process -FilePath $Executable -WorkingDirectory $env:TEMP -PassThru
  Start-Sleep -Seconds 10
  $AppProcess.Refresh()
  if ($AppProcess.HasExited) {
    throw "Installed application exited during Explorer-style startup with code $($AppProcess.ExitCode)."
  }
  if (-not $AppProcess.CloseMainWindow()) {
    throw "Installed application did not expose a closable main window."
  }
  Wait-Process -Id $AppProcess.Id -Timeout 30
} finally {
  $env:PATH = $OriginalPath
  if ($null -ne $AppProcess) {
    $AppProcess.Refresh()
    if (-not $AppProcess.HasExited) {
      Stop-Process -Id $AppProcess.Id -Force
    }
  }
}

Write-Host "Verified installed Explorer-style launch at $Executable"
