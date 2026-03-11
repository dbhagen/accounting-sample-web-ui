<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { getAuthState } from '$lib/auth.svelte';
	import {
		getTransaction,
		deleteTransaction,
		listTransactions,
		type Transaction,
		type LedgerEntry,
	} from '$lib/api/transactions';
	import { getAccount, listAccounts, type Account } from '$lib/api/accounts';

	const auth = getAuthState();

	let transaction = $state<Transaction | null>(null);
	let account = $state<Account | null>(null);
	let accountMap = $state<Map<string, Account>>(new Map());
	let splitChildren = $state<Transaction[]>([]);
	let splitParent = $state<Transaction | null>(null);
	let loading = $state(true);
	let error = $state('');
	let showDeleteConfirm = $state(false);
	let deleting = $state(false);
	let deleteError = $state('');

	onMount(() => {
		if (!auth.isAuthenticated) {
			goto('/login');
			return;
		}
		loadTransaction();
	});

	async function loadTransaction() {
		const id = $page.params.id!;
		loading = true;
		error = '';
		try {
			// Load transaction and all accounts in parallel
			const [result, acctResult] = await Promise.all([
				getTransaction(id),
				listAccounts({ limit: 1000 }),
			]);

			if (acctResult.ok) {
				const accts = acctResult.data.accounts ?? [];
				accountMap = new Map(accts.map((a) => [a.id, a]));
			}

			if (result.ok) {
				transaction = result.data;
				account = accountMap.get(result.data.account_id) ?? null;
				// Load related data in parallel
				const promises: Promise<void>[] = [];
				if (!account) promises.push(loadAccount(result.data.account_id));
				if (result.data.is_split_parent) {
					promises.push(loadSplitChildren(result.data.id));
				}
				if (result.data.split_parent_id) {
					promises.push(loadSplitParent(result.data.split_parent_id));
				}
				await Promise.all(promises);
			} else {
				const errData = result.data as unknown as { error?: string };
				error = errData?.error ?? `Failed to load transaction (${result.status})`;
			}
		} catch {
			error = 'Failed to connect to API';
		} finally {
			loading = false;
		}
	}

	async function loadAccount(accountId: string) {
		try {
			const result = await getAccount(accountId);
			if (result.ok) {
				account = result.data;
			}
		} catch {
			// Non-critical
		}
	}

	async function loadSplitChildren(parentId: string) {
		try {
			const result = await listTransactions({ limit: 100 });
			if (result.ok) {
				splitChildren = result.data.data.filter((t) => t.split_parent_id === parentId);
			}
		} catch {
			// Non-critical
		}
	}

	async function loadSplitParent(parentId: string) {
		try {
			const result = await getTransaction(parentId);
			if (result.ok) {
				splitParent = result.data;
			}
		} catch {
			// Non-critical
		}
	}

	async function handleDelete() {
		if (!transaction) return;
		deleting = true;
		deleteError = '';
		try {
			const result = await deleteTransaction(transaction.id);
			if (result.ok || result.status === 204) {
				goto('/transactions');
			} else {
				const errData = result.data as unknown as { error?: string };
				deleteError = errData?.error ?? `Failed to delete transaction (${result.status})`;
			}
		} catch {
			deleteError = 'Failed to connect to API';
		} finally {
			deleting = false;
		}
	}

	function formatDate(dateStr: string): string {
		try {
			return new Date(dateStr).toLocaleDateString();
		} catch {
			return dateStr;
		}
	}

	function formatDateTime(dateStr: string): string {
		return new Date(dateStr).toLocaleString();
	}

	function netAmount(t: Transaction): string {
		const inflow = parseFloat(t.inflow) || 0;
		const outflow = parseFloat(t.outflow) || 0;
		const net = inflow - outflow;
		if (net > 0) return `+${t.inflow}`;
		if (net < 0) return `-${t.outflow}`;
		return '0.00';
	}

	function netClass(t: Transaction): string {
		const inflow = parseFloat(t.inflow) || 0;
		const outflow = parseFloat(t.outflow) || 0;
		if (inflow > outflow) return 'text-green-600';
		if (outflow > inflow) return 'text-red-600';
		return 'text-gray-600';
	}

	function accountName(id: string): string {
		return accountMap.get(id)?.name ?? id.slice(0, 8) + '...';
	}

	// ---------------------------------------------------------------------------
	// Ledger entry helpers for double-entry bookkeeping display
	// ---------------------------------------------------------------------------

	function parseDecimal(value: string): number {
		const n = Number(value);
		return Number.isFinite(n) ? n : 0;
	}

	/** Collect all ledger entries from this transaction and its split children. */
	function allLedgerEntries(): LedgerEntry[] {
		const entries: LedgerEntry[] = [];
		if (transaction?.ledger_entries) {
			entries.push(...transaction.ledger_entries);
		}
		for (const child of splitChildren) {
			if (child.ledger_entries) {
				entries.push(...child.ledger_entries);
			}
		}
		return entries;
	}

	/** Sum all debit amounts. */
	function totalDebits(entries: LedgerEntry[]): string {
		const sum = entries
			.filter((e) => e.entry_type === 'debit')
			.reduce((acc, e) => acc + parseDecimal(e.amount), 0);
		return sum.toFixed(2);
	}

	/** Sum all credit amounts. */
	function totalCredits(entries: LedgerEntry[]): string {
		const sum = entries
			.filter((e) => e.entry_type === 'credit')
			.reduce((acc, e) => acc + parseDecimal(e.amount), 0);
		return sum.toFixed(2);
	}

	/** Check if debits equal credits (balanced). */
	function isBalanced(entries: LedgerEntry[]): boolean {
		const debits = entries
			.filter((e) => e.entry_type === 'debit')
			.reduce((acc, e) => acc + parseDecimal(e.amount), 0);
		const credits = entries
			.filter((e) => e.entry_type === 'credit')
			.reduce((acc, e) => acc + parseDecimal(e.amount), 0);
		return Math.abs(debits - credits) < 0.00001;
	}

	/** Compute the difference between debits and credits. */
	function balanceDifference(entries: LedgerEntry[]): string {
		const debits = parseFloat(totalDebits(entries));
		const credits = parseFloat(totalCredits(entries));
		return (debits - credits).toFixed(2);
	}
</script>

<svelte:head>
	<title>{transaction?.payee ?? transaction?.memo ?? 'Transaction Details'}</title>
</svelte:head>

<div class="space-y-6">
	<div class="flex items-center gap-3">
		<a href="/transactions" class="text-blue-600 hover:text-blue-800 text-sm">&larr; Back to Transactions</a>
	</div>

	{#if loading}
		<p class="text-gray-500 text-sm">Loading transaction...</p>
	{:else if error}
		<div class="p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{error}</div>
	{:else if transaction}
		<div class="bg-white rounded-lg border border-gray-200 p-6">
			<!-- Header -->
			<div class="flex items-start justify-between mb-6">
				<div>
					<h1 class="text-2xl font-bold text-gray-900">
						{transaction.payee ?? transaction.memo ?? 'Transaction'}
					</h1>
					{#if transaction.payee && transaction.memo}
						<p class="text-sm text-gray-500 mt-1">{transaction.memo}</p>
					{/if}
					<div class="flex items-center gap-2 mt-2">
						{#if transaction.is_split_parent}
							<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-700">Split Parent</span>
						{/if}
						{#if transaction.split_parent_id}
							<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-700">Split Child</span>
						{/if}
						{#if transaction.reconciled}
							<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">Reconciled</span>
						{:else}
							<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">Unreconciled</span>
						{/if}
					</div>
				</div>
				<div class="text-right">
					<p class="text-2xl font-mono font-semibold {netClass(transaction)}">{netAmount(transaction)}</p>
					{#if account}
						<p class="text-sm text-gray-500">{account.currency}</p>
					{/if}
				</div>
			</div>

			<!-- Details Grid -->
			<div class="border-t border-gray-200 pt-4">
				<dl class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 text-sm">
					<div>
						<dt class="font-medium text-gray-500">Transaction ID</dt>
						<dd class="mt-1 text-gray-900 font-mono text-xs break-all">{transaction.id}</dd>
					</div>

					<div>
						<dt class="font-medium text-gray-500">Account</dt>
						<dd class="mt-1">
							{#if account}
								<a href="/accounts/{account.id}" class="text-blue-600 hover:text-blue-800 hover:underline">{account.name}</a>
							{:else}
								<span class="text-gray-900 font-mono text-xs">{transaction.account_id}</span>
							{/if}
						</dd>
					</div>

					<div>
						<dt class="font-medium text-gray-500">Entered Date</dt>
						<dd class="mt-1 text-gray-900">{formatDate(transaction.entered_date)}</dd>
					</div>

					{#if transaction.cleared_date}
						<div>
							<dt class="font-medium text-gray-500">Cleared Date</dt>
							<dd class="mt-1 text-gray-900">{formatDate(transaction.cleared_date)}</dd>
						</div>
					{/if}

					<div>
						<dt class="font-medium text-gray-500">Inflow</dt>
						<dd class="mt-1 text-gray-900 font-mono">{transaction.inflow}</dd>
					</div>

					<div>
						<dt class="font-medium text-gray-500">Outflow</dt>
						<dd class="mt-1 text-gray-900 font-mono">{transaction.outflow}</dd>
					</div>

					{#if transaction.payee}
						<div>
							<dt class="font-medium text-gray-500">Payee</dt>
							<dd class="mt-1 text-gray-900">{transaction.payee}</dd>
						</div>
					{/if}

					{#if transaction.category}
						<div>
							<dt class="font-medium text-gray-500">Category</dt>
							<dd class="mt-1 text-gray-900">{transaction.category}</dd>
						</div>
					{/if}

					{#if transaction.memo}
						<div class="sm:col-span-2">
							<dt class="font-medium text-gray-500">Memo</dt>
							<dd class="mt-1 text-gray-900">{transaction.memo}</dd>
						</div>
					{/if}

					{#if transaction.split_parent_id && splitParent}
						<div>
							<dt class="font-medium text-gray-500">Split Parent</dt>
							<dd class="mt-1">
								<a href="/transactions/{splitParent.id}" class="text-blue-600 hover:text-blue-800 hover:underline">
									{splitParent.payee ?? splitParent.memo ?? splitParent.id.slice(0, 8)}
								</a>
							</dd>
						</div>
					{:else if transaction.split_parent_id}
						<div>
							<dt class="font-medium text-gray-500">Split Parent ID</dt>
							<dd class="mt-1 text-gray-900 font-mono text-xs break-all">
								<a href="/transactions/{transaction.split_parent_id}" class="text-blue-600 hover:text-blue-800 hover:underline">{transaction.split_parent_id}</a>
							</dd>
						</div>
					{/if}

					<div>
						<dt class="font-medium text-gray-500">Version</dt>
						<dd class="mt-1 text-gray-900">{transaction.version}</dd>
					</div>

					<div>
						<dt class="font-medium text-gray-500">Created</dt>
						<dd class="mt-1 text-gray-900">{formatDateTime(transaction.created_at)}</dd>
					</div>

					<div>
						<dt class="font-medium text-gray-500">Last Updated</dt>
						<dd class="mt-1 text-gray-900">{formatDateTime(transaction.updated_at)}</dd>
					</div>
				</dl>
			</div>

			<!-- Split Children -->
			{#if transaction.is_split_parent && splitChildren.length > 0}
				<div class="border-t border-gray-200 pt-4 mt-4">
					<h3 class="text-sm font-medium text-gray-700 mb-3">Split Children ({splitChildren.length})</h3>
					<div class="overflow-x-auto">
						<table class="w-full text-sm">
							<thead>
								<tr class="border-b border-gray-200">
									<th class="text-left py-2 px-3 font-medium text-gray-500">Date</th>
									<th class="text-left py-2 px-3 font-medium text-gray-500">Description</th>
									<th class="text-left py-2 px-3 font-medium text-gray-500">Category</th>
									<th class="text-left py-2 px-3 font-medium text-gray-500">Account</th>
									<th class="text-right py-2 px-3 font-medium text-gray-500">Amount</th>
									<th class="text-center py-2 px-3 font-medium text-gray-500">Entries</th>
								</tr>
							</thead>
							<tbody>
								{#each splitChildren as child}
									<tr class="border-b border-gray-100 hover:bg-gray-50">
										<td class="py-2 px-3 text-gray-600">{formatDate(child.entered_date)}</td>
										<td class="py-2 px-3">
											<a href="/transactions/{child.id}" class="text-blue-600 hover:text-blue-800 hover:underline">
												{child.payee ?? child.memo ?? '—'}
											</a>
										</td>
										<td class="py-2 px-3 text-gray-600">{child.category ?? '—'}</td>
										<td class="py-2 px-3 text-gray-600">{accountName(child.account_id)}</td>
										<td class="py-2 px-3 text-right font-mono {netClass(child)}">{netAmount(child)}</td>
										<td class="py-2 px-3 text-center">
											{#if child.ledger_entries && child.ledger_entries.length > 0}
												<span class="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">{child.ledger_entries.length}</span>
											{:else}
												<span class="text-gray-400">&mdash;</span>
											{/if}
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				</div>
			{/if}

			<!-- Metadata -->
			{#if transaction.metadata && Object.keys(transaction.metadata).length > 0}
				<div class="border-t border-gray-200 pt-4 mt-4">
					<h3 class="text-sm font-medium text-gray-500 mb-2">Metadata</h3>
					<pre class="bg-gray-50 rounded p-3 text-xs text-gray-800 overflow-x-auto">{JSON.stringify(transaction.metadata, null, 2)}</pre>
				</div>
			{/if}

			<!-- Actions -->
			<div class="border-t border-gray-200 pt-4 mt-4 flex flex-wrap gap-3">
				<a
					href="/transactions/{transaction.id}/edit"
					class="px-3 py-1.5 text-sm text-gray-700 border border-gray-300 rounded hover:bg-gray-100"
				>
					Edit Transaction
				</a>
				{#if account}
					<a
						href="/accounts/{account.id}/transactions"
						class="px-3 py-1.5 text-sm text-gray-700 border border-gray-300 rounded hover:bg-gray-100"
					>
						View Account Transactions
					</a>
				{/if}
				<button
					type="button"
					onclick={() => { showDeleteConfirm = true; deleteError = ''; }}
					class="px-3 py-1.5 text-sm text-red-700 border border-red-300 rounded hover:bg-red-50"
				>
					Delete Transaction
				</button>
			</div>

			<!-- Delete Confirmation -->
			{#if showDeleteConfirm}
				<div class="border-t border-gray-200 pt-4 mt-4">
					<div class="p-4 bg-red-50 border border-red-200 rounded">
						<p class="text-sm text-red-800 font-medium mb-3">
							Are you sure you want to delete this transaction? This action cannot be undone.
						</p>
						{#if deleteError}
							<div class="p-2 mb-3 bg-red-100 border border-red-300 text-red-700 rounded text-sm">{deleteError}</div>
						{/if}
						<div class="flex gap-3">
							<button
								type="button"
								onclick={handleDelete}
								disabled={deleting}
								class="px-3 py-1.5 text-sm text-white bg-red-600 rounded hover:bg-red-700 disabled:opacity-50"
							>
								{deleting ? 'Deleting...' : 'Yes, Delete'}
							</button>
							<button
								type="button"
								onclick={() => { showDeleteConfirm = false; }}
								disabled={deleting}
								class="px-3 py-1.5 text-sm text-gray-700 border border-gray-300 rounded hover:bg-gray-100 disabled:opacity-50"
							>
								Cancel
							</button>
						</div>
					</div>
				</div>
			{/if}
		</div>

		<!-- ================================================================== -->
		<!-- Ledger Entries — Double-Entry Bookkeeping Display                   -->
		<!-- ================================================================== -->
		{@const entries = allLedgerEntries()}
		{#if entries.length > 0}
			<div class="bg-white rounded-lg border border-blue-200 p-6">
				<div class="flex items-center justify-between mb-4">
					<h2 class="text-lg font-semibold text-gray-900">
						Ledger Entries
						<span class="text-sm font-normal text-gray-500 ml-1">(Double-Entry Bookkeeping)</span>
					</h2>
					<!-- Balance verification badge -->
					{#if isBalanced(entries)}
						<span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
							<svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
								<path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
							</svg>
							Balanced
						</span>
					{:else}
						<span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
							<svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
								<path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
							</svg>
							Unbalanced
						</span>
					{/if}
				</div>

				<!-- Aggregate ledger entries table with debit/credit columns -->
				<div class="overflow-x-auto">
					<table class="w-full text-sm">
						<thead>
							<tr class="border-b-2 border-gray-200">
								<th class="text-left py-2 px-3 font-medium text-gray-700">Account</th>
								<th class="text-left py-2 px-3 font-medium text-gray-700">Description</th>
								<th class="text-left py-2 px-3 font-medium text-gray-700">Currency</th>
								<th class="text-right py-2 px-3 font-medium text-amber-700">Debit</th>
								<th class="text-right py-2 px-3 font-medium text-blue-700">Credit</th>
							</tr>
						</thead>
						<tbody>
							{#each entries as entry}
								<tr class="border-b border-gray-100 hover:bg-gray-50">
									<td class="py-2 px-3">
										<a href="/accounts/{entry.account_id}" class="text-blue-600 hover:underline">
											{accountName(entry.account_id)}
										</a>
									</td>
									<td class="py-2 px-3 text-gray-600">{entry.description ?? '—'}</td>
									<td class="py-2 px-3 text-gray-500">{entry.currency}</td>
									<td class="py-2 px-3 text-right font-mono">
										{#if entry.entry_type === 'debit'}
											<span class="text-amber-700">{entry.amount}</span>
										{:else}
											<span class="text-gray-300">&mdash;</span>
										{/if}
									</td>
									<td class="py-2 px-3 text-right font-mono">
										{#if entry.entry_type === 'credit'}
											<span class="text-blue-700">{entry.amount}</span>
										{:else}
											<span class="text-gray-300">&mdash;</span>
										{/if}
									</td>
								</tr>
							{/each}
						</tbody>
						<tfoot>
							<tr class="border-t-2 border-gray-300 font-semibold">
								<td class="py-2 px-3 text-gray-700" colspan="3">Totals</td>
								<td class="py-2 px-3 text-right font-mono text-amber-700">{totalDebits(entries)}</td>
								<td class="py-2 px-3 text-right font-mono text-blue-700">{totalCredits(entries)}</td>
							</tr>
							{#if !isBalanced(entries)}
								<tr class="text-red-600">
									<td class="py-1 px-3 text-xs" colspan="3">Difference (Debits &minus; Credits)</td>
									<td class="py-1 px-3 text-right font-mono text-xs" colspan="2">{balanceDifference(entries)}</td>
								</tr>
							{/if}
						</tfoot>
					</table>
				</div>

				<!-- Per-entry metadata (collapsed by default) -->
				{#if entries.some((e) => e.metadata && Object.keys(e.metadata).length > 0)}
					<details class="mt-4">
						<summary class="text-xs text-gray-500 cursor-pointer hover:text-gray-700">Show entry metadata</summary>
						<div class="mt-2 space-y-2">
							{#each entries.filter((e) => e.metadata && Object.keys(e.metadata!).length > 0) as entry}
								<div class="p-2 bg-gray-50 rounded text-xs">
									<span class="font-medium text-gray-600">{accountName(entry.account_id)} ({entry.entry_type}):</span>
									<pre class="mt-1 text-gray-700 overflow-x-auto">{JSON.stringify(entry.metadata, null, 2)}</pre>
								</div>
							{/each}
						</div>
					</details>
				{/if}
			</div>
		{/if}

		<!-- ================================================================== -->
		<!-- Per-Child Ledger Entry Breakdown (for split parents)                -->
		<!-- ================================================================== -->
		{#if transaction.is_split_parent && splitChildren.some((c) => c.ledger_entries && c.ledger_entries.length > 0)}
			<div class="bg-white rounded-lg border border-gray-200 p-6">
				<h2 class="text-lg font-semibold text-gray-900 mb-4">Ledger Entries by Split Child</h2>
				{#each splitChildren.filter((c) => c.ledger_entries && c.ledger_entries.length > 0) as child}
					{@const childEntries = child.ledger_entries ?? []}
					<div class="mb-5 last:mb-0 p-4 bg-gray-50 rounded-lg border border-gray-200">
						<div class="flex items-center gap-2 mb-3">
							<a href="/transactions/{child.id}" class="text-sm text-blue-600 hover:underline font-medium">
								{child.payee ?? child.memo ?? child.id.slice(0, 8)}
							</a>
							<span class="text-xs text-gray-500">({child.category ?? 'uncategorized'})</span>
							<span class="text-xs font-mono {netClass(child)}">{netAmount(child)}</span>
							{#if isBalanced(childEntries)}
								<span class="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded">Balanced</span>
							{:else}
								<span class="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded">Unbalanced</span>
							{/if}
						</div>
						<div class="overflow-x-auto">
							<table class="w-full text-xs">
								<thead>
									<tr class="border-b border-gray-300">
										<th class="text-left py-1.5 px-2 font-medium text-gray-600">Account</th>
										<th class="text-left py-1.5 px-2 font-medium text-gray-600">Description</th>
										<th class="text-left py-1.5 px-2 font-medium text-gray-600">Currency</th>
										<th class="text-right py-1.5 px-2 font-medium text-amber-700">Debit</th>
										<th class="text-right py-1.5 px-2 font-medium text-blue-700">Credit</th>
									</tr>
								</thead>
								<tbody>
									{#each childEntries as entry}
										<tr class="border-b border-gray-100">
											<td class="py-1.5 px-2">
												<a href="/accounts/{entry.account_id}" class="text-blue-600 hover:underline">{accountName(entry.account_id)}</a>
											</td>
											<td class="py-1.5 px-2 text-gray-500">{entry.description ?? '—'}</td>
											<td class="py-1.5 px-2 text-gray-500">{entry.currency}</td>
											<td class="py-1.5 px-2 text-right font-mono">
												{#if entry.entry_type === 'debit'}
													<span class="text-amber-700">{entry.amount}</span>
												{:else}
													<span class="text-gray-300">&mdash;</span>
												{/if}
											</td>
											<td class="py-1.5 px-2 text-right font-mono">
												{#if entry.entry_type === 'credit'}
													<span class="text-blue-700">{entry.amount}</span>
												{:else}
													<span class="text-gray-300">&mdash;</span>
												{/if}
											</td>
										</tr>
									{/each}
								</tbody>
								<tfoot>
									<tr class="border-t border-gray-300 font-semibold">
										<td class="py-1.5 px-2 text-gray-600" colspan="3">Subtotal</td>
										<td class="py-1.5 px-2 text-right font-mono text-amber-700">{totalDebits(childEntries)}</td>
										<td class="py-1.5 px-2 text-right font-mono text-blue-700">{totalCredits(childEntries)}</td>
									</tr>
								</tfoot>
							</table>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	{/if}
</div>
