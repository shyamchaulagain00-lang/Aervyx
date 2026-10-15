# =============================================================================
#  CMakeLists.txt - alternative build for luau-embed-demo
# =============================================================================
#
#  Requires CMake 3.16+ and a C++17 compiler.
#
#  This pulls Luau in with FetchContent and links against Luau's own CMake
#  targets, which already carry the include paths and the LUA_USE_LONGJMP define.
#  build-msvc.ps1 does the same thing without needing CMake at all - use whichever
#  you have.
#
#  NOTE ON TESTING: the build on the machine this was written on used
#  build-msvc.ps1 (CMake was not installed there), so this file is provided for
#  convenience and reviewed by inspection rather than executed. It is pinned to
#  the exact Luau revision the demo was verified against.
#
#  Configure + build:
#      cmake -S . -B build-cmake -DCMAKE_BUILD_TYPE=Release
#      cmake --build build-cmake --config Release
#
#  Run it from the project root so scripts/marshalling.lua is found:
#      ./build-cmake/luau_embed_demo                    (single-config generators)
#      .\build-cmake\Release\luau_embed_demo.exe        (MSVC multi-config)
#
#  To use a Luau checkout you already have instead of downloading one:
#      cmake -S . -B build-cmake -DLUAU_SOURCE_DIR=C:/src/luau
# =============================================================================

cmake_minimum_required(VERSION 3.16)
project(luau_embed_demo CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

if (NOT DEFINED LUAU_SOURCE_DIR)
    include(FetchContent)

    # The CLI and the test suite are irrelevant here and take a long time to
    # build, so turn them off before Luau's CMakeLists runs.
    set(LUAU_BUILD_CLI OFF CACHE BOOL "" FORCE)
    set(LUAU_BUILD_TESTS OFF CACHE BOOL "" FORCE)
    set(LUAU_BUILD_WEB OFF CACHE BOOL "" FORCE)

    FetchContent_Declare(
        luau
        GIT_REPOSITORY https://github.com/luau-lang/luau.git
        GIT_TAG        7d5f73364fdbbaa984fa545071630eba73cfea98
    )
    FetchContent_MakeAvailable(luau)
endif()

add_executable(luau_embed_demo main.cpp)

# Selects Luau in main.cpp instead of the stock Lua 5.1 code path.
target_compile_definitions(luau_embed_demo PRIVATE LUAU_EMBED=1)

# Luau.VM exports LUA_USE_LONGJMP=1 as a PUBLIC definition, so linking it below is
# sufficient. It is repeated explicitly because it is load-bearing: without it,
# luaL_error() throws a C++ exception across the extern "C" API boundary.
target_compile_definitions(luau_embed_demo PRIVATE LUA_USE_LONGJMP=1)

if (MSVC)
    target_compile_options(luau_embed_demo PRIVATE /W3 /EHsc)
else()
    target_compile_options(luau_embed_demo PRIVATE -Wall -Wextra)
endif()

# luau_compile() needs the Compiler library, which sits on Ast and Common;
# luau_load()/lua_pcall() come from the VM library.
target_link_libraries(luau_embed_demo PRIVATE
    Luau.VM
    Luau.Compiler
    Luau.Ast
    Luau.Common
)
