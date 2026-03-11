<script lang="ts">
	import type { Account } from '$lib/api/accounts';
	import { type TransactionFilterValues, emptyFilters } from '$lib/api/transaction-filters';

	interface Props {
		accounts: Account[];
		loading?: boolean;
		initialFilters?: TransactionFilterValues;
		onApply: (filters: TransactionFilterValues) => void;
	}

	let { accounts, loading = false, initialFilters, onApply }: Props = $props();

	let accountId = $state('');
	let category = $state('');
	let payee = $state('');
	let reconciled = $state('');
	let fromDate = $state('');
	let toDate = $state('');
	let minAmount = $state('');
	let maxAmount = $state('');

	let hasActiveFilters = $derived(
		!!(accountId || category || payee || reconciled || fromDate || toDate || minAmount || maxAmount),
	);

	/** Sync from parent when initialFilters prop changes (e.g. URL navigation). */
	$effect(() => {
		if (initialFilters) {
			accountId = initialFilters.accountId;
			category = initialFilters.category;
			payee = initialFilters.payee;
			reconciled = initialFilters.reconciled;
			fromDate = initialFilters.fromDate;
			toDate = initialFilters.toDate;
			minAmount = initialFilters.minAmount;
			maxAmount = initialFilters.maxAmount;
		}
	});

	function apply() {
		onApply({ accountId, category, payee, reconciled, fromDate, toDate, minAmount, maxAmount });
	}

	function clear() {
		accountId = '';
		category = '';
		payee = '';
		reconciled = '';
		fromDate = '';
		toDate = '';
		minAmount = '';
		maxAmount = '';
		onApply({ ...emptyFilters });
	}
</script>

<form
	class="bg-white rounded-lg border border-gray-200 p-4"
	onsubmit={(e) => {
		e.preventDefault();
		apply();
	}}
>
	<div class="flex flex-wrap items-end gap-3">
		<!-- Account Selector -->
		<div>
			<label for="filter-account" class="block text-xs font-medium text-gray-600 mb-1"
				>Account</label
			>
			<select
				id="filter-account"
				bind:value={accountId}
				class="px-2 py-1.5 border border-gray-300 rounded text-sm"
			>
				<option value="">All Accounts</option>
				{#each accounts as acct}
					<option value={acct.id}>{acct.name}</option>
				{/each}
			</select>
		</div>

		<!-- Category -->
		<div>
			<label for="filter-category" class="block text-xs font-medium text-gray-600 mb-1"
				>Category</label
			>
			<input
				id="filter-category"
				type="text"
				list="category-suggestions"
				bind:value={category}
				placeholder="e.g. Food"
				class="px-2 py-1.5 border border-gray-300 rounded text-sm w-28"
			/>
			<datalist id="category-suggestions">
				<option value="Food"></option>
				<option value="Transport"></option>
				<option value="Housing"></option>
				<option value="Utilities"></option>
				<option value="Entertainment"></option>
				<option value="Healthcare"></option>
				<option value="Shopping"></option>
				<option value="Income"></option>
				<option value="Transfer"></option>
			</datalist>
		</div>

		<!-- Payee -->
		<div>
			<label for="filter-payee" class="block text-xs font-medium text-gray-600 mb-1">Payee</label>
			<input
				id="filter-payee"
				type="text"
				bind:value={payee}
				placeholder="e.g. Grocery Store"
				class="px-2 py-1.5 border border-gray-300 rounded text-sm w-36"
			/>
		</div>

		<!-- Reconciled -->
		<div>
			<label for="filter-reconciled" class="block text-xs font-medium text-gray-600 mb-1"
				>Reconciled</label
			>
			<select
				id="filter-reconciled"
				bind:value={reconciled}
				class="px-2 py-1.5 border border-gray-300 rounded text-sm"
			>
				<option value="">All</option>
				<option value="true">Yes</option>
				<option value="false">No</option>
			</select>
		</div>

		<!-- Date From -->
		<div>
			<label for="filter-from" class="block text-xs font-medium text-gray-600 mb-1">From</label>
			<input
				id="filter-from"
				type="date"
				bind:value={fromDate}
				class="px-2 py-1.5 border border-gray-300 rounded text-sm"
			/>
		</div>

		<!-- Date To -->
		<div>
			<label for="filter-to" class="block text-xs font-medium text-gray-600 mb-1">To</label>
			<input
				id="filter-to"
				type="date"
				bind:value={toDate}
				class="px-2 py-1.5 border border-gray-300 rounded text-sm"
			/>
		</div>

		<!-- Min Amount -->
		<div>
			<label for="filter-min" class="block text-xs font-medium text-gray-600 mb-1"
				>Min Amount</label
			>
			<input
				id="filter-min"
				type="text"
				inputmode="decimal"
				bind:value={minAmount}
				placeholder="0.00"
				class="px-2 py-1.5 border border-gray-300 rounded text-sm w-24"
			/>
		</div>

		<!-- Max Amount -->
		<div>
			<label for="filter-max" class="block text-xs font-medium text-gray-600 mb-1"
				>Max Amount</label
			>
			<input
				id="filter-max"
				type="text"
				inputmode="decimal"
				bind:value={maxAmount}
				placeholder="0.00"
				class="px-2 py-1.5 border border-gray-300 rounded text-sm w-24"
			/>
		</div>

		<!-- Action Buttons -->
		<div class="flex gap-2">
			<button
				type="submit"
				disabled={loading}
				class="px-3 py-1.5 bg-gray-600 text-white text-sm rounded hover:bg-gray-700 disabled:opacity-50"
			>
				Filter
			</button>
			{#if hasActiveFilters}
				<button
					type="button"
					onclick={clear}
					class="px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded hover:bg-gray-100"
				>
					Clear
				</button>
			{/if}
		</div>
	</div>
</form>
