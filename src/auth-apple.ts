import { Platform } from 'react-native';

/**
 * Check whether Apple Sign In is available on the current device.
 * Returns `false` on non-iOS platforms and when `expo-apple-authentication`
 * is not installed.
 */
export async function isAppleAuthAvailable(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  try {
    const AppleAuth = await import('expo-apple-authentication');
    return await AppleAuth.isAvailableAsync();
  } catch {
    return false;
  }
}

/**
 * Prompt the user to sign in with their Apple ID and return the identity token
 * that can be exchanged for an Amba session via `auth.loginWithApple`.
 *
 * Throws if `expo-apple-authentication` is not installed or the user cancels
 * the flow.
 */
export async function signInWithApple(): Promise<string> {
  const AppleAuth = await import('expo-apple-authentication');
  const credential = await AppleAuth.signInAsync({
    requestedScopes: [
      AppleAuth.AppleAuthenticationScope.FULL_NAME,
      AppleAuth.AppleAuthenticationScope.EMAIL,
    ],
  });

  if (!credential.identityToken) {
    throw new Error('Apple Sign In did not return an identity token');
  }

  return credential.identityToken;
}
