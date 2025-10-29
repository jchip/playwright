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

import type * as playwright from 'playwright-core';
import type { Request } from '../../../../../playwright-core/src/client/network';

const requests = defineTabTool({
  capability: 'core',

  schema: {
    name: 'browser_network_requests',
    title: 'List network requests',
    description: 'Returns all network requests since loading the page. When filename is provided, saves to a file instead of returning inline (recommended for large request lists).',
    inputSchema: z.object({
      filename: z.string().optional().describe('File name to save the network requests to. Defaults to `network-{timestamp}.txt` if set to empty string. Prefer relative file names to stay within the output directory. When specified, network requests are saved to file instead of returned inline.'),
      onlyFailed: z.boolean().optional().describe('When true, only include failed requests (4xx and 5xx status codes). Defaults to false.'),
      slowRequestsThreshold: z.number().optional().describe('When specified, only include requests slower than this threshold in milliseconds. For example, 1000 will only show requests that took longer than 1 second.'),
    }),
    type: 'readOnly',
  },

  handle: async (tab, params, response) => {
    const requestList = await tab.requests();

    // Apply filters
    let filteredRequests: playwright.Request[] = Array.from(requestList);
    let totalRequests = filteredRequests.length;
    let failedCount = 0;
    let totalDuration = 0;
    let requestCount = 0;

    // Calculate statistics for all requests first
    for (const request of filteredRequests) {
      const hasResponse = (request as Request)._hasResponse;
      if (hasResponse) {
        const resp = await request.response();
        if (resp && resp.status() >= 400)
          failedCount++;
      }

      const timing = request.timing();
      if (timing.responseStart >= 0 && timing.requestStart >= 0) {
        totalDuration += timing.responseStart - timing.requestStart;
        requestCount++;
      }
    }

    // Filter by failed requests
    if (params.onlyFailed) {
      filteredRequests = [];
      for (const request of requestList) {
        const hasResponse = (request as Request)._hasResponse;
        if (hasResponse) {
          const resp = await request.response();
          if (resp && resp.status() >= 400)
            filteredRequests.push(request);
        }
      }
    }

    // Filter by slow requests
    if (params.slowRequestsThreshold !== undefined) {
      const threshold = params.slowRequestsThreshold;
      filteredRequests = filteredRequests.filter(request => {
        const timing = request.timing();
        if (timing.responseStart >= 0 && timing.requestStart >= 0) {
          const duration = timing.responseStart - timing.requestStart;
          return duration >= threshold;
        }
        return false;
      });
    }

    // Generate summary
    const avgDuration = requestCount > 0 ? Math.round(totalDuration / requestCount) : 0;
    const summary = `Network Summary: ${totalRequests} requests, ${failedCount} failed, average ${avgDuration}ms`;

    if (params.filename !== undefined) {
      // Save to file
      const fileName = await tab.context.outputFile(params.filename || dateAsFileName('txt', 'network'), { origin: 'llm', reason: 'Saving network requests' });
      const lines: string[] = [];

      // Add summary at the top
      lines.push(summary);
      lines.push('');

      for (const request of filteredRequests)
        lines.push(await renderRequest(request));

      const content = lines.join('\n');

      await mkdirIfNeeded(fileName);
      await fs.promises.writeFile(fileName, content, 'utf-8');

      response.addResult(`${summary}\nSaved ${filteredRequests.length} network requests to ${fileName}`);
    } else {
      // Return inline (original behavior)
      response.addResult(summary);
      for (const request of filteredRequests)
        response.addResult(await renderRequest(request));
    }
  },
});

async function renderRequest(request: playwright.Request) {
  const result: string[] = [];
  result.push(`[${request.method().toUpperCase()}] ${request.url()}`);
  const hasResponse = (request as Request)._hasResponse;
  if (hasResponse) {
    const response = await request.response();
    if (response)
      result.push(`=> [${response.status()}] ${response.statusText()}`);
  }
  return result.join(' ');
}

export default [
  requests,
];
