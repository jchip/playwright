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

import { z } from '../../sdk/bundle';
import { defineTabTool, defineTool } from './tool';
import { dateAsFileName } from './utils';
import { shouldSaveSnapshotToFile } from './utils';
import * as javascript from '../codegen';

const snapshot = defineTool({
  capability: 'core',
  schema: {
    name: 'browser_snapshot',
    title: 'Page snapshot',
    description: 'Capture accessibility snapshot of the current page, this is better than screenshot',
    inputSchema: z.object({
      snapshotFile: z.union([z.string(), z.boolean()]).optional().describe('File name to save the page snapshot to, or false to return inline. Defaults to `snapshot-{timestamp}.yaml`. When true or omitted, uses default filename. When false, returns snapshot inline. Prefer relative file names to stay within the output directory.'),
    }),
    type: 'readOnly',
  },

  handle: async (context, params, response) => {
    await context.ensureTab();
    response.setIncludeSnapshot('full');
    // Handle snapshotFile parameter: false = inline, true/string/undefined = file (respects PW_MCP_SNAPSHOT_INLINE env)
    if (shouldSaveSnapshotToFile(params.snapshotFile)) {
      const filename = typeof params.snapshotFile === 'string' ? params.snapshotFile : dateAsFileName('yaml', 'snapshot');
      response.setSnapshotFile(filename);
    }
  },
});

export const elementSchema = z.object({
  element: z.string().optional().describe('Human-readable element description (optional, for logging)'),
  ref: z.string().describe('Exact target element reference from the page snapshot'),
});

export const snapshotFileSchema = z.object({
  snapshotFile: z.union([z.string(), z.boolean()]).optional().describe('File name to save the page snapshot to, or false to return inline. Defaults to saving to file with auto-generated name. Prefer relative file names to stay within the output directory.'),
});

const clickSchema = elementSchema.extend({
  doubleClick: z.boolean().optional().describe('Whether to perform a double click instead of a single click'),
  button: z.enum(['left', 'right', 'middle']).optional().describe('Button to click, defaults to left'),
  modifiers: z.array(z.enum(['Alt', 'Control', 'ControlOrMeta', 'Meta', 'Shift'])).optional().describe('Modifier keys to press'),
}).merge(snapshotFileSchema);

const click = defineTabTool({
  capability: 'core',
  schema: {
    name: 'browser_click',
    title: 'Click',
    description: 'Perform click on a web page',
    inputSchema: clickSchema,
    type: 'input',
  },

  handle: async (tab, params, response) => {
    response.setIncludeSnapshot();
    if (shouldSaveSnapshotToFile(params.snapshotFile)) {
      const filename = typeof params.snapshotFile === 'string' ? params.snapshotFile : dateAsFileName('yaml', 'click');
      response.setSnapshotFile(filename);
    }

    const { locator, resolved } = await tab.refLocator(params);
    const options = {
      button: params.button,
      modifiers: params.modifiers,
    };
    const formatted = javascript.formatObject(options, ' ', 'oneline');
    const optionsAttr = formatted !== '{}' ? formatted : '';

    if (params.doubleClick)
      response.addCode(`await page.${resolved}.dblclick(${optionsAttr});`);
    else
      response.addCode(`await page.${resolved}.click(${optionsAttr});`);

    await tab.waitForCompletion(async () => {
      if (params.doubleClick)
        await locator.dblclick(options);
      else
        await locator.click(options);
    });
  },
});

const drag = defineTabTool({
  capability: 'core',
  schema: {
    name: 'browser_drag',
    title: 'Drag mouse',
    description: 'Perform drag and drop between two elements',
    inputSchema: z.object({
      startElement: z.string().optional().describe('Human-readable source element description (optional, for logging)'),
      startRef: z.string().describe('Exact source element reference from the page snapshot'),
      endElement: z.string().optional().describe('Human-readable target element description (optional, for logging)'),
      endRef: z.string().describe('Exact target element reference from the page snapshot'),
    }).merge(snapshotFileSchema),
    type: 'input',
  },

  handle: async (tab, params, response) => {
    response.setIncludeSnapshot();
    if (shouldSaveSnapshotToFile(params.snapshotFile)) {
      const filename = typeof params.snapshotFile === 'string' ? params.snapshotFile : dateAsFileName('yaml', 'drag');
      response.setSnapshotFile(filename);
    }

    const [start, end] = await tab.refLocators([
      { ref: params.startRef, element: params.startElement },
      { ref: params.endRef, element: params.endElement },
    ]);

    await tab.waitForCompletion(async () => {
      await start.locator.dragTo(end.locator);
    });

    response.addCode(`await page.${start.resolved}.dragTo(page.${end.resolved});`);
  },
});

const hover = defineTabTool({
  capability: 'core',
  schema: {
    name: 'browser_hover',
    title: 'Hover mouse',
    description: 'Hover over element on page',
    inputSchema: elementSchema.merge(snapshotFileSchema),
    type: 'input',
  },

  handle: async (tab, params, response) => {
    response.setIncludeSnapshot();
    if (shouldSaveSnapshotToFile(params.snapshotFile)) {
      const filename = typeof params.snapshotFile === 'string' ? params.snapshotFile : dateAsFileName('yaml', 'hover');
      response.setSnapshotFile(filename);
    }

    const { locator, resolved } = await tab.refLocator(params);
    response.addCode(`await page.${resolved}.hover();`);

    await tab.waitForCompletion(async () => {
      await locator.hover();
    });
  },
});

const selectOptionSchema = elementSchema.extend({
  values: z.array(z.string()).describe('Array of values to select in the dropdown. This can be a single value or multiple values.'),
}).merge(snapshotFileSchema);

const selectOption = defineTabTool({
  capability: 'core',
  schema: {
    name: 'browser_select_option',
    title: 'Select option',
    description: 'Select an option in a dropdown',
    inputSchema: selectOptionSchema,
    type: 'input',
  },

  handle: async (tab, params, response) => {
    response.setIncludeSnapshot();
    if (shouldSaveSnapshotToFile(params.snapshotFile)) {
      const filename = typeof params.snapshotFile === 'string' ? params.snapshotFile : dateAsFileName('yaml', 'select');
      response.setSnapshotFile(filename);
    }

    const { locator, resolved } = await tab.refLocator(params);
    response.addCode(`await page.${resolved}.selectOption(${javascript.formatObject(params.values)});`);

    await tab.waitForCompletion(async () => {
      await locator.selectOption(params.values);
    });
  },
});

const pickLocator = defineTabTool({
  capability: 'testing',
  schema: {
    name: 'browser_generate_locator',
    title: 'Create locator for element',
    description: 'Generate locator for the given element to use in tests',
    inputSchema: elementSchema,
    type: 'readOnly',
  },

  handle: async (tab, params, response) => {
    const { resolved } = await tab.refLocator(params);
    response.addResult(resolved);
  },
});

export default [
  snapshot,
  click,
  drag,
  hover,
  selectOption,
  pickLocator,
];
