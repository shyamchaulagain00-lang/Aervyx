import assert from 'node:assert/strict';
import { RobloxTestBroker } from '../src/roblox-test/broker.ts';
import { parseCommandInput, validateCommand, validateCommandInput, validateResponse } from '../src/roblox-test/protocol.ts';
import { LocalRobloxTestBridge } from '../electron/roblox-test-bridge.ts';

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`  PASS  ${name}`);
}

console.log('[Aervyx Roblox Studio Test protocol]');
check('accepts the print command', () => assert.deepEqual(parseCommandInput('{"command":"print","args":{"message":"hello"}}'), { ok: true, value: { command: 'print', args: { message: 'hello' } } }));
check('accepts player queries with empty args', () => assert.equal(parseCommandInput('{"command":"getPlayerPosition","args":{}}').ok, true));
check('accepts bounded movement coordinates', () => assert.equal(parseCommandInput('{"command":"moveTestObject","args":{"x":1,"y":2,"z":3}}').ok, true));
check('accepts only allowed property values', () => assert.equal(parseCommandInput('{"command":"setTestObjectProperty","args":{"property":"Color","value":"blue"}}').ok, true));
check('rejects invalid JSON', () => assert.equal(parseCommandInput('{').ok, false));
check('rejects arbitrary Lua source', () => assert.equal(parseCommandInput('print(game:GetService("Players"))').ok, false));
check('rejects unknown commands', () => assert.equal(parseCommandInput('{"command":"eval","args":{"source":"print(1)"}}').ok, false));
check('rejects extra fields', () => assert.equal(parseCommandInput('{"command":"print","args":{"message":"ok","extra":true}}').ok, false));
check('rejects oversized print messages', () => assert.equal(parseCommandInput(JSON.stringify({ command: 'print', args: { message: 'x'.repeat(501) } })).ok, false));
check('rejects out of range coordinates', () => assert.equal(parseCommandInput('{"command":"moveTestObject","args":{"x":10001,"y":0,"z":0}}').ok, false));
check('rejects non-finite coordinates', () => assert.equal(parseCommandInput('{"command":"moveTestObject","args":{"x":1e400,"y":0,"z":0}}').ok, false));
check('rejects arbitrary object properties', () => assert.equal(parseCommandInput('{"command":"setTestObjectProperty","args":{"property":"Parent","value":"Workspace"}}').ok, false));
check('rejects unknown property fields', () => assert.equal(parseCommandInput('{"command":"setTestObjectProperty","args":{"property":"Anchored","value":true,"extra":1}}').ok, false));
check('rejects malformed protocol envelopes', () => assert.equal(validateCommand({ id: 'ok', version: 1, command: 'print', args: { message: 'ok' }, code: 'print(1)' }).ok, false));
check('validates app IPC command input strictly', () => assert.equal(validateCommandInput({ command: 'createTestPart', args: {}, hidden: true }).ok, false));
check('validates response shape', () => assert.equal(validateResponse({ id: 'abc', ok: true, output: 'done' }).ok, true));
check('rejects oversized response output', () => assert.equal(validateResponse({ id: 'abc', ok: true, output: 'x'.repeat(4001) }).ok, false));

console.log('\n[broker lifecycle]');
const broker = new RobloxTestBroker(1000, 30);
check('listener starts disconnected after bind', () => { broker.startListening(); assert.equal(broker.getStatus(), 'DISCONNECTED'); });
check('submits are rejected without a live Studio plugin', () => assert.equal(broker.getStatus(), 'DISCONNECTED'));
await assert.rejects(broker.submit({ command: 'print', args: { message: 'x' } }, 'off'), /disconnected/);
check('plugin heartbeat connects the bridge', () => { broker.heartbeat(); assert.equal(broker.getStatus(), 'CONNECTED'); });
const commandInput = { command: 'print', args: { message: 'one run' } };
const firstPromise = broker.submit(commandInput, 'request_1');
const duplicatePromise = broker.submit(commandInput, 'request_1');
check('duplicate request IDs share the same in-flight response', () => assert.equal(firstPromise, duplicatePromise));
const firstLease = broker.takeNext();
check('leases a validated command', () => { assert.equal(firstLease.id, 'request_1'); assert.equal(firstLease.command, 'print'); });
check('repeated polling keeps the same lease', () => assert.equal(broker.takeNext(), firstLease));
check('accepts a matching command result', () => assert.equal(broker.complete({ id: 'request_1', ok: true, output: 'one run' }), true));
check('duplicate result delivery is idempotent', () => assert.equal(broker.complete({ id: 'request_1', ok: true, output: 'one run' }), true));
const firstResponse = await firstPromise;
check('settles the app request with Studio output', () => assert.deepEqual(firstResponse, { id: 'request_1', ok: true, output: 'one run' }));

const timeoutBroker = new RobloxTestBroker(20, 1000);
timeoutBroker.startListening();
timeoutBroker.heartbeat();
const timedOut = timeoutBroker.submit({ command: 'getPlayerName', args: {} }, 'timeout_1');
const timeoutResponse = await timedOut;
check('reports Studio closing/no response as a timeout', () => {
  assert.equal(timeoutResponse.ok, false);
  assert.match(timeoutResponse.output, /Timed out waiting for Roblox Studio/);
  assert.equal(timeoutBroker.getStatus(), 'ERROR');
});
check('a later plugin heartbeat recovers the status', () => { timeoutBroker.heartbeat(); assert.equal(timeoutBroker.getStatus(), 'CONNECTED'); });
check('stale heartbeat reports a closed Studio plugin as disconnected', () => assert.equal(timeoutBroker.getStatus(Date.now() + 2000), 'DISCONNECTED'));

console.log('\n[loopback HTTP protocol]');
const httpBridge = new LocalRobloxTestBridge(0);
await httpBridge.start();
try {
  const info = httpBridge.getInfo();
  const unauthorized = await fetch(`${info.endpoint}/v1/heartbeat`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-aervyx-token': 'wrong' }, body: '{}' });
  check('loopback endpoint rejects an invalid pairing token', () => assert.equal(unauthorized.status, 401));
  const headers = { 'content-type': 'application/json', 'x-aervyx-token': info.pairingToken };
  const heartbeat = await fetch(`${info.endpoint}/v1/heartbeat`, { method: 'POST', headers, body: '{"protocol":1}' });
  check('authenticated plugin heartbeat establishes connection', () => assert.equal(httpBridge.getInfo().status, 'CONNECTED'));
  const appRequest = httpBridge.submit({ command: 'print', args: { message: 'from test' } });
  const poll = await fetch(`${info.endpoint}/v1/next`, { method: 'POST', headers, body: '{}' });
  const lease = (await poll.json()).command;
  check('plugin poll receives the app command lease', () => { assert.equal(poll.status, 200); assert.equal(lease.command, 'print'); assert.equal(lease.args.message, 'from test'); });
  const delivery = await fetch(`${info.endpoint}/v1/result`, { method: 'POST', headers, body: JSON.stringify({ id: lease.id, ok: true, output: 'Studio reply' }) });
  const finalResult = await appRequest;
  check('plugin result completes the Aervyx request', () => { assert.equal(delivery.status, 200); assert.equal(finalResult.output, 'Studio reply'); });
  const malformed = await fetch(`${info.endpoint}/v1/heartbeat`, { method: 'POST', headers, body: '{' });
  check('HTTP protocol returns a client error for malformed JSON', () => assert.equal(malformed.status, 400));
  await assert.rejects(httpBridge.submit({ command: 'eval', args: { code: 'print(1)' } }), /Unsupported command/);
  check('bridge submission rejects unsupported commands', () => assert.equal(httpBridge.getInfo().status, 'CONNECTED'));
} finally {
  await httpBridge.stop();
}

console.log(`\n=== ${passed} assertions passed ===`);
