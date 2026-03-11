import { apiFetch } from '$lib/api';

export interface Account {
	id: string;
	name: string;
	account_type: string;
	balance: string;
	currency: string;
	owner_id: string | null;
	organization_id: string | null;
	chart_account_id: string | null;
	encrypted_name: string | null;
	encryption_key_id: string | null;
	is_encrypted: boolean;
	institution_connection_id: string | null;
	display_order: number;
	is_active: boolean;
	metadata: Record<string, unknown> | null;
	version: number;
	created_at: string;
	updated_at: string;
}

export interface CreateAccountInput {
	name: string;
	account_type: string;
	currency?: string;
	metadata?: Record<string, unknown>;
	display_order?: number;
}

export interface UpdateAccountInput {
	name?: string;
	account_type?: string;
	currency?: string;
	metadata?: Record<string, unknown>;
	display_order?: number;
	is_active?: boolean;
	version: number;
}

export interface AccountListResponse {
	accounts: Account[];
	total: number;
	limit: number;
	offset: number;
}

export const ACCOUNT_TYPES = [
	'checking',
	'savings',
	'credit',
	'cash',
	'investment',
	'loan',
	'mortgage',
] as const;

export const COMMON_CURRENCIES = [
	'USD',
	'EUR',
	'GBP',
	'CAD',
	'AUD',
	'JPY',
	'CHF',
] as const;

export async function createAccount(input: CreateAccountInput) {
	return apiFetch<Account>('/api/v1/accounts', {
		method: 'POST',
		body: JSON.stringify(input),
	});
}

export async function listAccounts(params?: {
	limit?: number;
	offset?: number;
	account_type?: string;
	currency?: string;
	is_active?: boolean;
}) {
	const searchParams = new URLSearchParams();
	if (params?.limit !== undefined) searchParams.set('limit', String(params.limit));
	if (params?.offset !== undefined) searchParams.set('offset', String(params.offset));
	if (params?.account_type) searchParams.set('account_type', params.account_type);
	if (params?.currency) searchParams.set('currency', params.currency);
	if (params?.is_active !== undefined) searchParams.set('is_active', String(params.is_active));

	const query = searchParams.toString();
	return apiFetch<AccountListResponse>(`/api/v1/accounts${query ? `?${query}` : ''}`);
}

export async function getAccount(id: string) {
	return apiFetch<Account>(`/api/v1/accounts/${id}`);
}

export async function updateAccount(id: string, input: UpdateAccountInput) {
	return apiFetch<Account>(`/api/v1/accounts/${id}`, {
		method: 'PUT',
		body: JSON.stringify(input),
	});
}

export async function deleteAccount(id: string) {
	return apiFetch<void>(`/api/v1/accounts/${id}`, {
		method: 'DELETE',
	});
}
