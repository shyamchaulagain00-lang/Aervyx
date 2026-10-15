# Aervyx injection lab

A place to learn Windows process injection properly: against a process **you
compile, on your machine, in your own session**, with the ground truth printed
next to the thing being found.

Everything here exists so that the technique is the thing under test rather than
the secrecy of a memory layout. The target announces where its state object
lives, so a scanner that fails has a bug rather than an unlucky guess, and a
payload can prove it ran instead of appearing to.

**Scope.** This is aimed at `aervyx_injection_target.exe` and nothing else. It is
not a template for other people's processes, and there is no anti-cheat evasion,
no detection bypass, and no third-party target anywhere in it. Those are the parts
that make injection harmful, and they are deliberately absent.

---

## Layout

```
injection-lab/
  README.md                  this file
  verify-target.py           smoke test + worked example of a memory scan
  target/
    target.cpp               the practice target (the thing you inject into)
    build.ps1                MSVC-only build, same shape as luau-embed-demo
    build/
      aervyx_injection_target.exe
```

---

## Build and run

```powershell
# build (pwsh if you have it, powershell otherwise)
powershell -NoProfile -ExecutionPolicy Bypass -File .\target\build.ps1

# prove the target is actually targetable before building anything on it
python verify-target.py

# run it interactively
.\target\build\aervyx_injection_target.exe

# or keep it alive without stdin, for driving an injector from another terminal
.\target\build\aervyx_injection_target.exe --stay 60
```

`pwsh` is PowerShell 7; this machine only has Windows PowerShell, so the
`powershell -File` form is the one that works here. The script itself is 5.1-safe.

---

## The practice target

`target.cpp` reproduces the *shape* of a real host that runs guest code, because
the hard parts of that problem are structural rather than secret.

### `RuntimeState`, 0x60 bytes

| offset | field           | type        | notes                                       |
| ------ | --------------- | ----------- | ------------------------------------------- |
| 0x00   | `signature`     | `uint64_t`  | `0x2131545356524541`, i.e. `AERVST1!`       |
| 0x08   | `structVersion` | `uint32_t`  | always 1                                    |
| 0x0C   | `ownerPid`      | `uint32_t`  | the target's own PID                        |
| 0x10   | `heartbeat`     | `uint64_t`  | bumped by the service on every call         |
| 0x18   | `label`         | `char[32]`  | `aervyx-lab-<pid>`                          |
| 0x38   | `service`       | function ptr| points **into the target's image**          |
| 0x40   | `reserved[4]`   | `uint64_t[4]` | left empty for the later exercises        |

The object is heap-allocated, not a global, and its address moves every run
(ASLR). A `static_assert` pins the size, so the layout cannot drift silently.

### Commands

| command | what it does                                                       |
| ------- | ------------------------------------------------------------------ |
| `info`  | PID, image base/size, state address, scan pattern                   |
| `state` | dump every field of the live object                                 |
| `tick`  | call the service from **inside** the target — the baseline          |
| `quit`  | exit                                                                |

### Why `tick` matters

The service prints its own caller address via `_ReturnAddress()`:

```
[host] service received: "tick from the target itself"  (caller=0x00007FF6AA9D1C2F)
image base / size    : 0x00007FF6AA9D0000  /  0x2B000 bytes
```

`0x7FF6AA9D1C2F` falls inside `[0x7FF6AA9D0000, +0x2B000)`, which is the target's
own image. When something injected calls that same service, the caller will be
somewhere else entirely. **That address is the proof of where execution came
from**, and it is the success signal for the later exercises — far stronger than
"a message appeared".

---

## What the smoke test already showed

`python verify-target.py` on this machine, verified end to end:

```
regions   : 8 committed private readable region(s) scanned
hits      : 3 location(s) contained the signature
            0xF39E0FE203   region 0xF39E0FD000 (0x3000 bytes)
            0x2F2134EF550   region 0x2F2134E0000 (0x13000 bytes)  <-- matches the banner
            0x2F2134F115A   region 0x2F2134E0000 (0x13000 bytes)
RESULT: PASS
```

Three hits, one correct. That is the whole lesson of the first two exercises:

- The second hit lands in the **same region** as the real object and is caused by
  the target's own banner text. The CRT heap-allocates a stdio buffer, the banner
  contains the literal `AERVST1!`, and the naive byte search finds the logging
  rather than the object. **Your own output can create your own false positives.**
- The low hit is a coincidental byte sequence in an unrelated allocation.

So a signature is only a *candidate*. It becomes an answer when the surrounding
fields agree: `structVersion == 1`, `ownerPid == target PID`, `label` starts with
`aervyx-lab-`, and `service` points inside the image range. Writing that
validation is Exercise 2, and it is the actual skill.

---

## Exercise roadmap

Each exercise has a pass condition that cannot be faked by a message appearing.
Work them in order; each one's failure mode is the next one's prerequisite.

### 1. Read the target's memory — *done, and this is the worked example*
`verify-target.py` enumerates committed private readable regions with
`VirtualQueryEx`, reads them with `ReadProcessMemory`, and searches for the
signature. It passes by matching the address the target announced.

Deliberate detail worth studying: the explicit `ctypes` prototypes. Without them
ctypes assumes a 32-bit `int` return and silently truncates handles and addresses,
so the scan appears to work while reading the wrong bytes.

### 2. Validate a candidate, don't just match bytes
Extend the scan to reject the false positives above. A candidate is only accepted
when its fields are mutually consistent *and* `service` lands inside the image
range you read from the PE headers. Pass condition: exactly one accepted
candidate, across five consecutive runs with different PIDs.

This is the exercise that turns a byte search into a scanner.

### 3. Inject a DLL — the classic four calls
`OpenProcess` → `VirtualAllocEx` → `WriteProcessMemory` → `CreateRemoteThread`.
The thread entry point is `LoadLibraryA` with the payload's path written into the
target's memory.

Do it twice: first in C++ (where the types are explicit and you cannot cheat the
pointer sizes), then in Python `ctypes` (where you discover it is the same four
calls). Pass condition: the payload's `DllMain` writes a line the target's console
shows, and the payload reports its own module base.

### 4. Call back into the target — the marshalling exercise
The payload locates the `RuntimeState` itself and calls `state->service("...")`.
Pass condition: the target prints the message **with a caller address outside its
own image range.** Compare against the `tick` baseline. If the caller is still
inside the image, your payload did not call it — the target did.

This is the honest analogue of invoking a host's own entry point from guest code,
and it is the part that actually takes care to get right.

### 5. A structured result channel
Have the service return a status code and have the payload write both the status
and a message into the state's `reserved[]` fields. The injector then reads those
back with `ReadProcessMemory` and prints them. Pass condition: a deliberate
failure (empty message → `kServiceEmpty`, or a rejected one → `kServiceRejected`)
is reported as a *status and a reason*, not as silence.

The status convention here is modelled on `lua_pcall`: a pointer to a function plus
a small integer where 0 means success. That design question — how a host reports a
failure to a caller that lives somewhere else — is the same one solved in
`src/lua/runtime.ts`, and getting it right is the actual engineering.

### 6. Read the PE format properly
Walk the DOS stub, the NT headers, the section table, and the import directory of
your own payload. Understand how the loader applies relocations and resolves
imports. The target's `ImageSize()` is the smallest possible version of this.

Framed as loader internals on purpose. Knowing how the OS maps an image is the
foundation for everything above, and it is a normal reverse-engineering skill.

### 7. Failure handling
Inject a payload whose `DllMain` deliberately fails, and one that calls the service
with a null pointer. Write down what the target sees, what the injector sees, and
what is silently lost. This is the exercise that teaches the difference between a
result and a crash, which is the same distinction that mattered in Phase 4 of the
original goal — except that in a host you control, the full error path is actually
available to you.

---

## What is deliberately absent

- **No anti-cheat or anti-malware evasion.** No PEB unlinking, no hook removal, no
  unhooking, no ETW patching, no call-stack spoofing. These exist only to defeat a
  security control, and there is no security control on this target to defeat.
- **No third-party target.** The lab is complete without one.
- **No stealth.** The payload is meant to be obvious. It prints what it did; that
  is the point.
