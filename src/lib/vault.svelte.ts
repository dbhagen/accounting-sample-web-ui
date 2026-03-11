import type { KeyDerivationParams, VerificationPayload } from './api';

// Reactive vault state using Svelte 5 runes
let isUnlocked = $state(false);
let sessionId = $state<string | null>(null);
let hasSetup = $state(false);

// Stored vault params (persisted in localStorage after setup)
let storedParams = $state<KeyDerivationParams | null>(null);
let storedVerification = $state<VerificationPayload | null>(null);

const VAULT_PARAMS_KEY = 'vault_params';
const VAULT_VERIFICATION_KEY = 'vault_verification';

export function getVaultState() {
	return {
		get isUnlocked() { return isUnlocked; },
		get sessionId() { return sessionId; },
		get hasSetup() { return hasSetup; },
		get storedParams() { return storedParams; },
		get storedVerification() { return storedVerification; },

		setUnlocked(unlocked: boolean, sid: string | null = null) {
			isUnlocked = unlocked;
			sessionId = sid;
		},

		setHasSetup(value: boolean) {
			hasSetup = value;
		},

		/** Store vault params after successful setup */
		storeSetupResult(params: KeyDerivationParams, verification: VerificationPayload) {
			storedParams = params;
			storedVerification = verification;
			hasSetup = true;
			localStorage.setItem(VAULT_PARAMS_KEY, JSON.stringify(params));
			localStorage.setItem(VAULT_VERIFICATION_KEY, JSON.stringify(verification));
		},

		/** Load stored vault params from localStorage */
		loadStoredParams() {
			try {
				const p = localStorage.getItem(VAULT_PARAMS_KEY);
				const v = localStorage.getItem(VAULT_VERIFICATION_KEY);
				if (p && v) {
					storedParams = JSON.parse(p);
					storedVerification = JSON.parse(v);
					hasSetup = true;
				}
			} catch {
				// Invalid stored data, ignore
			}
		},

		/** Clear all vault state (on logout) */
		clear() {
			isUnlocked = false;
			sessionId = null;
			hasSetup = false;
			storedParams = null;
			storedVerification = null;
			localStorage.removeItem(VAULT_PARAMS_KEY);
			localStorage.removeItem(VAULT_VERIFICATION_KEY);
		},
	};
}
