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
    description: 'Returns all console messages. When filename is provided, saves to a file instead of returning inline (recommended for large logs).',
    inputSchema: z.object({
      onlyErrors: z.boolean().optional().describe('Only return error messages'),
      filename: z.string().optional().describe('File name to save the console messages to. Defaults to `console-{timestamp}.txt` if set to empty string. Prefer relative file names to stay within the output directory. When specified, console messages are saved to file instead of returned inline.'),
    }),
    type: 'readOnly',
  },
  handle: async (tab, params, response) => {
    const messages = await tab.consoleMessages(params.onlyErrors ? 'error' : undefined);

    if (params.filename !== undefined) {
      // Save to file
      const fileName = await tab.context.outputFile(params.filename || dateAsFileName('txt', 'console'), { origin: 'llm', reason: 'Saving console messages' });
      const content = messages.map(message => message.toString()).join('\n');

      await mkdirIfNeeded(fileName);
      await fs.promises.writeFile(fileName, content, 'utf-8');

      const messageType = params.onlyErrors ? 'error messages' : 'console messages';
      response.addResult(`Saved ${messages.length} ${messageType} to ${fileName}`);
    } else {
      // Return inline (original behavior)
      messages.map(message => response.addResult(message.toString()));
    }
  },
});

export default [
  console,
];
