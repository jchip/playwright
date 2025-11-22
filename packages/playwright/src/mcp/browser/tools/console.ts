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

import { mkdirIfNeeded } from 'playwright-core/lib/utils';

import { z } from '../../sdk/bundle';
import { defineTabTool } from './tool';
import { dateAsFileName } from './utils';

const console = defineTabTool({
  capability: 'core',
  schema: {
    name: 'browser_console_messages',
    title: 'Get console messages',
    description: 'Returns all console messages with optional filtering and summary. By default saves to a file (recommended for large logs).',
    inputSchema: z.object({
      onlyErrors: z.boolean().optional().describe('Only return error messages (deprecated: use messageTypes instead)'),
      messageTypes: z.array(z.enum(['error', 'warning', 'log', 'info'])).optional().describe('Filter by message types. If not specified, returns all message types.'),
      filename: z.union([z.string(), z.boolean()]).optional().describe('File name to save the console messages to. When true, uses default filename `console-{timestamp}.txt`. When false, returns messages inline. When a string, saves to that filename. Prefer relative file names to stay within the output directory.'),
    }),
    type: 'readOnly',
  },
  handle: async (tab, params, response) => {
    // Determine which types to filter by
    let types: ('error' | 'warning' | 'log' | 'info')[] | undefined;
    if (params.messageTypes && params.messageTypes.length > 0) {
      types = params.messageTypes;
    } else if (params.onlyErrors) {
      // Support legacy onlyErrors parameter
      types = ['error'];
    }

    const messages = await tab.consoleMessages(types);
    const allMessages = await tab.consoleMessages();

    // Generate summary
    const summary = {
      total: allMessages.length,
      errors: allMessages.filter(m => m.type === 'error').length,
      warnings: allMessages.filter(m => m.type === 'warning').length,
      logs: allMessages.filter(m => m.type === 'log').length,
      info: allMessages.filter(m => m.type === 'info').length,
    };

    const summaryText = `Console Summary: ${summary.total} messages (${summary.errors} errors, ${summary.warnings} warnings, ${summary.logs} logs, ${summary.info} info)`;

    // Find first error and warning for quick reference
    const firstError = allMessages.find(m => m.type === 'error');
    const firstWarning = allMessages.find(m => m.type === 'warning');

    // Handle filename parameter: false = inline, true/string/undefined = file
    if (params.filename !== false) {
      // Save to file (default behavior)
      const fileName = await tab.context.outputFile(
        typeof params.filename === 'string' ? params.filename : dateAsFileName('txt', 'console'),
        { origin: 'llm', reason: 'Saving console messages' }
      );
      const content = messages.map(message => message.toString()).join('\n');

      await mkdirIfNeeded(fileName);
      await fs.promises.writeFile(fileName, content, 'utf-8');

      const filterDesc = types ? `(filtered to: ${types.join(', ')})` : '';
      response.addResult(summaryText);
      if (firstError)
        response.addResult(`First error: ${firstError.toString()}`);
      if (firstWarning)
        response.addResult(`First warning: ${firstWarning.toString()}`);
      response.addResult(`\nSaved ${messages.length} console messages ${filterDesc} to ${fileName}`);
      response.addResult(`File size: ${Buffer.byteLength(content, 'utf-8')} bytes`);
    } else {
      // Return inline (when explicitly set to false)
      response.addResult(summaryText);
      if (firstError)
        response.addResult(`First error: ${firstError.toString()}`);
      if (firstWarning)
        response.addResult(`First warning: ${firstWarning.toString()}`);
      response.addResult(''); // Empty line separator
      messages.map(message => response.addResult(message.toString()));
    }
  },
});

export default [
  console,
];
