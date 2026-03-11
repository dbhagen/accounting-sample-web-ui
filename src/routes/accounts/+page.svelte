<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { getAuthState } from '$lib/auth.svelte';
	import {
		createAccount,
		listAccounts,
		ACCOUNT_TYPES,
		COMMON_CURRENCIES,
		type Account,
		type CreateAccountInput,
	} from '$lib/api/accounts';

	const auth = getAuthState();

	// Form state
	let name = $state('');
	let accountType = $state('checking');
	let currency = $state('USD');
	let loading = $state(false);
	let error = $state('');
	let success = $state('');

	// Filter state
	let filterType = $state('');
	let filterCurrency = $state('');
	let filterActive = $state('');

	// Account list state
	let accounts = $state<Account[]>([]);
	let totalAccounts = $state(0);
	let listLoading = $state(false);
	let listError = $state('');

	onMount(() => {
		if (!auth.isAuthenticated) {
			goto('/login');
			return;
		}
		loadAccounts();
	});

	async function loadAccounts() {
		listLoading = true;
		listError = '';
		try {
			const params: {
				account_type?: string;
				currency?: string;
				is_active?: boolean;
			} = {};
			if (filterType) params.account_type = filterType;
			if (filterCurrency) params.currency = filterCurrency;
			if (filterActive === 'true') params.is_active = true;
			else if (filterActive === 'false') params.is_active = false;

			const result = await listAccounts(params);
			if (result.ok) {
				accounts = result.data.accounts ?? [];
				totalAccounts = result.data.total ?? accounts.length;
			} else {
				const errData = result.data as unknown as { error?: string };
				listError = errData?.error ?? `Failed to load accounts (${result.status})`;
			}
		} catch (e) {
			listError = 'Failed to connect to API';
		} finally {
			listLoading = false;
		}
	}

	function applyFilters() {
		loadAccounts();
	}

	function clearFilters() {
		filterType = '';
		filterCurrency = '';
		filterActive = '';
		loadAccounts();
	}

	async function handleSubmit(e: Event) {
		e.preventDefault();
		error = '';
		success = '';

		if (!name.trim()) {
			error = 'Account name is required';
			return;
		}

		loading = true;
		try {
			const input: CreateAccountInput = {
				name: name.trim(),
				account_type: accountType,
				currency,
			};
			const result = await createAccount(input);
			if (result.ok) {
				success = `Account "${result.data.name}" created successfully`;
				name = '';
				accountType = 'checking';
				currency = 'USD';
				await loadAccounts();
			} else {
				const errData = result.data as unknown as { error?: string; message?: string };
				error = errData?.error ?? errData?.message ?? `Failed to create account (${result.status})`;
			}
		} catch (e) {
			error = 'Failed to connect to API';
		} finally {
			loading = false;
		}
	}
</script>

<svelte:head>
	<title>Accounts</title>
</svelte:head>

<div class="space-y-6">
	<h1 class="text-2xl font-bold text-gray-900">Accounts</h1>

	<!-- Create Account Form -->
	<div class="bg-white rounded-lg border border-gray-200 p-6">
		<h2 class="text-lg font-semibold text-gray-900 mb-4">Create New Account</h2>

		{#if error}
			<div class="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{error}</div>
		{/if}
		{#if success}
			<div class="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 rounded text-sm">{success}</div>
		{/if}

		<form onsubmit={handleSubmit} class="space-y-4">
			<div>
				<label for="name" class="block text-sm font-medium text-gray-700 mb-1">Account Name</label>
				<input
					id="name"
					type="text"
					bind:value={name}
					placeholder="e.g. Main Checking"
					class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
					required
				/>
			</div>

			<div class="grid grid-cols-2 gap-4">
				<div>
					<label for="account-type" class="block text-sm font-medium text-gray-700 mb-1">Account Type</label>
					<select
						id="account-type"
						bind:value={accountType}
						class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
					>
						{#each ACCOUNT_TYPES as type}
							<option value={type}>{type.charAt(0).toUpperCase() + type.slice(1)}</option>
						{/each}
					</select>
				</div>

				<div>
					<label for="currency" class="block text-sm font-medium text-gray-700 mb-1">Currency</label>
					<select
						id="currency"
						bind:value={currency}
						class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
					>
						{#each COMMON_CURRENCIES as cur}
							<option value={cur}>{cur}</option>
						{/each}
					</select>
				</div>
			</div>

			<button
				type="submit"
				disabled={loading}
				class="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
			>
				{loading ? 'Creating...' : 'Create Account'}
			</button>
		</form>
	</div>

	<!-- Account List -->
	<div class="bg-white rounded-lg border border-gray-200 p-6">
		<div class="flex items-center justify-between mb-4">
			<h2 class="text-lg font-semibold text-gray-900">Your Accounts</h2>
			{#if totalAccounts > 0}
				<span class="text-sm text-gray-500">{accounts.length} of {totalAccounts} accounts</span>
			{/if}
		</div>

		<!-- Filters -->
		<div class="mb-4 p-3 bg-gray-50 rounded-md border border-gray-200">
			<div class="flex flex-wrap items-end gap-3">
				<div>
					<label for="filter-type" class="block text-xs font-medium text-gray-600 mb-1">Type</label>
					<select
						id="filter-type"
						bind:value={filterType}
						class="px-2 py-1.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
					>
						<option value="">All Types</option>
						{#each ACCOUNT_TYPES as type}
							<option value={type}>{type.charAt(0).toUpperCase() + type.slice(1)}</option>
						{/each}
					</select>
				</div>

				<div>
					<label for="filter-currency" class="block text-xs font-medium text-gray-600 mb-1">Currency</label>
					<select
						id="filter-currency"
						bind:value={filterCurrency}
						class="px-2 py-1.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
					>
						<option value="">All Currencies</option>
						{#each COMMON_CURRENCIES as cur}
							<option value={cur}>{cur}</option>
						{/each}
					</select>
				</div>

				<div>
					<label for="filter-active" class="block text-xs font-medium text-gray-600 mb-1">Status</label>
					<select
						id="filter-active"
						bind:value={filterActive}
						class="px-2 py-1.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
					>
						<option value="">All</option>
						<option value="true">Active</option>
						<option value="false">Inactive</option>
					</select>
				</div>

				<div class="flex gap-2">
					<button
						type="button"
						onclick={applyFilters}
						disabled={listLoading}
						class="px-3 py-1.5 bg-gray-600 text-white text-sm rounded hover:bg-gray-700 disabled:opacity-50"
					>
						Filter
					</button>
					{#if filterType || filterCurrency || filterActive}
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
		</div>

		{#if listLoading}
			<p class="text-gray-500 text-sm">Loading accounts...</p>
		{:else if listError}
			<div class="p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{listError}</div>
		{:else if accounts.length === 0}
			<p class="text-gray-500 text-sm">No accounts yet. Create one above.</p>
		{:else}
			<div class="overflow-x-auto">
				<table class="w-full text-sm">
					<thead>
						<tr class="border-b border-gray-200">
							<th class="text-left py-2 px-3 font-medium text-gray-700">Name</th>
							<th class="text-left py-2 px-3 font-medium text-gray-700">Type</th>
							<th class="text-left py-2 px-3 font-medium text-gray-700">Currency</th>
							<th class="text-right py-2 px-3 font-medium text-gray-700">Balance</th>
							<th class="text-center py-2 px-3 font-medium text-gray-700">Active</th>
							<th class="text-right py-2 px-3 font-medium text-gray-700">Actions</th>
						</tr>
					</thead>
					<tbody>
						{#each accounts as account}
							<tr class="border-b border-gray-100 hover:bg-gray-50">
								<td class="py-2 px-3">
									<a href="/accounts/{account.id}" class="text-blue-600 hover:text-blue-800 hover:underline">
										{account.name}
									</a>
								</td>
								<td class="py-2 px-3 text-gray-600 capitalize">{account.account_type}</td>
								<td class="py-2 px-3 text-gray-600">{account.currency}</td>
								<td class="py-2 px-3 text-right font-mono">{account.balance}</td>
								<td class="py-2 px-3 text-center">
									{#if account.is_active}
										<span class="text-green-600">Yes</span>
									{:else}
										<span class="text-red-600">No</span>
									{/if}
								</td>
								<td class="py-2 px-3 text-right">
									<a
										href="/accounts/{account.id}/edit"
										class="text-sm text-blue-600 hover:text-blue-800 hover:underline"
									>
										Edit
									</a>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</div>
</div>
