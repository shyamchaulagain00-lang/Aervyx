# =============================================================================
#  verify-target.py - smoke test: is the practice target actually targetable?
# =============================================================================
#
#  Not the lab scanner yet. This answers three questions before the lab is built
#  on assumptions:
#
#    1. Did /O2 keep the RuntimeState object, or optimise the signature away?
#    2. Does the documented scan pattern actually appear in the target's memory?
#    3. Can Python read another process's memory on this machine at all?
#
#  Question 3 is the one worth proving early. VirtualQueryEx and ReadProcessMemory
#  have 64-bit argument types that are easy to get subtly wrong, and a scanner that
#  silently reads garbage is far more painful to debug than one that fails loudly.
#
#  Usage:  python verify-target.py
# =============================================================================

import ctypes
import re
import subprocess
import sys
from ctypes import wintypes
from pathlib import Path

TARGET = Path(__file__).parent / "target" / "build" / "aervyx_injection_target.exe"

SIGNATURE = bytes([0x41, 0x45, 0x52, 0x56, 0x53, 0x54, 0x31, 0x21])  # "AERVST1!"
STRUCT_SIZE = 0x60

PROCESS_QUERY_INFORMATION = 0x0400
PROCESS_VM_READ = 0x0010

MEM_COMMIT = 0x1000
MEM_PRIVATE = 0x20000
PAGE_GUARD = 0x100
PAGE_NOACCESS = 0x01

k32 = ctypes.WinDLL("kernel32", use_last_error=True)


class MEMORY_BASIC_INFORMATION64(ctypes.Structure):
    """x64 layout. Note the padding after AllocationProtect: a 4-byte DWORD is
    followed by 4 bytes of padding before the 8-byte RegionSize, and getting that
    wrong shifts every field after it."""

    _fields_ = [
        ("BaseAddress", ctypes.c_ulonglong),
        ("AllocationBase", ctypes.c_ulonglong),
        ("AllocationProtect", wintypes.DWORD),
        ("__alignment1", wintypes.DWORD),
        ("RegionSize", ctypes.c_ulonglong),
        ("State", wintypes.DWORD),
        ("Protect", wintypes.DWORD),
        ("Type", wintypes.DWORD),
        ("__alignment2", wintypes.DWORD),
    ]


# Explicit prototypes. Without these, ctypes assumes 32-bit int returns and
# silently truncates 64-bit handles and addresses on x64.
k32.OpenProcess.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
k32.OpenProcess.restype = wintypes.HANDLE

k32.VirtualQueryEx.argtypes = [
    wintypes.HANDLE,
    ctypes.c_void_p,
    ctypes.POINTER(MEMORY_BASIC_INFORMATION64),
    ctypes.c_size_t,
]
k32.VirtualQueryEx.restype = ctypes.c_size_t

k32.ReadProcessMemory.argtypes = [
    wintypes.HANDLE,
    ctypes.c_void_p,
    ctypes.c_void_p,
    ctypes.c_size_t,
    ctypes.POINTER(ctypes.c_size_t),
]
k32.ReadProcessMemory.restype = wintypes.BOOL

k32.CloseHandle.argtypes = [wintypes.HANDLE]
k32.CloseHandle.restype = wintypes.BOOL

MAX_REGION_READ = 64 * 1024 * 1024


def launch_target():
    """Start the target and pull the state address it printed. That address is
    ground truth: a scanner that cannot find it has a bug, not a hard target."""
    if not TARGET.exists():
        sys.exit(f"target not built: {TARGET}\nRun:  powershell -File .\\target\\build.ps1")

    process = subprocess.Popen(
        [str(TARGET), "--stay", "25"],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
    )

    banner = []
    state_address = None
    for line in process.stdout:
        banner.append(line.rstrip("\n"))
        # Both forms are accepted. MSVC's %p emits bare hex with no prefix, so a
        # regex that insists on 0x silently matches nothing and looks like a
        # missing target rather than a parsing bug.
        match = re.search(r"heap RuntimeState\s*:\s*(?:0x)?([0-9A-Fa-f]+)", line)
        if match:
            state_address = int(match.group(1), 16)
        if "scan pattern" in line:
            break

    if state_address is None:
        process.kill()
        sys.exit("could not read the state address from the banner:\n" + "\n".join(banner))

    return process, process.pid, state_address


def iter_readable_regions(handle):
    """Walk the address space and yield (base, size) for committed, private,
    readable pages. A heap object lives in committed private memory; the image
    itself is MEM_IMAGE, which a scanner would only reach by deliberately walking
    loadable modules instead."""
    address = 0
    mbi = MEMORY_BASIC_INFORMATION64()
    while k32.VirtualQueryEx(handle, ctypes.c_void_p(address), ctypes.byref(mbi), ctypes.sizeof(mbi)):
        base = mbi.BaseAddress
        size = mbi.RegionSize
        if size == 0:
            break

        readable = (mbi.State == MEM_COMMIT
                    and not (mbi.Protect & PAGE_GUARD)
                    and mbi.Protect != PAGE_NOACCESS)
        if readable and mbi.Type == MEM_PRIVATE:
            yield base, min(size, MAX_REGION_READ)

        address = base + size


def find_signature(handle):
    found = []
    regions_scanned = 0
    for base, size in iter_readable_regions(handle):
        regions_scanned += 1
        buffer = ctypes.create_string_buffer(size)
        read = ctypes.c_size_t(0)
        if not k32.ReadProcessMemory(handle, ctypes.c_void_p(base), buffer, size, ctypes.byref(read)):
            continue
        data = buffer.raw[: read.value]
        start = 0
        while True:
            index = data.find(SIGNATURE, start)
            if index < 0:
                break
            found.append((base + index, base, size))
            start = index + 1
    return found, regions_scanned


def main():
    print(f"signature : {SIGNATURE.hex(' ')}  ({SIGNATURE.decode('ascii')!r})")
    print(f"struct    : 0x{STRUCT_SIZE:X} bytes\n")

    process, pid, expected = launch_target()
    print(f"target    : PID {pid}")
    print(f"expected  : state at 0x{expected:X} (from the target's own banner)\n")

    handle = k32.OpenProcess(PROCESS_QUERY_INFORMATION | PROCESS_VM_READ, False, pid)
    if not handle:
        process.kill()
        sys.exit(f"OpenProcess failed, error {ctypes.get_last_error()} "
                 "(error 5 = access denied; try an elevated shell)")

    try:
        hits, regions = find_signature(handle)
        print(f"regions   : {regions} committed private readable region(s) scanned")
        print(f"hits      : {len(hits)} location(s) contained the signature")
        for address, base, size in hits[:10]:
            marker = "  <-- matches the banner" if address == expected else ""
            print(f"            0x{address:X}   region 0x{base:X} (0x{size:X} bytes){marker}")

        exact = [a for a, _, _ in hits if a == expected]
        print()
        if exact:
            print("RESULT: PASS - the scanner found the object the target announced.")
            print("        The struct survived /O2, the signature is intact, and Python")
            print("        can read this process's memory. The lab has a valid target.")
            return 0

        print("RESULT: FAIL - the signature was not found at the announced address.")
        print("        Either the object is not where the banner claims, or the scan")
        print("        ranges are wrong. Fix this before building further on it.")
        return 1
    finally:
        k32.CloseHandle(handle)
        process.kill()


if __name__ == "__main__":
    raise SystemExit(main())
