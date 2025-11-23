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
import { defineTabTool } from './tool';

const extractElementData = defineTabTool({
  capability: 'core',
  schema: {
    name: 'browser_extract_element_data',
    title: 'Extract element data',
    description: 'Extract text content and/or attributes from an element',
    inputSchema: z.object({
      element: z.string().optional().describe('Human-readable element description (optional, for logging)'),
      ref: z.string().describe('Exact target element reference from the page snapshot'),
      text: z.boolean().optional().describe('Extract text content (textContent)'),
      html: z.boolean().optional().describe('Extract inner HTML'),
      value: z.boolean().optional().describe('Extract value (for inputs/textareas/selects)'),
      checked: z.boolean().optional().describe('For checkboxes/radios, extract checked state'),
      attributes: z.array(z.string()).optional().describe('Specific HTML attributes to extract (e.g., ["href", "src", "class", "id", "data-testid"])'),
    }),
    type: 'readOnly',
  },

  handle: async (tab, params, response) => {
    const { locator, resolved } = await tab.refLocator(params);
    const result: Record<string, any> = {};

    // Default to extracting text if nothing specified
    const extractSomething = params.text || params.html || params.value || params.checked || params.attributes?.length;
    if (!extractSomething) {
      params.text = true;
    }

    // Extract requested data
    if (params.text) {
      const textContent = await locator.textContent();
      result.text = textContent;
    }

    if (params.html) {
      const innerHTML = await locator.innerHTML();
      result.html = innerHTML;
    }

    if (params.value) {
      try {
        const value = await locator.inputValue();
        result.value = value;
      } catch {
        result.value = null;
      }
    }

    if (params.checked) {
      try {
        const checked = await locator.isChecked();
        result.checked = checked;
      } catch {
        result.checked = null;
      }
    }

    // Extract attributes
    if (params.attributes && params.attributes.length > 0) {
      result.attributes = {};
      for (const attr of params.attributes) {
        const value = await locator.getAttribute(attr);
        result.attributes[attr] = value;
      }
    }

    // Generate code example
    const codeLines: string[] = [`// Extract data from element`];
    if (params.text) codeLines.push(`const text = await page.${resolved}.textContent();`);
    if (params.html) codeLines.push(`const html = await page.${resolved}.innerHTML();`);
    if (params.value) codeLines.push(`const value = await page.${resolved}.inputValue();`);
    if (params.checked) codeLines.push(`const checked = await page.${resolved}.isChecked();`);
    if (params.attributes?.length) {
      for (const attr of params.attributes) {
        codeLines.push(`const ${attr.replace(/[^a-zA-Z0-9_]/g, '_')} = await page.${resolved}.getAttribute('${attr}');`);
      }
    }
    response.addCode(codeLines.join('\n'));

    // Return the extracted data as JSON
    const resultString = JSON.stringify(result, null, 2);
    response.addResult(resultString);
  },
});

export default [
  extractElementData,
];