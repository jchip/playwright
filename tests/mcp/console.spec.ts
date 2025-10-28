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

import { test, expect, parseResponse } from './fixtures';

test('browser_console_messages', async ({ client, server }) => {
  server.setContent('/', `
    <!DOCTYPE html>
    <html>
      <script>
        console.log("Hello, world!");
        console.error("Error");
      </script>
    </html>
  `, 'text/html');

  await client.callTool({
    name: 'browser_navigate',
    arguments: {
      url: server.PREFIX,
    },
  });

  const resource = parseResponse(await client.callTool({
    name: 'browser_console_messages',
  }));
  expect(resource.result).toContain('Console Summary: 2 messages (1 errors, 0 warnings');
  expect(resource.result).toContain('[LOG] Hello, world!');
  expect(resource.result).toContain('[ERROR] Error');
});

test('browser_console_messages (page error)', async ({ client, server }) => {
  server.setContent('/', `
    <!DOCTYPE html>
    <html>
      <script>
        throw new Error("Error in script");
      </script>
    </html>
  `, 'text/html');

  await client.callTool({
    name: 'browser_navigate',
    arguments: {
      url: server.PREFIX,
    },
  });

  const resource = await client.callTool({
    name: 'browser_console_messages',
  });
  expect(resource).toHaveResponse({
    result: expect.stringContaining(`Error: Error in script`),
  });
  expect(resource).toHaveResponse({
    result: expect.stringContaining(server.PREFIX),
  });
});

test('recent console messages', async ({ client, server }) => {
  server.setContent('/', `
    <!DOCTYPE html>
    <html>
      <button onclick="console.log('Hello, world!');">Click me</button>
    </html>
  `, 'text/html');

  await client.callTool({
    name: 'browser_navigate',
    arguments: {
      url: server.PREFIX,
    },
  });

  const response = await client.callTool({
    name: 'browser_click',
    arguments: {
      element: 'Click me',
      ref: 'e2',
    },
  });

  expect(response).toHaveResponse({
    consoleMessages: expect.stringContaining(`- [LOG] Hello, world! @`),
  });
});

test('browser_console_messages errors only', async ({ client, server }) => {
  await client.callTool({
    name: 'browser_navigate',
    arguments: {
      url: server.HELLO_WORLD,
    },
  });

  await client.callTool({
    name: 'browser_evaluate',
    arguments: {
      function: `async () => {
        console.log("console.log");
        console.warn("console.warn");
        console.error("console.error");
        setTimeout(() => { throw new Error("unhandled"); }, 0);
        await fetch('/missing');
      }`,
    },
  });

  const response = parseResponse(await client.callTool({
    name: 'browser_console_messages',
    arguments: {
      onlyErrors: true,
    },
  }));
  expect.soft(response.result).toContain('Console Summary');
  expect.soft(response.result).toContain('console.error');
  expect.soft(response.result).toContain('Error: unhandled');
  expect.soft(response.result).toContain('404');
  // The summary line will mention "First warning:" but the actual warning message list should not contain console.log
  // Check that the filtered message section doesn't contain non-errors
  const lines = response.result.split('\n');
  const messageLines = lines.filter(line => line.startsWith('['));
  expect.soft(messageLines.some(line => line.includes('console.log'))).toBe(false);
});

test('browser_console_messages save to file', async ({ startClient, server }, testInfo) => {
  const outputDir = testInfo.outputPath('output');
  const { client } = await startClient({
    config: { outputDir },
  });

  server.setContent('/', `
    <!DOCTYPE html>
    <html>
      <script>
        console.log("Hello, world!");
        console.error("Error message");
        console.warn("Warning message");
      </script>
    </html>
  `, 'text/html');

  await client.callTool({
    name: 'browser_navigate',
    arguments: {
      url: server.PREFIX,
    },
  });

  const response = parseResponse(await client.callTool({
    name: 'browser_console_messages',
    arguments: {
      filename: 'test-console.txt',
    },
  }));

  expect(response.result).toContain('Console Summary: 3 messages');
  expect(response.result).toContain('Saved 3 console messages');
  expect(response.result).toContain('test-console.txt');

  // Verify the file was created and contains the console messages
  const fs = await import('fs');
  const path = await import('path');
  const consoleFile = path.join(outputDir, 'test-console.txt');
  expect(fs.existsSync(consoleFile)).toBeTruthy();

  const content = fs.readFileSync(consoleFile, 'utf-8');
  expect(content).toContain('Hello, world!');
  expect(content).toContain('Error message');
  expect(content).toContain('Warning message');
});

test('browser_console_messages save errors only to file', async ({ startClient, server }, testInfo) => {
  const outputDir = testInfo.outputPath('output');
  const { client } = await startClient({
    config: { outputDir },
  });

  server.setContent('/', `
    <!DOCTYPE html>
    <html>
      <script>
        console.log("Hello, world!");
        console.error("Error message");
        console.warn("Warning message");
      </script>
    </html>
  `, 'text/html');

  await client.callTool({
    name: 'browser_navigate',
    arguments: {
      url: server.PREFIX,
    },
  });

  const response = parseResponse(await client.callTool({
    name: 'browser_console_messages',
    arguments: {
      filename: 'test-errors.txt',
      onlyErrors: true,
    },
  }));

  expect(response.result).toContain('Console Summary: 3 messages');
  expect(response.result).toContain('Saved 1 console messages');
  expect(response.result).toContain('test-errors.txt');

  // Verify the file was created and contains only errors
  const fs = await import('fs');
  const path = await import('path');
  const errorsFile = path.join(outputDir, 'test-errors.txt');
  expect(fs.existsSync(errorsFile)).toBeTruthy();

  const content = fs.readFileSync(errorsFile, 'utf-8');
  expect(content).toContain('Error message');
  expect(content).not.toContain('Hello, world!');
  expect(content).not.toContain('Warning message');
});

test('browser_console_messages with messageTypes filter', async ({ client, server }) => {
  server.setContent('/', `
    <!DOCTYPE html>
    <html>
      <script>
        console.log("Log message");
        console.error("Error message");
        console.warn("Warning message");
        console.info("Info message");
      </script>
    </html>
  `, 'text/html');

  await client.callTool({
    name: 'browser_navigate',
    arguments: {
      url: server.PREFIX,
    },
  });

  const response = parseResponse(await client.callTool({
    name: 'browser_console_messages',
    arguments: {
      messageTypes: ['error', 'warning'],
    },
  }));

  expect(response.result).toContain('Console Summary: 4 messages');
  expect(response.result).toContain('[ERROR] Error message');
  expect(response.result).toContain('[WARNING] Warning message');
  expect(response.result).not.toContain('[LOG] Log message');
  expect(response.result).not.toContain('[INFO] Info message');
});

test('browser_console_messages summary with first error and warning', async ({ client, server }) => {
  server.setContent('/', `
    <!DOCTYPE html>
    <html>
      <script>
        console.log("Log message 1");
        console.warn("First warning");
        console.log("Log message 2");
        console.error("First error");
        console.warn("Second warning");
      </script>
    </html>
  `, 'text/html');

  await client.callTool({
    name: 'browser_navigate',
    arguments: {
      url: server.PREFIX,
    },
  });

  const response = parseResponse(await client.callTool({
    name: 'browser_console_messages',
  }));

  expect(response.result).toContain('Console Summary: 5 messages (1 errors, 2 warnings');
  expect(response.result).toContain('First error: [ERROR] First error');
  expect(response.result).toContain('First warning: [WARNING] First warning');
});

test('browser_console_messages save with messageTypes filter', async ({ startClient, server }, testInfo) => {
  const outputDir = testInfo.outputPath('output');
  const { client } = await startClient({
    config: { outputDir },
  });

  server.setContent('/', `
    <!DOCTYPE html>
    <html>
      <script>
        console.log("Log message");
        console.error("Error message");
        console.warn("Warning message");
      </script>
    </html>
  `, 'text/html');

  await client.callTool({
    name: 'browser_navigate',
    arguments: {
      url: server.PREFIX,
    },
  });

  const response = parseResponse(await client.callTool({
    name: 'browser_console_messages',
    arguments: {
      filename: 'test-warnings.txt',
      messageTypes: ['warning'],
    },
  }));

  expect(response.result).toContain('Console Summary: 3 messages');
  expect(response.result).toContain('Saved 1 console messages');
  expect(response.result).toContain('(filtered to: warning)');
  expect(response.result).toContain('test-warnings.txt');

  // Verify the file was created and contains only warnings
  const fs = await import('fs');
  const path = await import('path');
  const warningsFile = path.join(outputDir, 'test-warnings.txt');
  expect(fs.existsSync(warningsFile)).toBeTruthy();

  const content = fs.readFileSync(warningsFile, 'utf-8');
  expect(content).toContain('Warning message');
  expect(content).not.toContain('Log message');
  expect(content).not.toContain('Error message');
});
