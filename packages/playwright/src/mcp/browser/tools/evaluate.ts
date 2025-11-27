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
import * as javascript from '../codegen';
import { determineOutputFile } from './utils';
import { snapshotFileSchema } from './snapshot';

import type { Tab } from '../tab';

const evaluateSchema = z.object({
  function: z.string().describe('() => { /* code */ } or (element) => { /* code */ } when element is provided'),
  element: z.string().optional().describe('Human-readable element description used to obtain permission to interact with the element'),
  ref: z.string().optional().describe('Exact target element reference from the page snapshot'),
  filename: z.string().optional().describe('File name to save the evaluation result to. Defaults to `evaluate-{timestamp}.json` if set to empty string. Prefer relative file names to stay within the output directory. When specified, the result is saved to file instead of returned inline (useful for large results like dumping state objects).'),
}).merge(snapshotFileSchema);

const evaluate = defineTabTool({
  capability: 'core',
  schema: {
    name: 'browser_evaluate',
    title: 'Evaluate JavaScript',
    description: 'Evaluate JavaScript expression on page or element',
    inputSchema: evaluateSchema,
    type: 'action',
  },

  handle: async (tab, params, response) => {
    response.setIncludeSnapshot();
    response.setSnapshotFile(params.snapshotFile);

    let locator: Awaited<ReturnType<Tab['refLocator']>> | undefined;
    if (params.ref && params.element) {
      locator = await tab.refLocator({ ref: params.ref, element: params.element });
      response.addCode(`await page.${locator.resolved}.evaluate(${javascript.quote(params.function)});`);
    } else {
      response.addCode(`await page.evaluate(${javascript.quote(params.function)});`);
    }

    await tab.waitForCompletion(async () => {
      const receiver = locator?.locator ?? tab.page;
      const result = await receiver._evaluateFunction(params.function);
      const resultString = JSON.stringify(result, null, 2) || 'undefined';
      const resultSize = Buffer.byteLength(resultString, 'utf-8');

      const outputFile = determineOutputFile(params.filename, resultSize, 'evaluate', 'json');
      if (outputFile) {
        const fileName = await tab.context.outputFile(outputFile, { origin: 'llm', reason: 'Saving evaluation result' });
        await mkdirIfNeeded(fileName);
        await fs.promises.writeFile(fileName, resultString, 'utf-8');
        response.addResult(`Evaluation result saved to ${fileName}`);
        response.addResult(`File size: ${resultSize} bytes`);
      } else {
        response.addResult(resultString);
      }
    });
  },
});

export default [
  evaluate,
];
