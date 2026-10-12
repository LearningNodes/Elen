import { readFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { describe, expect, it } from 'vitest';
import { createLocalApiApp } from '../src/local-api';
import { createMcpServer } from '../src/server';

const ROOT = join(__dirname, '..');
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const serverJson = JSON.parse(readFileSync(join(ROOT, 'server.json'), 'utf8'));
const readme = readFileSync(join(ROOT, 'README.md'), 'utf8');

const SERVER_JSON_DESCRIPTION_LIMIT = 100;
const POSITIONING_LINE =
  'Elen is an open-source MCP server that records the decisions your coding agent makes, with the limits that bound them, and marks old decisions as superseded. It installs with one npx line, works with Cursor, Claude Code and any MCP client, and keeps decisions in a local SQLite file.';

describe('package metadata', () => {
  it('server.json matches package.json', () => {
    expect(serverJson.name).toBe(pkg.mcpName);
    expect(serverJson.version).toBe(pkg.version);
    expect(serverJson.packages).toHaveLength(1);
    expect(serverJson.packages[0].version).toBe(pkg.version);
    expect(serverJson.packages[0].identifier).toBe(pkg.name);
    expect(serverJson.packages[0].registryType).toBe('npm');
    expect(serverJson.description.length).toBeLessThanOrEqual(SERVER_JSON_DESCRIPTION_LIMIT);
  });

  it('package.json carries the registry and npm page fields', () => {
    expect(pkg.keywords).toEqual(expect.arrayContaining([
      'mcp', 'mcp-server', 'model-context-protocol', 'decision-memory', 'decisionops', 'adr', 'claude-code', 'cursor', 'agents-md',
    ]));
    expect(pkg.description.endsWith('Part of Learning Nodes, the DecisionOps workspace.')).toBe(true);
    expect(pkg.repository).toBeDefined();
    expect(pkg.homepage).toBeDefined();
    expect(pkg.bugs).toBeDefined();
    expect(pkg.mcpName).toBe('com.learningnodes/elen');
  });

  it('the README starts with the positioning line and has no long dash', () => {
    expect(readme.startsWith(POSITIONING_LINE)).toBe(true);
    expect(readme).not.toMatch(/[\u2012\u2013\u2014\u2015]/);
  });
});

describe('reported versions', () => {
  it('the MCP server reports the package version', async () => {
    const { server } = createMcpServer({ agentId: 'test-agent', storagePath: ':memory:' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'metadata-test', version: '1.0.0' });
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    expect(client.getServerVersion()?.version).toBe(pkg.version);
    await client.close();
  });

  it('the local API health route reports the package version', async () => {
    const listener = createLocalApiApp(join(ROOT, 'no-such.db')).listen(0);
    await new Promise<void>((resolve) => listener.once('listening', () => resolve()));
    try {
      const { port } = listener.address() as AddressInfo;
      const body = await (await fetch(`http://127.0.0.1:${port}/api/health`)).json();
      expect(body.version).toBe(pkg.version);
    } finally {
      await new Promise<void>((resolve) => listener.close(() => resolve()));
    }
  });
});
