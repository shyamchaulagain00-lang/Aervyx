// =============================================================================
//  target.cpp - the practice target for the injection lab
// =============================================================================
//
//  This program is the thing you inject INTO. It exists so every technique in
//  this lab can be practised against a process you own, on a machine you own,
//  with no third party and no anti-cheat anywhere in the picture.
//
//  It deliberately reproduces the *shape* of a real host that runs guest code,
//  because the hard parts of that problem are structural rather than secret:
//
//    1. The host owns a state object on the heap. Before anything can be run,
//       that object has to be located in the target's address space. RuntimeState
//       below is findable on purpose, so the *technique* is what is under test
//       rather than the secrecy of a layout.
//    2. The state carries a function pointer into the host. Invoking it is how
//       guest code reaches host functionality.
//    3. The host reports what it received, so a payload can prove it executed and
//       come back with a result. A failure is visible instead of silent.
//
//  The service call is deliberately modelled on lua_pcall: a function pointer
//  plus a small integer status, where 0 means success. That result-channel design
//  is the same problem you solved in src/lua/runtime.ts, and it is the part that
//  is genuinely worth getting right.
//
//  Build:  pwsh -File .\build.ps1
//  Run:    .\build\aervyx_injection_target.exe
// =============================================================================

#include <windows.h>
#include <intrin.h>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <cstdlib>
#include <string>

// -----------------------------------------------------------------------------
// The signature the scanner will hunt for.
//
// Spelled out byte by byte rather than written as 0xAERVST1, so the in-memory
// byte order is obvious: this lands in memory as the ASCII bytes
//     41 45 52 56 53 54 31 21          "AERVST1!"
// and prints as such in a hex dump. A scanner's first regex/byte pattern for the
// exercises is exactly that sequence.
// -----------------------------------------------------------------------------
static constexpr uint64_t kSignature =
    static_cast<uint64_t>('A')       |
    (static_cast<uint64_t>('E') << 8)  |
    (static_cast<uint64_t>('R') << 16) |
    (static_cast<uint64_t>('V') << 24) |
    (static_cast<uint64_t>('S') << 32) |
    (static_cast<uint64_t>('T') << 40) |
    (static_cast<uint64_t>('1') << 48) |
    (static_cast<uint64_t>('!') << 56);

// Status codes returned by the host service. The 0-is-success convention and the
// pairing with an error path mirrors Lua's LUA_OK / LUA_ERRRUN split on purpose.
enum ServiceStatus : int
{
    kServiceOk       = 0,   // handled
    kServiceEmpty    = 1,   // nothing to do
    kServiceRejected = 2,   // host refused the request
};

// Signature of the host service the payload will invoke through the state object.
using ServiceFn = int (*)(const char* message);

#pragma pack(push, 8)
// The state object. Field order and padding are fixed so that a scanner written
// against this header and a scanner written blind both find the same bytes.
struct RuntimeState
{
    uint64_t  signature;      // offset 0x00  - kSignature
    uint32_t  structVersion;  // offset 0x08
    uint32_t  ownerPid;       // offset 0x0C
    uint64_t  heartbeat;      // offset 0x10  - bumped by the service
    char      label[32];      // offset 0x18  - human-readable tag
    ServiceFn service;        // offset 0x38  - pointer INTO this module
    uint64_t  reserved[4];    // offset 0x40  - reserved for later exercises
};
#pragma pack(pop)

static_assert(sizeof(RuntimeState) == 0x60, "RuntimeState layout changed; update the lab README offsets");

// Addresses are printed with an explicit 0x prefix rather than through %p.
// Measured: MSVC's %p emits bare uppercase hex with no prefix and no width
// ("000002503B44FB20"), which is easy to misparse and varies between CRTs. The
// exercises parse this banner, so the format is pinned here instead of being left
// to the runtime to decide.
static unsigned long long AsNumber(const void* address)
{
    return static_cast<unsigned long long>(reinterpret_cast<uintptr_t>(address));
}

// -----------------------------------------------------------------------------
// The host service.
//
// The caller address is printed because it is the cheapest honest proof of where
// execution came from: called from inside this module you will see an address in
// the target's own image, and called from an injected payload you will see one
// belonging to the payload's image instead. That is the check that tells you an
// injection actually worked rather than merely appearing to.
// -----------------------------------------------------------------------------
static int HostService(const char* message)
{
    void* caller = _ReturnAddress();

    if (message == nullptr || message[0] == '\0')
    {
        std::printf("  [host] service called with an empty message (caller=0x%016llX)\n", AsNumber(caller));
        std::fflush(stdout);
        return kServiceEmpty;
    }

    std::printf("  [host] service received: \"%s\"  (caller=0x%016llX)\n", message, AsNumber(caller));
    std::fflush(stdout);
    return kServiceOk;
}

static void BumpHeartbeat(RuntimeState* state)
{
    state->heartbeat += 1;
}

// SizeOfImage is read straight out of the PE headers rather than via
// GetModuleInformation. It needs no extra import library, and walking the headers
// is the same skill the later manual-mapping exercise depends on.
static unsigned long ImageSize(HMODULE image)
{
    if (image == nullptr) { return 0; }
    const auto base = reinterpret_cast<const unsigned char*>(image);
    const auto dos  = reinterpret_cast<const IMAGE_DOS_HEADER*>(base);
    if (dos->e_magic != IMAGE_DOS_SIGNATURE) { return 0; }
    const auto nt = reinterpret_cast<const IMAGE_NT_HEADERS*>(base + dos->e_lfanew);
    if (nt->Signature != IMAGE_NT_SIGNATURE) { return 0; }
    return static_cast<unsigned long>(nt->OptionalHeader.SizeOfImage);
}

static void PrintBanner(const RuntimeState* state)
{
    // Module base and size are printed because choosing WHAT to scan is half the
    // lesson: the image region and the heap are different regions, and a scanner
    // that walks only one of them will miss the state.
    HMODULE image = GetModuleHandleW(nullptr);

    std::printf("\n");
    std::printf("================================================================\n");
    std::printf("  Aervyx injection lab - practice target\n");
    std::printf("================================================================\n");
    std::printf("  PID                  : %lu\n", static_cast<unsigned long>(GetCurrentProcessId()));
    std::printf("  image base / size    : 0x%016llX  /  0x%lX bytes\n",
        AsNumber(image), ImageSize(image));
    std::printf("  heap RuntimeState    : 0x%016llX\n", AsNumber(state));
    std::printf("  state->service       : 0x%016llX\n", AsNumber(reinterpret_cast<const void*>(state->service)));
    std::printf("  struct size          : 0x%zX bytes\n", sizeof(RuntimeState));
    std::printf("  scan pattern         : 41 45 52 56 53 54 31 21   (\"AERVST1!\")\n");
    std::printf("  note                 : the heap address moves every run (ASLR), so a\n");
    std::printf("                         hardcoded address will not survive a restart.\n");
    std::printf("----------------------------------------------------------------\n");
    std::printf("  commands: info | state | tick | help | quit\n");
    std::printf("================================================================\n\n");
    std::fflush(stdout);
}

static void PrintState(const RuntimeState* state)
{
    const bool signatureOk = (state->signature == kSignature);
    std::printf("  state @ 0x%016llX\n", AsNumber(state));
    std::printf("    signature    : 0x%016llX  %s\n",
        static_cast<unsigned long long>(state->signature),
        signatureOk ? "(matches kSignature)" : "(DOES NOT MATCH - wrong object?)");
    std::printf("    structVersion: %u\n", state->structVersion);
    std::printf("    ownerPid     : %u\n", state->ownerPid);
    std::printf("    heartbeat    : %llu\n", static_cast<unsigned long long>(state->heartbeat));
    std::printf("    label        : \"%s\"\n", state->label);
    std::printf("    service      : 0x%016llX\n", AsNumber(reinterpret_cast<const void*>(state->service)));
    std::fflush(stdout);
}

static void PrintHelp()
{
    std::printf("  info  - PID, image base/size and the address of the state object\n");
    std::printf("  state - dump every field of the live RuntimeState\n");
    std::printf("  tick  - call the host service from INSIDE this process, for contrast\n");
    std::printf("          with a call made through an injected payload\n");
    std::printf("  quit  - exit\n");
    std::fflush(stdout);
}

int main(int argc, char** argv)
{
    // A heap allocation rather than a global, so the object has to be found by
    // scanning and lands somewhere different on every run.
    RuntimeState* state = new RuntimeState{};
    state->signature     = kSignature;
    state->structVersion = 1;
    state->ownerPid      = GetCurrentProcessId();
    state->heartbeat     = 0;
    state->service       = &HostService;
    std::snprintf(state->label, sizeof(state->label), "aervyx-lab-%lu",
        static_cast<unsigned long>(GetCurrentProcessId()));

    // --stay <seconds>: remain alive and tick without needing stdin, for scripted
    // practice where the injector is driven from a separate terminal.
    long staySeconds = 0;
    for (int i = 1; i + 1 < argc; ++i)
    {
        if (std::strcmp(argv[i], "--stay") == 0) { staySeconds = std::strtol(argv[i + 1], nullptr, 10); }
    }

    PrintBanner(state);

    if (staySeconds > 0)
    {
        std::printf("  staying alive for %lds, ticking every 500ms\n", staySeconds);
        std::fflush(stdout);
        for (long elapsed = 0; elapsed < staySeconds * 2; ++elapsed)
        {
            Sleep(500);
            BumpHeartbeat(state);
        }
        std::printf("  --stay elapsed, exiting\n");
        delete state;
        return 0;
    }

    char line[512];
    for (;;)
    {
        std::printf("target> ");
        std::fflush(stdout);

        if (std::fgets(line, sizeof(line), stdin) == nullptr)
        {
            // EOF: stay alive so an injector can still attach. This is what
            // happens when the target is launched with stdin redirected, and
            // dying instantly there would make the process impossible to target.
            std::printf("\n  stdin closed. Target stays alive; press Ctrl+C to exit.\n");
            std::fflush(stdout);
            for (;;) { Sleep(1000); BumpHeartbeat(state); }
        }

        line[std::strcspn(line, "\r\n")] = '\0';
        const char* command = line;
        while (*command == ' ' || *command == '\t') { ++command; }

        if (*command == '\0') { continue; }
        if (std::strcmp(command, "quit") == 0 || std::strcmp(command, "exit") == 0)
        {
            std::printf("  exiting\n");
            break;
        }
        if (std::strcmp(command, "info") == 0)  { PrintBanner(state); continue; }
        if (std::strcmp(command, "state") == 0) { PrintState(state); continue; }
        if (std::strcmp(command, "help") == 0)  { PrintHelp(); continue; }
        if (std::strcmp(command, "tick") == 0)
        {
            BumpHeartbeat(state);
            // Called from inside this module, so the caller address the service
            // prints will be inside this executable. That is the baseline to
            // compare an injected call against.
            const int status = state->service("tick from the target itself");
            std::printf("  service status: %d\n", status);
            continue;
        }
        std::printf("  unknown command: %s\n", command);
    }

    delete state;
    return 0;
}
