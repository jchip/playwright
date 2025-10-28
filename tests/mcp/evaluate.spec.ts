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

test('browser_evaluate', async ({ client, server }) => {
  expect(await client.callTool({
    name: 'browser_navigate',
    arguments: { url: server.HELLO_WORLD },
  })).toHaveResponse({
    pageState: expect.stringContaining(`- Page Title: Title`),
  });

  expect(await client.callTool({
    name: 'browser_evaluate',
    arguments: {
      function: '() => document.title',
    },
  })).toHaveResponse({
    result: `"Title"`,
    code: `await page.evaluate('() => document.title');`,
  });
});

test('browser_evaluate (element)', async ({ client, server }) => {
  server.setContent('/', `
    <body style="background-color: red">Hello, world!</body>
  `, 'text/html');
  await client.callTool({
    name: 'browser_navigate',
    arguments: { url: server.PREFIX },
  });

  expect(await client.callTool({
    name: 'browser_evaluate',
    arguments: {
      function: 'element => element.style.backgroundColor',
      element: 'body',
      ref: 'e1',
    },
  })).toHaveResponse({
    result: `"red"`,
    code: `await page.getByText('Hello, world!').evaluate('element => element.style.backgroundColor');`,
  });
});

test('browser_evaluate object', async ({ client, server }) => {
  expect(await client.callTool({
    name: 'browser_navigate',
    arguments: { url: server.HELLO_WORLD },
  })).toHaveResponse({
    pageState: expect.stringContaining(`- Page Title: Title`),
  });

  expect(await client.callTool({
    name: 'browser_evaluate',
    arguments: {
      function: '() => ({ title: document.title, url: document.URL })',
    },
  })).toHaveResponse({
    result: JSON.stringify({ title: 'Title', url: server.HELLO_WORLD }, null, 2),
    code: `await page.evaluate('() => ({ title: document.title, url: document.URL })');`,
  });
});

test('browser_evaluate (error)', async ({ client, server }) => {
  expect(await client.callTool({
    name: 'browser_navigate',
    arguments: { url: server.HELLO_WORLD },
  })).toHaveResponse({
    pageState: expect.stringContaining(`- Page Title: Title`),
  });

  const result = await client.callTool({
    name: 'browser_evaluate',
    arguments: {
      function: '() => nonExistentVariable',
    },
  });

  expect(result.isError).toBe(true);
  expect(result.content?.[0]?.text).toContain('nonExistentVariable');
  // Check for common error patterns across browsers
  const errorText = result.content?.[0]?.text || '';
  expect(errorText).toMatch(/not defined|Can't find variable/);
});

test('browser_evaluate save to file', async ({ startClient, server }, testInfo) => {
  const outputDir = testInfo.outputPath('output');
  const { client } = await startClient({
    config: { outputDir },
  });

  await client.callTool({
    name: 'browser_navigate',
    arguments: { url: server.HELLO_WORLD },
  });

  // Evaluate a large object that would benefit from file storage
  const response = parseResponse(await client.callTool({
    name: 'browser_evaluate',
    arguments: {
      function: `() => ({
        title: document.title,
        url: document.URL,
        cookies: document.cookie,
        userAgent: navigator.userAgent,
        viewport: { width: window.innerWidth, height: window.innerHeight },
        performance: { timing: performance.timing }
      })`,
      filename: 'test-evaluate.json',
    },
  }));

  expect(response.result).toContain('Evaluation result saved to');
  expect(response.result).toContain('test-evaluate.json');

  // Verify the file was created and contains valid JSON
  const evaluateFile = path.join(outputDir, 'test-evaluate.json');
  expect(fs.existsSync(evaluateFile)).toBeTruthy();

  const content = fs.readFileSync(evaluateFile, 'utf-8');
  const parsed = JSON.parse(content);

  expect(parsed).toHaveProperty('title', 'Title');
  expect(parsed).toHaveProperty('url', server.HELLO_WORLD);
  expect(parsed).toHaveProperty('userAgent');
  expect(parsed).toHaveProperty('viewport');
});
