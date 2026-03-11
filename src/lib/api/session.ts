/**
 * Session / Vault API utilities.
 *
 * Covers the zero-knowledge encryption lifecycle:
 *   POST /session/setup   — first-time passphrase setup
 *   POST /session/unlock  — derive key & start session
 *   POST /session/lock    — purge key from memory
 *   GET  /session/status  — check if vault is unlocked
 */

import { apiFetch } from '$lib/api';

// ── Types ──────────────────────────────────────────────────────────

export interface KeyDerivationParams {
	salt: string;
	memory_cost_kib: number;
	iterations: number;
	parallelism: number;
}

export interface EncryptedPayload {
	nonce: string;
	ciphertext: string;
}

export interface SetupResponse {
	key_derivation_params: KeyDerivationParams;
	verification_payload: EncryptedPayload;
	message: string;
}

export interface UnlockResponse {
	session_id: string;
	expires_in_seconds: number;
	message: string;
}

export interface LockResponse {
	locked: boolean;
	message: string;
}

export interface SessionStatusResponse {
	unlocked: boolean;
	session_id?: string;
	user_id?: string;
	created_at?: string;
	last_accessed_at?: string;
}

export interface SessionError {
	error: string;
	code: string;
}

// ── API calls ──────────────────────────────────────────────────────

/**
 * Set up zero-knowledge encryption for the current user.
 *
 * Sends the passphrase to the server which generates key derivation
 * parameters and a verification payload. The passphrase is never stored
 * on the server.
 */
export async function sessionSetup(passphrase: string) {
	return apiFetch<SetupResponse>('/api/v1/session/setup', {
		method: 'POST',
		body: JSON.stringify({ passphrase }),
	});
}

/**
 * Unlock the vault by deriving a key from the passphrase.
 */
export async function sessionUnlock(
	userId: string,
	passphrase: string,
	keyDerivationParams: KeyDerivationParams,
	verificationPayload: EncryptedPayload,
) {
	return apiFetch<UnlockResponse>('/api/v1/session/unlock', {
		method: 'POST',
		body: JSON.stringify({
			user_id: userId,
			passphrase,
			key_derivation_params: keyDerivationParams,
			verification_payload: verificationPayload,
		}),
	});
}

/**
 * Lock the vault, purging the encryption key from server memory.
 */
export async function sessionLock(sessionId: string) {
	return apiFetch<LockResponse>('/api/v1/session/lock', {
		method: 'POST',
		body: JSON.stringify({ session_id: sessionId }),
	});
}

/**
 * Check current vault/session status.
 *
 * Optionally pass a session ID to include in the X-Session-Id header.
 */
export async function sessionStatus(sessionId?: string) {
	const headers: Record<string, string> = {};
	if (sessionId) {
		headers['X-Session-Id'] = sessionId;
	}
	return apiFetch<SessionStatusResponse>('/api/v1/session/status', {
		headers,
	});
}
