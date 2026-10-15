/** Versioned, data-only commands for the opt-in Roblox Studio test bridge. */
export const ROBLOX_TEST_PROTOCOL_VERSION = 1 as const;

export type RobloxTestCommand =
  | { id: string; version: 1; command: 'print'; args: { message: string } }
  | { id: string; version: 1; command: 'getPlayerName'; args: Record<string, never> }
  | { id: string; version: 1; command: 'getPlayerPosition'; args: Record<string, never> }
  | { id: string; version: 1; command: 'moveTestObject'; args: { x: number; y: number; z: number } }
  | { id: string; version: 1; command: 'setTestObjectProperty'; args: { property: 'Transparency' | 'Anchored' | 'Color'; value: number | boolean | string } }
  | { id: string; version: 1; command: 'createTestPart'; args: Record<string, never> }
  | { id: string; version: 1; command: 'removeTestPart'; args: Record<string, never> };

export type RobloxTestCommandInput = Omit<RobloxTestCommand, 'id' | 'version'>;
export type RobloxTestResponse = { id: string; ok: boolean; output: string };

export type Validation<T> = { ok: true; value: T } | { ok: false; error: string };

const COMMANDS = new Set([
  'print', 'getPlayerName', 'getPlayerPosition', 'moveTestObject',
  'setTestObjectProperty', 'createTestPart', 'removeTestPart',
]);
const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_MESSAGE_LENGTH = 500;
const MAX_COORDINATE = 10000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function validateArgs(command: unknown, args: unknown): Validation<RobloxTestCommandInput> {
  if (!isRecord(args)) return { ok: false, error: 'Command args must be a JSON object.' };
  switch (command) {
    case 'print':
      if (!hasExactKeys(args, ['message']) || typeof args.message !== 'string' || args.message.length > MAX_MESSAGE_LENGTH) {
        return { ok: false, error: `print requires only a message string of at most ${MAX_MESSAGE_LENGTH} characters.` };
      }
      return { ok: true, value: { command, args: { message: args.message } } };
    case 'getPlayerName':
    case 'getPlayerPosition':
    case 'createTestPart':
    case 'removeTestPart':
      if (!hasExactKeys(args, [])) return { ok: false, error: `${command} does not accept arguments.` };
      return { ok: true, value: { command, args: {} } as RobloxTestCommandInput };
    case 'moveTestObject': {
      if (!hasExactKeys(args, ['x', 'y', 'z'])) return { ok: false, error: 'moveTestObject requires exactly x, y, and z.' };
      const { x, y, z } = args;
      if (![x, y, z].every((value) => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= MAX_COORDINATE)) {
        return { ok: false, error: `Coordinates must be finite numbers within ±${MAX_COORDINATE}.` };
      }
      return { ok: true, value: { command, args: { x: x as number, y: y as number, z: z as number } } };
    }
    case 'setTestObjectProperty': {
      if (!hasExactKeys(args, ['property', 'value'])) return { ok: false, error: 'setTestObjectProperty requires exactly property and value.' };
      if (args.property === 'Transparency') {
        if (typeof args.value !== 'number' || !Number.isFinite(args.value) || args.value < 0 || args.value > 1) {
          return { ok: false, error: 'Transparency must be a number from 0 through 1.' };
        }
      } else if (args.property === 'Anchored') {
        if (typeof args.value !== 'boolean') return { ok: false, error: 'Anchored must be true or false.' };
      } else if (args.property === 'Color') {
        if (typeof args.value !== 'string' || !['red', 'green', 'blue', 'white', 'black', 'yellow'].includes(args.value)) {
          return { ok: false, error: 'Color must be one of: red, green, blue, white, black, yellow.' };
        }
      } else {
        return { ok: false, error: 'Only Transparency, Anchored, and Color can be changed.' };
      }
      return { ok: true, value: { command, args: { property: args.property, value: args.value } } as RobloxTestCommandInput };
    }
    default:
      return { ok: false, error: `Unsupported command: ${String(command)}.` };
  }
}

/** Validate and copy only supported fields; unknown keys never cross the bridge. */
export function validateCommand(value: unknown): Validation<RobloxTestCommand> {
  if (!isRecord(value)) return { ok: false, error: 'Command must be a JSON object.' };
  if (!hasExactKeys(value, ['id', 'version', 'command', 'args'])) return { ok: false, error: 'Command has missing or unexpected fields.' };
  if (typeof value.id !== 'string' || !ID_PATTERN.test(value.id)) return { ok: false, error: 'Command id is invalid.' };
  if (value.version !== ROBLOX_TEST_PROTOCOL_VERSION) return { ok: false, error: 'Unsupported protocol version.' };
  if (typeof value.command !== 'string' || !COMMANDS.has(value.command)) return { ok: false, error: `Unsupported command: ${String(value.command)}.` };
  const validated = validateArgs(value.command, value.args);
  if (!validated.ok) return validated;
  return { ok: true, value: { id: value.id, version: ROBLOX_TEST_PROTOCOL_VERSION, ...validated.value } as RobloxTestCommand };
}

/** Parse JSON entered in Roblox Studio Test mode and validate the command. */
export function parseCommandInput(source: string): Validation<RobloxTestCommandInput> {
  let value: unknown;
  try { value = JSON.parse(source); } catch (error) {
    return { ok: false, error: `Invalid JSON: ${error instanceof Error ? error.message : String(error)}` };
  }
  if (!isRecord(value) || !hasExactKeys(value, ['command', 'args'])) return { ok: false, error: 'Enter a JSON object with exactly command and args fields.' };
  return validateArgs(value.command, value.args);
}

export function validateCommandInput(value: unknown): Validation<RobloxTestCommandInput> {
  if (!isRecord(value) || !hasExactKeys(value, ['command', 'args'])) return { ok: false, error: 'Command input must contain exactly command and args.' };
  if (typeof value.command !== 'string' || !COMMANDS.has(value.command)) return { ok: false, error: `Unsupported command: ${String(value.command)}.` };
  return validateArgs(value.command, value.args);
}

export function validateResponse(value: unknown): Validation<RobloxTestResponse> {
  if (!isRecord(value) || !hasExactKeys(value, ['id', 'ok', 'output'])) return { ok: false, error: 'Malformed command response.' };
  if (typeof value.id !== 'string' || !ID_PATTERN.test(value.id) || typeof value.ok !== 'boolean' || typeof value.output !== 'string' || value.output.length > 4000) {
    return { ok: false, error: 'Malformed command response fields.' };
  }
  return { ok: true, value: { id: value.id, ok: value.ok, output: value.output } };
}
