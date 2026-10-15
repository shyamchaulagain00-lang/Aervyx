# =============================================================================
#  build-msvc.ps1 - build luau-embed-demo with just the MSVC toolchain
# =============================================================================
#
#  This script deliberately needs nothing but:
#    * git  (to fetch the Luau source tree, once)
#    * the Visual Studio "Desktop development with C++" toolset (cl.exe)
#
#  CMakeLists.txt exists as well, but CMake is not installed on every machine, so
#  this is the dependency-free path.
#
#  Usage:
#    pwsh -File .\build-msvc.ps1
#    pwsh -File .\build-msvc.ps1 -LuauSrc 'C:\src\luau'
#
#  Notes on the two defines that matter:
#    LUAU_EMBED=1     selects the Luau backend in main.cpp
#    LUA_USE_LONGJMP=1 matches Luau's own CMake. Without it, luaL_error() throws a
#                     C++ exception out of extern "C" code, which is undefined
#                     behaviour and skips destructors of C++ locals.
# =============================================================================

[CmdletBinding()]
param(
    [string]$LuauSrc = (Join-Path $env:LOCALAPPDATA 'luau-embed-demo\luau'),
    [string]$LuauRepo = 'https://github.com/luau-lang/luau.git'
)

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$outDir = Join-Path $root 'build'
$exePath = Join-Path $outDir 'luau_embed_demo.exe'

# -----------------------------------------------------------------------------
# 0. This script passes paths to cl.exe on a command line, so spaces would need
#    quoting that varies per shell. Fail loudly instead of building the wrong thing.
# -----------------------------------------------------------------------------
if ($root -match '\s') { throw "The project path contains a space ($root). Move the project to a space-free path first." }
if ($LuauSrc -match '\s') { throw "LuauSrc contains a space ($LuauSrc). Use a space-free path." }

# -----------------------------------------------------------------------------
# 1. Make sure the Luau sources are present
# -----------------------------------------------------------------------------
if (-not (Test-Path (Join-Path $LuauSrc 'VM\src'))) {
    Write-Host "Luau sources not found at $LuauSrc"
    Write-Host "Cloning $LuauRepo ..."
    New-Item -ItemType Directory -Force -Path (Split-Path $LuauSrc) | Out-Null
    & git clone --depth 1 $LuauRepo $LuauSrc
    if ($LASTEXITCODE -ne 0) { throw "git clone failed" }
}

# -----------------------------------------------------------------------------
# 2. Locate the MSVC toolset and its vcvars64.bat
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

# -----------------------------------------------------------------------------
# 3. Collect the Luau libraries this demo needs
#
#    Common    - shared utilities and bytecode wire format
#    Ast       - lexer/parser used by the Compiler library
#    Bytecode  - bytecode builder used by the Compiler library
#    Compiler  - provides luau_compile()  (source -> bytecode)
#    VM        - provides luau_load(), lua_pcall() and the lua_* C API
#
#    CodeGen / Analysis / Inliner are NOT needed: they are for native code
#    generation and static analysis, not for compile + run.
# -----------------------------------------------------------------------------
$sourceFiles = @()
foreach ($library in @('Common', 'Ast', 'Bytecode', 'Compiler', 'VM')) {
    $dir = Join-Path $LuauSrc "$library\src"
    if (-not (Test-Path $dir)) { throw "Missing Luau source directory: $dir" }
    $sourceFiles += (Get-ChildItem -Path $dir -Filter '*.cpp' -Recurse | Select-Object -ExpandProperty FullName)
}
Write-Host ("Compiling main.cpp + {0} Luau translation units" -f $sourceFiles.Count)

New-Item -ItemType Directory -Force -Path $outDir | Out-Null

# -----------------------------------------------------------------------------
# 4. Compile and link in one cl.exe invocation
# -----------------------------------------------------------------------------
$clArgs = @(
    '/nologo'
    '/std:c++17'
    '/EHsc'                 # standard C++ exceptions, required by the Luau sources
    '/O2'                   # optimise; Luau's hot paths care
    '/MP'                   # compile translation units in parallel
    '/W3'
    '/DNDEBUG'
    '/DLUAU_EMBED=1'
    '/DLUA_USE_LONGJMP=1'
    '/D_CRT_SECURE_NO_WARNINGS'
    "/I$LuauSrc\VM\include"
    "/I$LuauSrc\Common\include"
    "/I$LuauSrc\Ast\include"
    "/I$LuauSrc\Compiler\include"
    "/I$LuauSrc\Bytecode\include"
    (Join-Path $root 'main.cpp')
) + $sourceFiles + @("/Fo$outDir\", "/Fe$exePath")

$commandLine = "call `"$vcvars`" >nul && cl " + ($clArgs -join ' ')

Write-Host "Compiling (this takes a minute or two the first time) ..."
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
