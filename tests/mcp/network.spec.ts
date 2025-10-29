/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import fs from 'fs';
import path from 'path';

import { test, expect, parseResponse } from './fixtures';

test('browser_network_requests', async ({ client, server }) => {
  server.setContent('/', `
    <button onclick="fetch('/json')">Click me</button>
  `, 'text/html');

  server.setContent('/json', JSON.stringify({ name: 'John Doe' }), 'application/json');

  await client.callTool({
    name: 'browser_navigate',
    arguments: {
      url: server.PREFIX,
    },
  });

  await client.callTool({
    name: 'browser_click',
    arguments: {
      element: 'Click me button',
      ref: 'e2',
    },
  });

  await expect.poll(() => client.callTool({
    name: 'browser_network_requests',
  })).toHaveResponse({
    result: expect.stringContaining(`[GET] ${`${server.PREFIX}/`} => [200] OK
[GET] ${`${server.PREFIX}/json`} => [200] OK`),
  });
});

test('browser_network_requests save to file', async ({ startClient, server }, testInfo) => {
  const outputDir = testInfo.outputPath('output');
  const { client } = await startClient({
    config: { outputDir },
  });

  server.setContent('/', `
    <button onclick="fetch('/json')">Click me</button>
    <button onclick="fetch('/api')">Click me too</button>
  `, 'text/html');

  server.setContent('/json', JSON.stringify({ name: 'John Doe' }), 'application/json');
  server.setContent('/api', JSON.stringify({ status: 'ok' }), 'application/json');

  await client.callTool({
    name: 'browser_navigate',
    arguments: {
      url: server.PREFIX,
    },
  });

  await client.callTool({
    name: 'browser_click',
    arguments: {
      element: 'Click me button',
      ref: 'e2',
    },
  });

  await client.callTool({
    name: 'browser_click',
    arguments: {
      element: 'Click me too button',
      ref: 'e3',
    },
  });

  // Wait for all requests to be processed
  await new Promise(resolve => setTimeout(resolve, 100));

  const response = parseResponse(await client.callTool({
    name: 'browser_network_requests',
    arguments: {
      filename: 'test-network.txt',
    },
  }));

  expect(response.result).toContain('Saved 3 network requests to');
  expect(response.result).toContain('test-network.txt');

  // Verify the file was created and contains the network requests
  const networkFile = path.join(outputDir, 'test-network.txt');
  expect(fs.existsSync(networkFile)).toBeTruthy();

  const content = fs.readFileSync(networkFile, 'utf-8');
  expect(content).toContain('Network Summary:');
  expect(content).toContain(`[GET] ${server.PREFIX}/`);
  expect(content).toContain(`[GET] ${server.PREFIX}/json`);
  expect(content).toContain(`[GET] ${server.PREFIX}/api`);
  expect(content).toContain('=> [200] OK');
});

test('browser_network_requests with onlyFailed filter', async ({ client, server }) => {
  server.setContent('/', `
    <button onclick="fetch('/json')">Success</button>
    <button onclick="fetch('/notfound')">Not Found</button>
    <button onclick="fetch('/error')">Error</button>
  `, 'text/html');

  server.setContent('/json', JSON.stringify({ name: 'John Doe' }), 'application/json');

  server.setRoute('/notfound', (req, res) => {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  });

  server.setRoute('/error', (req, res) => {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Internal Server Error');
  });

  await client.callTool({
    name: 'browser_navigate',
    arguments: {
      url: server.PREFIX,
    },
  });

  await client.callTool({
    name: 'browser_click',
    arguments: {
      element: 'Success button',
      ref: 'e2',
    },
  });

  await client.callTool({
    name: 'browser_click',
    arguments: {
      element: 'Not Found button',
      ref: 'e3',
    },
  });

  await client.callTool({
    name: 'browser_click',
    arguments: {
      element: 'Error button',
      ref: 'e4',
    },
  });

  // Wait for all requests to be processed
  await new Promise(resolve => setTimeout(resolve, 100));

  const response = await client.callTool({
    name: 'browser_network_requests',
    arguments: {
      onlyFailed: true,
    },
  });

  const result = parseResponse(response).result;
  expect(result).toContain('Network Summary:');
  expect(result).toContain('2 failed');
  expect(result).toContain(`[GET] ${server.PREFIX}/notfound`);
  expect(result).toContain('=> [404]');
  expect(result).toContain(`[GET] ${server.PREFIX}/error`);
  expect(result).toContain('=> [500]');
  expect(result).not.toContain(`[GET] ${server.PREFIX}/json`);
});

test('browser_network_requests with slowRequestsThreshold filter', async ({ startClient, server }) => {
  const { client } = await startClient();

  server.setContent('/', `
    <button onclick="fetch('/fast')">Fast</button>
    <button onclick="fetch('/slow')">Slow</button>
  `, 'text/html');

  server.setRoute('/fast', (req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ speed: 'fast' }));
  });

  server.setRoute('/slow', async (req, res) => {
    await new Promise(resolve => setTimeout(resolve, 100));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ speed: 'slow' }));
  });

  await client.callTool({
    name: 'browser_navigate',
    arguments: {
      url: server.PREFIX,
    },
  });

  await client.callTool({
    name: 'browser_click',
    arguments: {
      element: 'Fast button',
      ref: 'e2',
    },
  });

  await client.callTool({
    name: 'browser_click',
    arguments: {
      element: 'Slow button',
      ref: 'e3',
    },
  });

  // Wait for all requests to be processed
  await new Promise(resolve => setTimeout(resolve, 200));

  const response = await client.callTool({
    name: 'browser_network_requests',
    arguments: {
      slowRequestsThreshold: 50,
    },
  });

  const result = parseResponse(response).result;
  expect(result).toContain('Network Summary:');
  expect(result).toContain(`[GET] ${server.PREFIX}/slow`);
  expect(result).not.toContain(`[GET] ${server.PREFIX}/fast`);
});
