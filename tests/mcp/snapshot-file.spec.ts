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

test('browser_navigate with snapshotFile', async ({ startClient, server }, testInfo) => {
  const outputDir = testInfo.outputPath('output');
  const { client } = await startClient({
    config: { outputDir },
  });

  const response = parseResponse(await client.callTool({
    name: 'browser_navigate',
    arguments: {
      url: server.HELLO_WORLD,
      snapshotFile: 'test-snapshot.yaml',
    },
  }));

  expect(response.result).toContain('Page snapshot saved to');
  expect(response.result).toContain('test-snapshot.yaml');
  expect(response.result).toContain('Page URL:');
  expect(response.result).toContain('Page Title:');

  // Verify the file was created and contains the snapshot
  const snapshotFile = path.join(outputDir, 'test-snapshot.yaml');
  expect(fs.existsSync(snapshotFile)).toBeTruthy();

  const content = fs.readFileSync(snapshotFile, 'utf-8');
  expect(content).toContain('Page state');
  expect(content).toContain('Page URL:');
  expect(content).toContain('Page Title:');
  expect(content).toContain('Page Snapshot:');
  expect(content).toContain('```yaml');
  expect(content).toContain('Hello, world!');
});

test('browser_snapshot with snapshotFile', async ({ startClient, server }, testInfo) => {
  const outputDir = testInfo.outputPath('output');
  const { client } = await startClient({
    config: { outputDir },
  });

  await client.callTool({
    name: 'browser_navigate',
    arguments: {
      url: server.HELLO_WORLD,
    },
  });

  const response = parseResponse(await client.callTool({
    name: 'browser_snapshot',
    arguments: {
      snapshotFile: 'page-snapshot.yaml',
    },
  }));

  expect(response.result).toContain('Page snapshot saved to');
  expect(response.result).toContain('page-snapshot.yaml');

  // Verify the file was created and contains the full snapshot
  const snapshotFile = path.join(outputDir, 'page-snapshot.yaml');
  expect(fs.existsSync(snapshotFile)).toBeTruthy();

  const content = fs.readFileSync(snapshotFile, 'utf-8');
  expect(content).toContain('Page state');
  expect(content).toContain('Hello, world!');
});

test('browser_navigate without snapshotFile saves to file by default', async ({ startClient, server }) => {
  const { client } = await startClient();
  const response = parseResponse(await client.callTool({
    name: 'browser_navigate',
    arguments: {
      url: server.HELLO_WORLD,
    },
  }));

  // Should always save to file now
  expect(response.result).toContain('Page snapshot saved to');
  expect(response.result).toContain('.yaml');
  expect(response.pageState).toBeFalsy();
});

test('browser_navigate with snapshotFile=false returns inline snapshot', async ({ startClient, server }) => {
  const { client } = await startClient();
  const response = parseResponse(await client.callTool({
    name: 'browser_navigate',
    arguments: {
      url: server.HELLO_WORLD,
      snapshotFile: false,
    },
  }));

  // Should return inline snapshot when false
  expect(response.pageState).toBeTruthy();
  expect(response.pageState).toContain('Hello, world!');
  // When inline, there should be no Result section
  expect(response.result).toBeFalsy();
});
