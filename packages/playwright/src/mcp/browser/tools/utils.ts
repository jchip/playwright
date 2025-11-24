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

import type * as playwright from 'playwright-core';
import type { Tab } from '../tab';

export async function waitForCompletion<R>(tab: Tab, callback: () => Promise<R>): Promise<R | undefined> {
  const requests = new Set<playwright.Request>();
  let frameNavigated = false;
  let waitCallback: () => void = () => {};
  const waitBarrier = new Promise<void>(f => { waitCallback = f; });

  const responseListener = (request: playwright.Request) => {
    requests.delete(request);
    if (!requests.size)
      waitCallback();
  };

  const requestListener = (request: playwright.Request) => {
    requests.add(request);
    void request.response().then(() => responseListener(request)).catch(() => {});
  };

  const frameNavigateListener = (frame: playwright.Frame) => {
    if (frame.parentFrame())
      return;
    frameNavigated = true;
    dispose();
    clearTimeout(timeout);
    void tab.waitForLoadState('load').then(waitCallback);
  };

  const onTimeout = () => {
    dispose();
    waitCallback();
  };

  tab.page.on('request', requestListener);
  tab.page.on('requestfailed', responseListener);
  tab.page.on('framenavigated', frameNavigateListener);
  const timeout = setTimeout(onTimeout, 10000);

  const dispose = () => {
    tab.page.off('request', requestListener);
    tab.page.off('requestfailed', responseListener);
    tab.page.off('framenavigated', frameNavigateListener);
    clearTimeout(timeout);
  };

  try {
    const result = await callback();
    if (!requests.size && !frameNavigated)
      waitCallback();
    await waitBarrier;
    await tab.waitForTimeout(1000);
    return result;
  } catch (error: unknown) {
    // If navigation occurred or will occur shortly, don't report navigation-related errors
    // as failures since the action succeeded in triggering the navigation.
    if (isNavigationError(error)) {
      // Wait a short time for the framenavigated event if it hasn't fired yet.
      if (!frameNavigated)
        await new Promise(resolve => setTimeout(resolve, 500));
      if (frameNavigated) {
        await waitBarrier;
        await tab.waitForTimeout(1000);
        return undefined;
      }
    }
    throw error;
  } finally {
    dispose();
  }
}

function isNavigationError(error: unknown): boolean {
  if (!(error instanceof Error))
    return false;
  const message = error.message.toLowerCase();
  return message.includes('execution context was destroyed') ||
         message.includes('most likely because of a navigation') ||
         message.includes('frame was detached') ||
         message.includes('navigating frame was detached');
}

export async function callOnPageNoTrace<T>(page: playwright.Page, callback: (page: playwright.Page) => Promise<T>): Promise<T> {
  return await (page as any)._wrapApiCall(() => callback(page), { internal: true });
}

export function dateAsFileName(extension: string, prefix: string = 'page'): string {
  const date = new Date();
  return `${prefix}-${date.toISOString().replace(/[:.]/g, '-')}.${extension}`;
}

/**
 * Determines if snapshot should be saved to file.
 * Uses environment variable PW_MCP_SNAPSHOT_INLINE as default when snapshotFile is undefined.
 * - snapshotFile === false: return false (inline)
 * - snapshotFile === true or string: return true (save to file)
 * - snapshotFile === undefined: check env var, if PW_MCP_SNAPSHOT_INLINE=1 return false, otherwise return true
 */
export function shouldSaveSnapshotToFile(snapshotFile: boolean | string | undefined): boolean {
  if (snapshotFile === false)
    return false;
  if (snapshotFile === true || typeof snapshotFile === 'string')
    return true;
  // When undefined, check env var for default behavior
  return process.env.PW_MCP_SNAPSHOT_INLINE !== '1';
}
