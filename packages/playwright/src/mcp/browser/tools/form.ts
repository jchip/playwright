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
import * as codegen from '../codegen';

type FieldType = 'textbox' | 'checkbox' | 'radio' | 'combobox' | 'slider';

function inferFieldType(resolved: string): FieldType | undefined {
  // resolved looks like: getByRole('textbox', { name: '...' }) or getByLabel('...')
  const roleMatch = resolved.match(/getByRole\('([^']+)'/);
  if (roleMatch) {
    const role = roleMatch[1];
    if (role === 'textbox' || role === 'spinbutton' || role === 'searchbox')
      return 'textbox';
    if (role === 'checkbox')
      return 'checkbox';
    if (role === 'radio')
      return 'radio';
    if (role === 'combobox' || role === 'listbox')
      return 'combobox';
    if (role === 'slider')
      return 'slider';
  }
  // getByLabel is often used for <select> elements
  if (resolved.startsWith('getByLabel('))
    return 'combobox';
  return undefined;
}

const fillForm = defineTabTool({
  capability: 'core',

  schema: {
    name: 'browser_fill_form',
    title: 'Fill form',
    description: 'Fill multiple form fields',
    inputSchema: z.object({
      fields: z.array(z.object({
        ref: z.string().describe('Exact target field reference from the page snapshot'),
        value: z.string().describe('Value to fill in the field. If the field is a checkbox, the value should be `true` or `false`. If the field is a combobox, the value should be the text of the option.'),
      })).describe('Fields to fill in'),
    }),
    type: 'input',
  },

  handle: async (tab, params, response) => {
    for (const field of params.fields) {
      const { locator, resolved } = await tab.refLocator({ element: field.ref, ref: field.ref });
      const locatorSource = `await page.${resolved}`;
      const type = inferFieldType(resolved);
      if (type === 'textbox' || type === 'slider') {
        const secret = tab.context.lookupSecret(field.value);
        await locator.fill(secret.value);
        response.addCode(`${locatorSource}.fill(${secret.code});`);
      } else if (type === 'checkbox' || type === 'radio') {
        await locator.setChecked(field.value === 'true');
        response.addCode(`${locatorSource}.setChecked(${field.value});`);
      } else if (type === 'combobox') {
        await locator.selectOption({ label: field.value });
        response.addCode(`${locatorSource}.selectOption(${codegen.quote(field.value)});`);
      } else {
        // Default to fill for unknown types
        const secret = tab.context.lookupSecret(field.value);
        await locator.fill(secret.value);
        response.addCode(`${locatorSource}.fill(${secret.code});`);
      }
    }
  },
});

export default [
  fillForm,
];
