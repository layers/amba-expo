import { Platform } from 'react-native';

export interface GoogleAuthConfig {
  /** Default Google OAuth client id (used when platform-specific ids are not provided). */
  clientId: string;
  /** Optional iOS-specific client id. */
  iosClientId?: string;
  /** Optional Android-specific client id. */
  androidClientId?: string;
  /** Optional Web client id — required by `AuthSession` on Android in some setups. */
  webClientId?: string;
}

let googleConfig: GoogleAuthConfig | null = null;

/**
 * Store Google OAuth client ids for use by {@link signInWithGoogle}.
 * Called automatically by `Amba.init({ google: {...} })`.
 */
export function configureGoogleAuth(config: GoogleAuthConfig): void {
  googleConfig = config;
}

function pickClientId(): string {
  if (!googleConfig) {
    throw new Error(
      'Google Sign In not configured. Pass `google` to Amba.init() or call configureGoogleAuth() before signInWithGoogle().',
    );
  }

  if (Platform.OS === 'ios' && googleConfig.iosClientId) return googleConfig.iosClientId;
  if (Platform.OS === 'android' && googleConfig.androidClientId)
    return googleConfig.androidClientId;
  if (Platform.OS === 'web' && googleConfig.webClientId) return googleConfig.webClientId;

  return googleConfig.clientId;
}

async function randomNonce(): Promise<string> {
  // OAuth nonces need cryptographic randomness — Math.random is predictable
  // and trivially collidable across sessions. `expo-crypto` wraps the
  // platform's secure RNG (CryptoKit on iOS, AndroidKeyStore on Android).
  // It's an optional peer dep — surface a clear install hint instead of the
  // opaque bundler "Unable to resolve module" error if it's missing.
  let Crypto: typeof import('expo-crypto');
  try {
    Crypto = await import('expo-crypto');
  } catch {
    throw new Error(
      'signInWithGoogle requires expo-crypto. Install it: `npx expo install expo-crypto`',
    );
  }
  const bytes = await Crypto.getRandomBytesAsync(16);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Run a Google Sign In flow via `expo-auth-session` and return the `id_token`
 * which can be exchanged for an Amba session via `auth.loginWithGoogle`.
 *
 * Requires `expo-auth-session` to be installed. The Google client ids must
 * have been registered beforehand via {@link configureGoogleAuth} (or the
 * `google` option on `Amba.init`).
 */
export async function signInWithGoogle(): Promise<string> {
  const clientId = pickClientId();
  const AuthSession = await import('expo-auth-session');

  const nonce = await randomNonce();
  const request = new AuthSession.AuthRequest({
    clientId,
    scopes: ['openid', 'profile', 'email'],
    responseType: AuthSession.ResponseType.IdToken,
    redirectUri: AuthSession.makeRedirectUri(),
    extraParams: { nonce },
  });

  const result = await request.promptAsync({
    authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  });

  if (result.type !== 'success') {
    throw new Error(`Google Sign In failed: ${result.type}`);
  }

  const idToken = result.params['id_token'];
  if (!idToken) {
    throw new Error('Google Sign In did not return an id_token');
  }

  return idToken;
}
