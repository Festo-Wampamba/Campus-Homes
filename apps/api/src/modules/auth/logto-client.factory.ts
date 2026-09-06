import { Injectable } from '@nestjs/common';
import type { Storage, StorageKey } from '@logto/node';
import type { Env } from '../../config/env';
import { logtoConfigFor, type Portal } from './logto.config';

// Preserve native ESM loading in the Nest CommonJS build.
const nativeImport = new Function('specifier', 'return import(specifier)') as
  (specifier: string) => Promise<typeof import('@logto/node')>;
let modulePromise: ReturnType<typeof nativeImport> | undefined;

export function memoryStorage(values: Record<string, string>): Storage<StorageKey> {
  return {
    getItem: async (key) => values[key] ?? null,
    setItem: async (key, value) => { values[key] = value; },
    removeItem: async (key) => { delete values[key]; },
  };
}

@Injectable()
export class LogtoClientFactory {
  async create(env: Env, portal: Portal, values: Record<string, string>, navigate: (url: string) => void | Promise<void>, state?: string) {
    const { default: Client } = await (modulePromise ??= nativeImport('@logto/node'));
    return new Client(logtoConfigFor(env, portal), {
      storage: memoryStorage(values), navigate,
      ...(state ? { generateState: () => state } : {}),
    });
  }
}
