import { API_BASE_URL as API_BASE } from '$lib/api/config';

export interface TokenPair {
	access_token: string;
	refresh_token: string;
	token_type: string;
	expires_in: number;
	refresh_expires_in: number;
}

export interface UserProfile {
	id: string;
	email: string;
	display_name: string | null;
	is_active: boolean;
	has_encryption_setup: boolean;
	version: number;
	created_at: string;
	updated_at: string;
}

export interface AuthResponse {
	user: UserProfile;
	tokens: TokenPair;
	message: string;
}

export interface ApiError {
	error: string;
	code?: string;
	message?: string;
}

// Token storage
let accessToken: string | null = null;
let refreshToken: string | null = null;

export function setTokens(tokens: TokenPair | null) {
	if (tokens) {
		accessToken = tokens.access_token;
		refreshToken = tokens.refresh_token;
		localStorage.setItem('access_token', tokens.access_token);
		localStorage.setItem('refresh_token', tokens.refresh_token);
	} else {
		accessToken = null;
		refreshToken = null;
		localStorage.removeItem('access_token');
		localStorage.removeItem('refresh_token');
	}
}

export function loadTokens() {
	accessToken = localStorage.getItem('access_token');
	refreshToken = localStorage.getItem('refresh_token');
}

export function getAccessToken(): string | null {
	return accessToken;
}

export function hasTokens(): boolean {
	return accessToken !== null && refreshToken !== null;
}

let isRefreshing = false;
let refreshPromise: Promise<boolean> | null = null;

// Callback invoked when token refresh fails and the user is effectively logged out.
// Set by the layout to update reactive auth state.
let onAuthExpired: (() => void) | null = null;

export function setOnAuthExpired(cb: (() => void) | null) {
	onAuthExpired = cb;
}

async function tryRefreshToken(): Promise<boolean> {
	if (!refreshToken) return false;

	if (isRefreshing && refreshPromise) {
		return refreshPromise;
	}

	isRefreshing = true;
	refreshPromise = (async () => {
		try {
			const res = await fetch(`${API_BASE}/api/v1/auth/refresh`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ refresh_token: refreshToken }),
			});
			if (!res.ok) {
				// Refresh token is invalid/expired – clear everything
				setTokens(null);
				onAuthExpired?.();
				return false;
			}
			const data = await res.json();
			setTokens(data.tokens ?? data);
			return true;
		} catch {
			setTokens(null);
			onAuthExpired?.();
			return false;
		} finally {
			isRefreshing = false;
			refreshPromise = null;
		}
	})();

	return refreshPromise;
}

export async function apiFetch<T = unknown>(
	path: string,
	options: RequestInit = {},
): Promise<{ ok: boolean; status: number; data: T }> {
	const url = `${API_BASE}${path}`;
	const headers: Record<string, string> = {
		'Content-Type': 'application/json',
		...(options.headers as Record<string, string> ?? {}),
	};

	if (accessToken) {
		headers['Authorization'] = `Bearer ${accessToken}`;
	}

	let res = await fetch(url, { ...options, headers });

	// Auto-refresh on 401
	if (res.status === 401 && refreshToken) {
		const refreshed = await tryRefreshToken();
		if (refreshed && accessToken) {
			headers['Authorization'] = `Bearer ${accessToken}`;
			res = await fetch(url, { ...options, headers });
		}
	}

	let data: T;
	try {
		data = await res.json();
	} catch {
		data = {} as T;
	}

	return { ok: res.ok, status: res.status, data };
}

// Auth API calls
export async function register(email: string, password: string, displayName?: string) {
	const body: Record<string, string> = { email, password };
	if (displayName) body.display_name = displayName;

	return apiFetch<AuthResponse>('/api/v1/auth/register', {
		method: 'POST',
		body: JSON.stringify(body),
	});
}

export async function login(email: string, password: string) {
	return apiFetch<AuthResponse>('/api/v1/auth/login', {
		method: 'POST',
		body: JSON.stringify({ email, password }),
	});
}

export async function logout() {
	const result = await apiFetch('/api/v1/auth/logout', {
		method: 'POST',
		body: JSON.stringify({ refresh_token: refreshToken }),
	});
	setTokens(null);
	return result;
}

export async function getMe() {
	return apiFetch<UserProfile>('/api/v1/auth/me');
}

// Vault / Session API types

export interface KeyDerivationParams {
	salt: string;
	memory_cost_kib: number;
	iterations: number;
	parallelism: number;
}

export interface VerificationPayload {
	nonce: string;
	ciphertext: string;
}

export interface VaultSetupResponse {
	key_derivation_params: KeyDerivationParams;
	verification_payload: VerificationPayload;
	message: string;
}

export interface VaultUnlockResponse {
	session_id: string;
	expires_in_seconds: number;
	message: string;
}

export interface VaultLockResponse {
	locked: boolean;
	message: string;
}

export interface VaultStatusResponse {
	unlocked: boolean;
	session_id?: string;
	user_id?: string;
	created_at?: string;
	last_accessed_at?: string;
}

// Session ID storage
let sessionId: string | null = null;

export function setSessionId(id: string | null) {
	sessionId = id;
	if (id) {
		localStorage.setItem('session_id', id);
	} else {
		localStorage.removeItem('session_id');
	}
}

export function loadSessionId() {
	sessionId = localStorage.getItem('session_id');
}

export function getSessionId(): string | null {
	return sessionId;
}

// Vault API calls

export async function vaultSetup(passphrase: string) {
	return apiFetch<VaultSetupResponse>('/api/v1/session/setup', {
		method: 'POST',
		body: JSON.stringify({ passphrase }),
	});
}

export async function vaultUnlock(
	userId: string,
	passphrase: string,
	keyDerivationParams: KeyDerivationParams,
	verificationPayload: VerificationPayload,
) {
	return apiFetch<VaultUnlockResponse>('/api/v1/session/unlock', {
		method: 'POST',
		body: JSON.stringify({
			user_id: userId,
			passphrase,
			key_derivation_params: keyDerivationParams,
			verification_payload: verificationPayload,
		}),
	});
}

export async function vaultLock(vaultSessionId: string) {
	return apiFetch<VaultLockResponse>('/api/v1/session/lock', {
		method: 'POST',
		body: JSON.stringify({ session_id: vaultSessionId }),
	});
}

export async function vaultStatus(vaultSessionId: string) {
	return apiFetch<VaultStatusResponse>('/api/v1/session/status', {
		headers: { 'X-Session-Id': vaultSessionId },
	});
}
