<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { getAuthState } from '$lib/auth.svelte';
	import {
		getAccount,
		updateAccount,
		ACCOUNT_TYPES,
		COMMON_CURRENCIES,
		type Account,
	} from '$lib/api/accounts';

	const auth = getAuthState();

	let account = $state<Account | null>(null);
	let loadError = $state('');
	let loadLoading = $state(true);

	// Edit form state
	let editName = $state('');
	let editType = $state('checking');
	let editCurrency = $state('USD');
	let editDisplayOrder = $state(0);
	let editIsActive = $state(true);
	let editVersion = $state(0);

	let saving = $state(false);
	let error = $state('');
	let success = $state('');
	let conflictMessage = $state('');

	let accountId = $state('');

	onMount(() => {
		if (!auth.isAuthenticated) {
			goto('/login');
			return;
		}
		accountId = $page.params.id!;
		loadAccountData();
	});

	async function loadAccountData() {
		loadLoading = true;
		loadError = '';
		conflictMessage = '';
		try {
			const result = await getAccount(accountId);
			if (result.ok) {
				account = result.data;
				populateForm(result.data);
			} else {
				const errData = result.data as unknown as { error?: string };
				loadError = errData?.error ?? `Failed to load account (${result.status})`;
			}
		} catch {
			loadError = 'Failed to connect to API';
		} finally {
			loadLoading = false;
		}
	}

	function populateForm(acc: Account) {
		editName = acc.name;
		editType = acc.account_type;
		editCurrency = acc.currency;
		editDisplayOrder = acc.display_order;
		editIsActive = acc.is_active;
		editVersion = acc.version;
	}

	async function handleSubmit(e: Event) {
		e.preventDefault();
		error = '';
		success = '';
		conflictMessage = '';

		if (!editName.trim()) {
			error = 'Account name is required';
			return;
		}

		saving = true;
		try {
			const result = await updateAccount(accountId, {
				name: editName.trim(),
				account_type: editType,
				currency: editCurrency,
				display_order: editDisplayOrder,
				is_active: editIsActive,
				version: editVersion,
			});

			if (result.ok) {
				account = result.data;
				editVersion = result.data.version;
				success = 'Account updated successfully';
			} else if (result.status === 409) {
				// Optimistic locking conflict
				const errData = result.data as unknown as { error?: string; message?: string };
				conflictMessage =
					errData?.error ??
					errData?.message ??
					'This account was modified by another session. Please reload and try again.';
			} else {
				const errData = result.data as unknown as { error?: string; message?: string };
				error = errData?.error ?? errData?.message ?? `Failed to update account (${result.status})`;
			}
		} catch {
			error = 'Failed to connect to API';
		} finally {
			saving = false;
		}
	}

	async function handleReloadAndRetry() {
		conflictMessage = '';
		error = '';
		success = '';
		await loadAccountData();
	}
</script>

<svelte:head>
	<title>Edit Account</title>
</svelte:head>

<div class="space-y-6">
	<div class="flex items-center gap-3">
		<a href="/accounts/{accountId}" class="text-blue-600 hover:text-blue-800 text-sm">&larr; Back</a>
		<h1 class="text-2xl font-bold text-gray-900">Edit Account</h1>
	</div>

	{#if loadLoading}
		<p class="text-gray-500 text-sm">Loading account...</p>
	{:else if loadError}
		<div class="p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{loadError}</div>
	{:else if account}
		<div class="bg-white rounded-lg border border-gray-200 p-6">
			{#if error}
				<div class="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{error}</div>
			{/if}
			{#if success}
				<div class="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 rounded text-sm">{success}</div>
			{/if}
			{#if conflictMessage}
				<div class="mb-4 p-4 bg-yellow-50 border border-yellow-300 text-yellow-800 rounded">
					<p class="font-semibold text-sm mb-1">Version Conflict (409)</p>
					<p class="text-sm mb-3">{conflictMessage}</p>
					<button
						type="button"
						onclick={handleReloadAndRetry}
						class="px-3 py-1.5 bg-yellow-600 text-white text-sm rounded hover:bg-yellow-700"
					>
						Reload Latest Version
					</button>
				</div>
			{/if}

			<form onsubmit={handleSubmit} class="space-y-4">
				<div>
					<label for="edit-name" class="block text-sm font-medium text-gray-700 mb-1">Account Name</label>
					<input
						id="edit-name"
						type="text"
						bind:value={editName}
						class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
						required
					/>
				</div>

				<div class="grid grid-cols-2 gap-4">
					<div>
						<label for="edit-type" class="block text-sm font-medium text-gray-700 mb-1">Account Type</label>
						<select
							id="edit-type"
							bind:value={editType}
							class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
						>
							{#each ACCOUNT_TYPES as type}
								<option value={type}>{type.charAt(0).toUpperCase() + type.slice(1)}</option>
							{/each}
						</select>
					</div>

					<div>
						<label for="edit-currency" class="block text-sm font-medium text-gray-700 mb-1">Currency</label>
						<select
							id="edit-currency"
							bind:value={editCurrency}
							class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
						>
							{#each COMMON_CURRENCIES as cur}
								<option value={cur}>{cur}</option>
							{/each}
						</select>
					</div>
				</div>

				<div class="grid grid-cols-2 gap-4">
					<div>
						<label for="edit-order" class="block text-sm font-medium text-gray-700 mb-1">Display Order</label>
						<input
							id="edit-order"
							type="number"
							bind:value={editDisplayOrder}
							class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
						/>
					</div>

					<div class="flex items-center pt-6">
						<label class="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
							<input type="checkbox" bind:checked={editIsActive} class="rounded border-gray-300" />
							Active
						</label>
					</div>
				</div>

				<div class="text-xs text-gray-400">
					Version: {editVersion} &middot; ID: {account.id}
				</div>

				<div class="flex gap-3">
					<button
						type="submit"
						disabled={saving}
						class="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
					>
						{saving ? 'Saving...' : 'Save Changes'}
					</button>
					<a
						href="/accounts/{accountId}"
						class="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50"
					>
						Cancel
					</a>
				</div>
			</form>
		</div>
	{/if}
</div>
