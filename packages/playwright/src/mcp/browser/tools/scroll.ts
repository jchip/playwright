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
import { elementSchema } from './snapshot';

const scroll = defineTabTool({
  capability: 'core',
  schema: {
    name: 'browser_scroll',
    title: 'Scroll page',
    description: 'Scroll the page or an element. Use direction parameters for incremental scrolling or element reference to scroll into view.',
    inputSchema: z.object({
      element: z.string().optional().describe('Human-readable element description used to obtain permission to interact with the element'),
      ref: z.string().optional().describe('Exact target element reference from the page snapshot to scroll into view'),
      direction: z.enum(['up', 'down', 'left', 'right']).optional().describe('Direction to scroll'),
      amount: z.enum(['page', 'halfPage', 'pixels']).optional().default('page').describe('Amount to scroll. "page" scrolls by viewport height/width, "halfPage" by half, "pixels" by specific pixel amount'),
      pixels: z.number().optional().describe('Pixel amount when amount is "pixels". Default is 100.'),
    }),
    type: 'action',
  },

  handle: async (tab, params, response) => {
    response.setIncludeSnapshot();

    // If ref is provided, scroll element into view
    if (params.ref) {
      const { locator, resolved } = await tab.refLocator({ ref: params.ref, element: params.element });
      response.addCode(`// Scroll element into view`);
      response.addCode(`await page.${resolved}.scrollIntoViewIfNeeded();`);
      await tab.waitForCompletion(async () => {
        await locator.scrollIntoViewIfNeeded();
      });
      response.addResult(`Scrolled element into view`);
      return;
    }

    // Scroll page in a direction
    if (params.direction) {
      const direction = params.direction;
      const amountType = params.amount || 'page';
      let scrollAmount = params.pixels || 100;

      // Get viewport dimensions for page/halfPage amounts
      if (amountType !== 'pixels') {
        const viewport = tab.page.viewportSize();
        const dimensions = viewport || await tab.page.evaluate(() => ({
          width: window.innerWidth,
          height: window.innerHeight
        }));

        if (direction === 'up' || direction === 'down') {
          scrollAmount = amountType === 'page' ? dimensions.height : dimensions.height / 2;
        } else {
          scrollAmount = amountType === 'page' ? dimensions.width : dimensions.width / 2;
        }
      }

      const scrollX = direction === 'left' ? -scrollAmount : direction === 'right' ? scrollAmount : 0;
      const scrollY = direction === 'up' ? -scrollAmount : direction === 'down' ? scrollAmount : 0;

      response.addCode(`// Scroll ${direction} by ${Math.round(scrollAmount)} pixels`);
      response.addCode(`await page.evaluate(({ x, y }) => window.scrollBy(x, y), { x: ${scrollX}, y: ${scrollY} });`);

      await tab.waitForCompletion(async () => {
        await tab.page.evaluate(({ x, y }) => window.scrollBy(x, y), { x: scrollX, y: scrollY });
      });

      response.addResult(`Scrolled ${direction} by ${Math.round(scrollAmount)} pixels`);
      return;
    }

    throw new Error('Either "ref" (to scroll element into view) or "direction" (to scroll page) must be provided');
  },
});

export default [
  scroll,
];
