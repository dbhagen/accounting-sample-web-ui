import { apiFetch } from '$lib/api';

export interface Transaction {
	id: string;
	account_id: string;
	inflow: string;
	outflow: string;
	memo: string | null;
	payee: string | null;
	category: string | null;
	entered_date: string;
	cleared_date: string | null;
	reconciled: boolean;
	category_id: string | null;
	metadata: Record<string, unknown> | null;
	encrypted_payload: string | null;
	encryption_key_id: string | null;
	extension_metadata: Record<string, unknown> | null;
	import_queue_item_id: string | null;
	split_parent_id: string | null;
	is_split_parent: boolean;
	version: number;
	created_at: string;
	updated_at: string;
	ledger_entries?: LedgerEntry[];
}

export interface LedgerEntryInput {
	account_id: string;
	entry_type: 'debit' | 'credit';
	amount: string;
	currency: string;
	description?: string;
	metadata?: Record<string, unknown>;
}

export interface LedgerEntry extends LedgerEntryInput {
	id: string;
	transaction_id: string;
	version: number;
	created_at: string;
	updated_at: string;
}

export interface CreateTransactionInput {
	account_id: string;
	inflow: string;
	outflow: string;
	memo?: string;
	payee?: string;
	category?: string;
	entered_date?: string;
	cleared_date?: string;
	reconciled?: boolean;
	metadata?: Record<string, unknown>;
	split_parent_id?: string;
	is_split_parent?: boolean;
	ledger_entries?: LedgerEntryInput[];
}

export interface TransactionListResponse {
	data: Transaction[];
	total: number;
	limit: number;
	offset: number;
}

/** Transaction "type" is a UI concept — the API uses inflow/outflow. */
export const TRANSACTION_TYPES = ['income', 'expense', 'transfer'] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

export async function createTransaction(input: CreateTransactionInput) {
	return apiFetch<Transaction>('/api/v1/transactions', {
		method: 'POST',
		body: JSON.stringify(input),
	});
}

export async function listTransactions(params?: {
	limit?: number;
	offset?: number;
	account_id?: string;
	category?: string;
	payee?: string;
	reconciled?: boolean;
	from_date?: string;
	to_date?: string;
	min_amount?: string;
	max_amount?: string;
}) {
	const sp = new URLSearchParams();
	if (params?.limit !== undefined) sp.set('limit', String(params.limit));
	if (params?.offset !== undefined) sp.set('offset', String(params.offset));
	if (params?.account_id) sp.set('account_id', params.account_id);
	if (params?.category) sp.set('category', params.category);
	if (params?.payee) sp.set('payee', params.payee);
	if (params?.reconciled !== undefined) sp.set('reconciled', String(params.reconciled));
	if (params?.from_date) sp.set('from_date', params.from_date);
	if (params?.to_date) sp.set('to_date', params.to_date);
	if (params?.min_amount) sp.set('min_amount', params.min_amount);
	if (params?.max_amount) sp.set('max_amount', params.max_amount);

	const query = sp.toString();
	return apiFetch<TransactionListResponse>(`/api/v1/transactions${query ? `?${query}` : ''}`);
}

export async function getTransaction(id: string) {
	return apiFetch<Transaction>(`/api/v1/transactions/${id}`);
}

export async function updateTransaction(
	id: string,
	input: Partial<CreateTransactionInput> & { version: number },
) {
	return apiFetch<Transaction>(`/api/v1/transactions/${id}`, {
		method: 'PUT',
		body: JSON.stringify(input),
	});
}

export async function deleteTransaction(id: string) {
	return apiFetch<void>(`/api/v1/transactions/${id}`, {
		method: 'DELETE',
	});
}

// ---------------------------------------------------------------------------
// Split transaction helpers
// ---------------------------------------------------------------------------

/** Input for a single child split within a split transaction. */
export interface SplitChildInput {
	account_id: string;
	inflow: string;
	outflow: string;
	memo?: string;
	payee?: string;
	category?: string;
	entered_date?: string;
	cleared_date?: string;
	reconciled?: boolean;
	metadata?: Record<string, unknown>;
	ledger_entries?: LedgerEntryInput[];
}

/** Convenience input that groups a split parent with its children. */
export interface CreateSplitTransactionInput {
	/** Fields for the parent transaction. */
	parent: {
		account_id: string;
		inflow: string;
		outflow: string;
		memo?: string;
		payee?: string;
		category?: string;
		entered_date?: string;
		cleared_date?: string;
		reconciled?: boolean;
		metadata?: Record<string, unknown>;
		ledger_entries?: LedgerEntryInput[];
	};
	/** Child splits that reference the parent. */
	children: SplitChildInput[];
}

/** Result of creating a split transaction (parent + children). */
export interface SplitTransactionResult {
	parent: Transaction;
	children: Transaction[];
	errors: Array<{ index: number; message: string }>;
}

/**
 * Create a split transaction: first creates the parent (is_split_parent=true),
 * then creates each child split referencing the parent's id.
 *
 * Returns the parent, all successfully created children, and any per-child errors.
 */
export async function createSplitTransaction(
	input: CreateSplitTransactionInput,
): Promise<SplitTransactionResult> {
	// 1. Create parent transaction
	const parentPayload: CreateTransactionInput = {
		...input.parent,
		is_split_parent: true,
	};
	const parentRes = await createTransaction(parentPayload);

	if (!parentRes.ok) {
		throw new SplitTransactionError(
			`Failed to create split parent: ${(parentRes.data as unknown as { error?: string })?.error ?? parentRes.status}`,
			parentRes.status,
			parentRes.data,
		);
	}

	const parent = parentRes.data;
	const children: Transaction[] = [];
	const errors: Array<{ index: number; message: string }> = [];

	// 2. Create each child split
	for (let i = 0; i < input.children.length; i++) {
		const child = input.children[i];
		const childPayload: CreateTransactionInput = {
			...child,
			account_id: child.account_id || parent.account_id,
			split_parent_id: parent.id,
			entered_date: child.entered_date || parent.entered_date,
		};

		const childRes = await createTransaction(childPayload);
		if (childRes.ok) {
			children.push(childRes.data);
		} else {
			errors.push({
				index: i,
				message:
					(childRes.data as unknown as { error?: string })?.error ??
					`HTTP ${childRes.status}`,
			});
		}
	}

	return { parent, children, errors };
}

/** Error thrown when split parent creation fails. */
export class SplitTransactionError extends Error {
	constructor(
		message: string,
		public readonly status: number,
		public readonly responseData: unknown,
	) {
		super(message);
		this.name = 'SplitTransactionError';
	}
}

/**
 * Fetch all child splits for a given parent transaction.
 * Uses the list endpoint filtered by the parent's account and then
 * filters client-side by split_parent_id.
 */
export async function listSplitChildren(parentId: string, accountId?: string) {
	const params: Record<string, string | number> = {};
	if (accountId) params.account_id = accountId;

	const res = await listTransactions(params as Parameters<typeof listTransactions>[0]);
	if (!res.ok) return res;

	// Filter to only children of this parent
	return {
		...res,
		data: {
			...res.data,
			data: res.data.data.filter((t) => t.split_parent_id === parentId),
		},
	};
}

/**
 * Build a CreateTransactionInput payload for a child split.
 * Ensures split_parent_id is set and inherits defaults from the parent.
 */
export function buildChildSplitPayload(
	parentId: string,
	parentAccountId: string,
	parentEnteredDate: string,
	child: SplitChildInput,
): CreateTransactionInput {
	return {
		account_id: child.account_id || parentAccountId,
		inflow: child.inflow,
		outflow: child.outflow,
		memo: child.memo,
		payee: child.payee,
		category: child.category,
		entered_date: child.entered_date || parentEnteredDate,
		cleared_date: child.cleared_date,
		reconciled: child.reconciled,
		metadata: child.metadata,
		split_parent_id: parentId,
		ledger_entries: child.ledger_entries,
	};
}

/**
 * Add a single child split to an existing split parent transaction.
 */
export async function addChildSplit(
	parentId: string,
	parentAccountId: string,
	parentEnteredDate: string,
	child: SplitChildInput,
) {
	const payload = buildChildSplitPayload(parentId, parentAccountId, parentEnteredDate, child);
	return createTransaction(payload);
}

/**
 * Validate that split children amounts sum correctly against the parent.
 * Returns null if valid, or an error message string if invalid.
 *
 * For a valid split: sum of children inflows == parent inflow,
 * and sum of children outflows == parent outflow.
 */
export function validateSplitAmounts(
	parentInflow: string,
	parentOutflow: string,
	children: Array<{ inflow: string; outflow: string }>,
): string | null {
	const sumInflow = children.reduce((sum, c) => sum + parseDecimal(c.inflow), 0);
	const sumOutflow = children.reduce((sum, c) => sum + parseDecimal(c.outflow), 0);
	const parentIn = parseDecimal(parentInflow);
	const parentOut = parseDecimal(parentOutflow);

	const inflowDiff = Math.abs(sumInflow - parentIn);
	const outflowDiff = Math.abs(sumOutflow - parentOut);

	// Allow tiny floating point tolerance for display validation
	const tolerance = 0.00001;

	if (inflowDiff > tolerance && parentIn > 0) {
		return `Split inflows (${sumInflow.toFixed(2)}) do not match parent inflow (${parentInflow})`;
	}
	if (outflowDiff > tolerance && parentOut > 0) {
		return `Split outflows (${sumOutflow.toFixed(2)}) do not match parent outflow (${parentOutflow})`;
	}

	return null;
}

/** Parse a decimal string to a number, defaulting to 0. */
function parseDecimal(value: string): number {
	const n = Number(value);
	return Number.isFinite(n) ? n : 0;
}
