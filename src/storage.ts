import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AmbaStorage } from '@layers/amba-client';

/**
 * `AmbaStorage` adapter backed by `@react-native-async-storage/async-storage`.
 *
 * This is installed automatically by the Expo `Amba` singleton — you do not
 * normally need to use it directly. Exposed for advanced use cases where you
 * construct your own `AmbaClient` instance.
 */
export const asyncStorageAdapter: AmbaStorage = {
  async getItem(key: string): Promise<string | null> {
    return AsyncStorage.getItem(key);
  },
  async setItem(key: string, value: string): Promise<void> {
    await AsyncStorage.setItem(key, value);
  },
  async removeItem(key: string): Promise<void> {
    await AsyncStorage.removeItem(key);
  },
};
