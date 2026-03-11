<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { getAuthState } from '$lib/auth.svelte';
	import { listTransactions, type Transaction } from '$lib/api/transactions';
	import { listAccounts, type Account } from '$lib/api/accounts';
	import TransactionFilters from '$lib/components/TransactionFilters.svelte';
	import { type TransactionFilterValues, emptyFilters } from '$lib/api/transaction-filters';

	const auth = getAuthState();

	let transactions = $state<Transaction[]>([]);
	let accounts = $state<Account[]>([]);
	let totalTransactions = $state(0);
	let loading = $state(true);
	let error = $state('');

	// Pagination
	const PAGE_SIZE = 25;
	let currentOffset = $state(0);

	// Current active filters (synced with URL)
	let activeFilters = $state<TransactionFilterValues>({ ...emptyFilters });

	let initialized = false;

	/** Read filter values from URL search params. */
	function readFiltersFromURL(url: URL): { filters: TransactionFilterValues; offset: number } {
		const sp = url.searchParams;
		return {
			filters: {
				accountId: sp.get('account_id') ?? '',
				category: sp.get('category') ?? '',
				payee: sp.get('payee') ?? '',
				reconciled: sp.get('reconciled') ?? '',
				fromDate: sp.get('from_date') ?? '',
				toDate: sp.get('to_date') ?? '',
				minAmount: sp.get('min_amount') ?? '',
				maxAmount: sp.get('max_amount') ?? '',
			},
			offset: parseInt(sp.get('offset') ?? '0', 10) || 0,
		};
	}

	/** Build URL search params from filter state. */
	function buildSearchParams(filters: TransactionFilterValues, offset: number): string {
		const sp = new URLSearchParams();
		if (filters.accountId) sp.set('account_id', filters.accountId);
		if (filters.category) sp.set('category', filters.category);
		if (filters.payee) sp.set('payee', filters.payee);
		if (filters.reconciled) sp.set('reconciled', filters.reconciled);
		if (filters.fromDate) sp.set('from_date', filters.fromDate);
		if (filters.toDate) sp.set('to_date', filters.toDate);
		if (filters.minAmount) sp.set('min_amount', filters.minAmount);
		if (filters.maxAmount) sp.set('max_amount', filters.maxAmount);
		if (offset > 0) sp.set('offset', String(offset));
		const query = sp.toString();
		return query ? `?${query}` : '';
	}

	/** Push current filter state into the URL (replaceState to avoid history spam). */
	function pushToURL(filters: TransactionFilterValues, offset: number) {
		const query = buildSearchParams(filters, offset);
		goto(`/transactions${query}`, { replaceState: true, noScroll: true, keepFocus: true });
	}

	onMount(() => {
		if (!auth.isAuthenticated) {
			goto('/login');
			return;
		}
		loadAccounts();

		// Initialize from current URL params
		const { filters, offset } = readFiltersFromURL(new URL(window.location.href));
		activeFilters = filters;
		currentOffset = offset;
		initialized = true;
		loadTransactions();
	});

	// React to URL param changes (back/forward navigation)
	$effect(() => {
		const url = $page.url;
		if (!initialized) return;
		const { filters, offset } = readFiltersFromURL(url);
		activeFilters = filters;
		currentOffset = offset;
		loadTransactions();
	});

	async function loadAccounts() {
		try {
			const result = await listAccounts({ limit: 1000 });
			if (result.ok) {
				accounts = result.data.accounts ?? [];
			}
		} catch {
			// Non-critical
		}
	}

	async function loadTransactions() {
		loading = true;
		error = '';
		try {
			const params: Record<string, string | boolean | number> = {
				limit: PAGE_SIZE,
				offset: currentOffset,
			};
			if (activeFilters.accountId) params.account_id = activeFilters.accountId;
			if (activeFilters.category) params.category = activeFilters.category;
			if (activeFilters.payee) params.payee = activeFilters.payee;
			if (activeFilters.reconciled === 'true') params.reconciled = true;
			else if (activeFilters.reconciled === 'false') params.reconciled = false;
			if (activeFilters.fromDate)
				params.from_date = new Date(activeFilters.fromDate).toISOString();
			if (activeFilters.toDate) params.to_date = new Date(activeFilters.toDate).toISOString();
			if (activeFilters.minAmount) params.min_amount = activeFilters.minAmount;
			if (activeFilters.maxAmount) params.max_amount = activeFilters.maxAmount;

			const result = await listTransactions(params as Parameters<typeof listTransactions>[0]);
			if (result.ok) {
				transactions = result.data.data ?? [];
				totalTransactions = result.data.total ?? transactions.length;
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

	function accountName(id: string): string {
		return accounts.find((a) => a.id === id)?.name ?? id.slice(0, 8);
	}

	function handleFiltersApply(filters: TransactionFilterValues) {
		activeFilters = filters;
		currentOffset = 0; // Reset to first page on new filter
		pushToURL(filters, 0);
	}

	function goToPage(offset: number) {
		currentOffset = offset;
		pushToURL(activeFilters, offset);
	}

	function clearFiltersAndReload() {
		activeFilters = { ...emptyFilters };
		currentOffset = 0;
		pushToURL(emptyFilters, 0);
	}

	function formatDate(iso: string): string {
		try {
			return new Date(iso).toLocaleDateString();
		} catch {
			return iso;
		}
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

	let hasActiveFilters = $derived(
		!!(
			activeFilters.accountId ||
			activeFilters.category ||
			activeFilters.payee ||
			activeFilters.reconciled ||
			activeFilters.fromDate ||
			activeFilters.toDate ||
			activeFilters.minAmount ||
			activeFilters.maxAmount
		),
	);

	let totalPages = $derived(Math.ceil(totalTransactions / PAGE_SIZE));
	let currentPage = $derived(Math.floor(currentOffset / PAGE_SIZE) + 1);
</script>

<svelte:head>
	<title>Transactions</title>
</svelte:head>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<h1 class="text-2xl font-bold text-gray-900">Transactions</h1>
		<a
			href="/transactions/new"
			class="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700"
		>
			+ New Transaction
		</a>
	</div>

	<!-- Filters -->
	<TransactionFilters
		{accounts}
		{loading}
		initialFilters={activeFilters}
		onApply={handleFiltersApply}
	/>

	<!-- Transaction List -->
	<div class="bg-white rounded-lg border border-gray-200 p-6">
		<div class="flex items-center justify-between mb-4">
			<h2 class="text-lg font-semibold text-gray-900">
				{hasActiveFilters ? 'Filtered' : 'All'} Transactions
			</h2>
			{#if totalTransactions > 0}
				<span class="text-sm text-gray-500">
					{#if totalPages > 1}
						Page {currentPage} of {totalPages} ({totalTransactions} total)
					{:else}
						{totalTransactions} transaction{totalTransactions === 1 ? '' : 's'}
					{/if}
				</span>
			{/if}
		</div>

		{#if loading}
			<p class="text-gray-500 text-sm">Loading transactions...</p>
		{:else if error}
			<div class="p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{error}</div>
		{:else if transactions.length === 0}
			<p class="text-gray-500 text-sm">
				{#if hasActiveFilters}
					No transactions match your filters.
					<button type="button" onclick={clearFiltersAndReload} class="text-blue-600 underline"
						>Clear filters</button
					>
				{:else}
					No transactions found. <a href="/transactions/new" class="text-blue-600 underline"
						>Create one</a
					>.
				{/if}
			</p>
		{:else}
			<div class="overflow-x-auto">
				<table class="w-full text-sm">
					<thead>
						<tr class="border-b border-gray-200">
							<th class="text-left py-2 px-3 font-medium text-gray-700">Date</th>
							<th class="text-left py-2 px-3 font-medium text-gray-700">Description</th>
							<th class="text-left py-2 px-3 font-medium text-gray-700">Category</th>
							<th class="text-left py-2 px-3 font-medium text-gray-700">Account</th>
							<th class="text-right py-2 px-3 font-medium text-gray-700">Amount</th>
							<th class="text-center py-2 px-3 font-medium text-gray-700">R</th>
						</tr>
					</thead>
					<tbody>
						{#each transactions as txn}
							<tr class="border-b border-gray-100 hover:bg-gray-50">
								<td class="py-2 px-3 text-gray-600">{formatDate(txn.entered_date)}</td>
								<td class="py-2 px-3">
									<a
										href="/transactions/{txn.id}"
										class="text-blue-600 hover:text-blue-800 hover:underline"
									>
										{txn.payee ?? txn.memo ?? '\u2014'}
									</a>
									{#if txn.payee && txn.memo}
										<span class="block text-xs text-gray-500 truncate max-w-xs">{txn.memo}</span>
									{/if}
									{#if txn.is_split_parent}
										<span
											class="inline-block ml-1 text-xs bg-purple-100 text-purple-700 px-1 rounded"
											>split</span
										>
									{/if}
								</td>
								<td class="py-2 px-3 text-gray-600">{txn.category ?? '\u2014'}</td>
								<td class="py-2 px-3 text-gray-600">{accountName(txn.account_id)}</td>
								<td class="py-2 px-3 text-right font-mono {netClass(txn)}">{netAmount(txn)}</td>
								<td class="py-2 px-3 text-center">
									{#if txn.reconciled}
										<span class="text-green-600">&#10003;</span>
									{:else}
										<span class="text-gray-400">&#8212;</span>
									{/if}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>

			<!-- Pagination -->
			{#if totalPages > 1}
				<div class="flex items-center justify-between mt-4 pt-4 border-t border-gray-200">
					<button
						type="button"
						disabled={currentOffset === 0}
						onclick={() => goToPage(Math.max(0, currentOffset - PAGE_SIZE))}
						class="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
					>
						Previous
					</button>
					<span class="text-sm text-gray-600">Page {currentPage} of {totalPages}</span>
					<button
						type="button"
						disabled={currentOffset + PAGE_SIZE >= totalTransactions}
						onclick={() => goToPage(currentOffset + PAGE_SIZE)}
						class="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
					>
						Next
					</button>
				</div>
			{/if}
		{/if}
	</div>
</div>
