<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { getAuthState } from '$lib/auth.svelte';
	import { getAccount, type Account } from '$lib/api/accounts';
	import { listTransactions, type Transaction } from '$lib/api/transactions';

	const auth = getAuthState();

	let account = $state<Account | null>(null);
	let transactions = $state<Transaction[]>([]);
	let loading = $state(true);
	let error = $state('');
	let total = $state(0);
	let limit = $state(50);
	let offset = $state(0);

	// Filters
	let filterCategory = $state('');
	let filterReconciled = $state('');
	let filterFromDate = $state('');
	let filterToDate = $state('');

	onMount(() => {
		if (!auth.isAuthenticated) {
			goto('/login');
			return;
		}
		loadData();
	});

	async function loadData() {
		const id = $page.params.id!;
		loading = true;
		error = '';
		try {
			const [accountRes, txRes] = await Promise.all([
				getAccount(id),
				fetchTransactions(id),
			]);

			if (accountRes.ok) {
				account = accountRes.data;
			} else {
				const errData = accountRes.data as unknown as { error?: string };
				error = errData?.error ?? `Failed to load account (${accountRes.status})`;
				return;
			}

			if (txRes.ok) {
				transactions = txRes.data.data;
				total = txRes.data.total;
			} else {
				const errData = txRes.data as unknown as { error?: string };
				error = errData?.error ?? `Failed to load transactions (${txRes.status})`;
			}
		} catch {
			error = 'Failed to connect to API';
		} finally {
			loading = false;
		}
	}

	async function fetchTransactions(accountId: string) {
		const params: Parameters<typeof listTransactions>[0] = {
			account_id: accountId,
			limit,
			offset,
		};
		if (filterCategory) params!.category = filterCategory;
		if (filterReconciled === 'true') params!.reconciled = true;
		if (filterReconciled === 'false') params!.reconciled = false;
		if (filterFromDate) params!.from_date = filterFromDate;
		if (filterToDate) params!.to_date = filterToDate;

		return listTransactions(params);
	}

	async function applyFilters() {
		offset = 0;
		await reloadTransactions();
	}

	async function clearFilters() {
		filterCategory = '';
		filterReconciled = '';
		filterFromDate = '';
		filterToDate = '';
		offset = 0;
		await reloadTransactions();
	}

	async function reloadTransactions() {
		const id = $page.params.id!;
		loading = true;
		error = '';
		try {
			const result = await fetchTransactions(id);
			if (result.ok) {
				transactions = result.data.data;
				total = result.data.total;
			} else {
				const errData = result.data as unknown as { error?: string };
				error = errData?.error ?? `Failed to load transactions (${result.status})`;
			}
		} catch {
			error = 'Failed to connect to API';
		} finally {
			loading = false;
		}
	}

	async function prevPage() {
		if (offset > 0) {
			offset = Math.max(0, offset - limit);
			await reloadTransactions();
		}
	}

	async function nextPage() {
		if (offset + limit < total) {
			offset += limit;
			await reloadTransactions();
		}
	}

	function formatDate(dateStr: string): string {
		return new Date(dateStr).toLocaleDateString();
	}

	function netAmount(tx: Transaction): string {
		const inflow = parseFloat(tx.inflow || '0');
		const outflow = parseFloat(tx.outflow || '0');
		if (inflow > 0) return `+${tx.inflow}`;
		if (outflow > 0) return `-${tx.outflow}`;
		return '0.00';
	}

	function amountClass(tx: Transaction): string {
		const inflow = parseFloat(tx.inflow || '0');
		const outflow = parseFloat(tx.outflow || '0');
		if (inflow > 0) return 'text-green-700';
		if (outflow > 0) return 'text-red-700';
		return 'text-gray-500';
	}

	const hasFilters = $derived(
		filterCategory !== '' || filterReconciled !== '' || filterFromDate !== '' || filterToDate !== ''
	);
</script>

<svelte:head>
	<title>Transactions - {account?.name ?? 'Account'}</title>
</svelte:head>

<div class="space-y-6">
	<div class="flex items-center gap-3">
		<a href="/accounts/{$page.params.id}" class="text-blue-600 hover:text-blue-800 text-sm">&larr; Back to Account</a>
	</div>

	{#if loading && !account}
		<p class="text-gray-500 text-sm">Loading...</p>
	{:else if error && !account}
		<div class="p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{error}</div>
	{:else if account}
		<div class="flex items-center justify-between">
			<div>
				<h1 class="text-2xl font-bold text-gray-900">{account.name} - Transactions</h1>
				<p class="text-sm text-gray-500 mt-1">{account.account_type} &middot; {account.currency} &middot; Balance: <span class="font-mono">{account.balance}</span></p>
			</div>
			<a
				href="/transactions/new?account_id={account.id}"
				class="px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700"
			>
				New Transaction
			</a>
		</div>

		<!-- Filters -->
		<div class="bg-white border border-gray-200 rounded-lg p-4">
			<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
				<div>
					<label for="filterCategory" class="block text-xs font-medium text-gray-600 mb-1">Category</label>
					<input
						id="filterCategory"
						type="text"
						bind:value={filterCategory}
						placeholder="e.g. groceries"
						class="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
					/>
				</div>
				<div>
					<label for="filterReconciled" class="block text-xs font-medium text-gray-600 mb-1">Reconciled</label>
					<select
						id="filterReconciled"
						bind:value={filterReconciled}
						class="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
					>
						<option value="">All</option>
						<option value="true">Yes</option>
						<option value="false">No</option>
					</select>
				</div>
				<div>
					<label for="filterFromDate" class="block text-xs font-medium text-gray-600 mb-1">From Date</label>
					<input
						id="filterFromDate"
						type="date"
						bind:value={filterFromDate}
						class="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
					/>
				</div>
				<div>
					<label for="filterToDate" class="block text-xs font-medium text-gray-600 mb-1">To Date</label>
					<input
						id="filterToDate"
						type="date"
						bind:value={filterToDate}
						class="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
					/>
				</div>
			</div>
			<div class="flex gap-2 mt-3">
				<button
					type="button"
					onclick={applyFilters}
					class="px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700"
				>
					Apply Filters
				</button>
				{#if hasFilters}
					<button
						type="button"
						onclick={clearFilters}
						class="px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded hover:bg-gray-100"
					>
						Clear
					</button>
				{/if}
			</div>
		</div>

		{#if error}
			<div class="p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{error}</div>
		{/if}

		<!-- Transactions table -->
		{#if loading}
			<p class="text-gray-500 text-sm">Loading transactions...</p>
		{:else if transactions.length === 0}
			<div class="bg-white border border-gray-200 rounded-lg p-8 text-center">
				<p class="text-gray-500 text-sm">No transactions found for this account.</p>
			</div>
		{:else}
			<div class="bg-white border border-gray-200 rounded-lg overflow-hidden">
				<div class="overflow-x-auto">
					<table class="min-w-full divide-y divide-gray-200">
						<thead class="bg-gray-50">
							<tr>
								<th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
								<th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Payee</th>
								<th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
								<th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Memo</th>
								<th class="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
								<th class="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Reconciled</th>
								<th class="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Split</th>
							</tr>
						</thead>
						<tbody class="divide-y divide-gray-200">
							{#each transactions as tx (tx.id)}
								<tr class="hover:bg-gray-50">
									<td class="px-4 py-2 text-sm text-gray-900 whitespace-nowrap">
										{formatDate(tx.entered_date)}
									</td>
									<td class="px-4 py-2 text-sm text-gray-900">
										<a href="/transactions/{tx.id}" class="text-blue-600 hover:text-blue-800 hover:underline">
											{tx.payee || '—'}
										</a>
									</td>
									<td class="px-4 py-2 text-sm text-gray-600">
										{tx.category || '—'}
									</td>
									<td class="px-4 py-2 text-sm text-gray-600 max-w-xs truncate">
										{tx.memo || '—'}
									</td>
									<td class="px-4 py-2 text-sm font-mono text-right whitespace-nowrap {amountClass(tx)}">
										{netAmount(tx)}
									</td>
									<td class="px-4 py-2 text-center">
										{#if tx.reconciled}
											<span class="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">Yes</span>
										{:else}
											<span class="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">No</span>
										{/if}
									</td>
									<td class="px-4 py-2 text-center text-sm text-gray-500">
										{#if tx.is_split_parent}
											<span class="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800">Parent</span>
										{:else if tx.split_parent_id}
											<span class="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-purple-50 text-purple-600">Child</span>
										{:else}
											—
										{/if}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>

				<!-- Pagination -->
				<div class="px-4 py-3 bg-gray-50 border-t border-gray-200 flex items-center justify-between text-sm">
					<p class="text-gray-600">
						Showing {offset + 1}–{Math.min(offset + limit, total)} of {total} transactions
					</p>
					<div class="flex gap-2">
						<button
							type="button"
							onclick={prevPage}
							disabled={offset === 0}
							class="px-3 py-1 border border-gray-300 rounded text-sm hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
						>
							Previous
						</button>
						<button
							type="button"
							onclick={nextPage}
							disabled={offset + limit >= total}
							class="px-3 py-1 border border-gray-300 rounded text-sm hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
						>
							Next
						</button>
					</div>
				</div>
			</div>
		{/if}
	{/if}
</div>
