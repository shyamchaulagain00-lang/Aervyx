# =============================================================================
#  build.ps1 - build the injection lab practice target
# =============================================================================
#
#  Same dependency-free shape as luau-embed-demo/build-msvc.ps1: nothing beyond
#  the Visual Studio "Desktop development with C++" toolset (cl.exe) is needed.
#
#  Usage:
#    pwsh -File .\build.ps1
# =============================================================================

[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$root    = $PSScriptRoot
$outDir  = Join-Path $root 'build'
$exePath = Join-Path $outDir 'aervyx_injection_target.exe'

# -----------------------------------------------------------------------------
# 0. Paths are handed to cl.exe on a command line, so a space would need quoting
#    that varies per shell. Fail loudly instead of building the wrong thing.
# -----------------------------------------------------------------------------
if ($root -match '\s') { throw "The project path contains a space ($root). Move the project to a space-free path first." }

# -----------------------------------------------------------------------------
# 1. Locate the MSVC toolset and its vcvars64.bat
# -----------------------------------------------------------------------------
$vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
if (-not (Test-Path $vswhere)) {
    throw "vswhere.exe not found. Install 'Visual Studio Build Tools' with the C++ workload."
}

$vsPath = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if (-not $vsPath) {
    throw "No MSVC toolset found. Install the 'Desktop development with C++' workload."
}

$vcvars = Join-Path $vsPath 'VC\Auxiliary\Build\vcvars64.bat'
if (-not (Test-Path $vcvars)) { throw "vcvars64.bat not found at $vcvars" }
Write-Host "Using toolset: $vsPath"

New-Item -ItemType Directory -Force -Path $outDir | Out-Null

# -----------------------------------------------------------------------------
# 2. Compile and link in one cl.exe invocation
#
#    /O2 is deliberate. The state object has to survive optimisation for the lab
#    to be meaningful, and a release build is the honest test of that rather than
#    a debug build that keeps everything.
# -----------------------------------------------------------------------------
$clArgs = @(
    '/nologo'
    '/std:c++17'
    '/EHsc'
    '/O2'
    '/W3'
    '/DNDEBUG'
    '/D_CRT_SECURE_NO_WARNINGS'
    (Join-Path $root 'target.cpp')
    "/Fo$outDir\"
    "/Fe$exePath"
)

$commandLine = "call `"$vcvars`" >nul && cl " + ($clArgs -join ' ')

Write-Host "Compiling ..."
$exitCode = 0
Push-Location $outDir
try {
    & cmd /c $commandLine
    $exitCode = $LASTEXITCODE
}
finally {
    Pop-Location
}

if ($exitCode -ne 0) { throw "Compile/link failed with exit code $exitCode" }
if (-not (Test-Path $exePath)) { throw "cl.exe reported success but $exePath does not exist" }

Write-Host ""
Write-Host "Built: $exePath"
