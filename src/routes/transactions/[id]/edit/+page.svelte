<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { getAuthState } from '$lib/auth.svelte';
	import { getTransaction, updateTransaction, type Transaction } from '$lib/api/transactions';
	import { listAccounts, type Account } from '$lib/api/accounts';

	const auth = getAuthState();

	let transaction = $state<Transaction | null>(null);
	let accounts = $state<Account[]>([]);
	let loadError = $state('');
	let loadLoading = $state(true);

	// Edit form state
	let editAccountId = $state('');
	let editInflow = $state('0.00');
	let editOutflow = $state('0.00');
	let editMemo = $state('');
	let editPayee = $state('');
	let editCategory = $state('');
	let editEnteredDate = $state('');
	let editClearedDate = $state('');
	let editReconciled = $state(false);
	let editVersion = $state(0);

	let saving = $state(false);
	let error = $state('');
	let success = $state('');
	let conflictMessage = $state('');

	let transactionId = $state('');

	onMount(() => {
		if (!auth.isAuthenticated) {
			goto('/login');
			return;
		}
		transactionId = $page.params.id!;
		loadData();
	});

	async function loadData() {
		loadLoading = true;
		loadError = '';
		conflictMessage = '';
		try {
			const [txResult, acctResult] = await Promise.all([
				getTransaction(transactionId),
				listAccounts({ limit: 100 }),
			]);

			if (txResult.ok) {
				transaction = txResult.data;
				populateForm(txResult.data);
			} else {
				const errData = txResult.data as unknown as { error?: string };
				loadError = errData?.error ?? `Failed to load transaction (${txResult.status})`;
			}

			if (acctResult.ok) {
				accounts = acctResult.data.accounts;
			}
		} catch {
			loadError = 'Failed to connect to API';
		} finally {
			loadLoading = false;
		}
	}

	function populateForm(tx: Transaction) {
		editAccountId = tx.account_id;
		editInflow = tx.inflow;
		editOutflow = tx.outflow;
		editMemo = tx.memo ?? '';
		editPayee = tx.payee ?? '';
		editCategory = tx.category ?? '';
		editEnteredDate = tx.entered_date;
		editClearedDate = tx.cleared_date ?? '';
		editReconciled = tx.reconciled;
		editVersion = tx.version;
	}

	async function handleSubmit(e: Event) {
		e.preventDefault();
		error = '';
		success = '';
		conflictMessage = '';

		if (!editAccountId) {
			error = 'Account is required';
			return;
		}

		saving = true;
		try {
			const payload: Record<string, unknown> = {
				account_id: editAccountId,
				inflow: editInflow,
				outflow: editOutflow,
				reconciled: editReconciled,
				version: editVersion,
			};

			if (editMemo.trim()) payload.memo = editMemo.trim();
			if (editPayee.trim()) payload.payee = editPayee.trim();
			if (editCategory.trim()) payload.category = editCategory.trim();
			if (editEnteredDate) payload.entered_date = editEnteredDate;
			if (editClearedDate) payload.cleared_date = editClearedDate;

			const result = await updateTransaction(
				transactionId,
				payload as Parameters<typeof updateTransaction>[1],
			);

			if (result.ok) {
				transaction = result.data;
				editVersion = result.data.version;
				success = 'Transaction updated successfully';
			} else if (result.status === 409) {
				// Optimistic locking conflict
				const errData = result.data as unknown as { error?: string; message?: string };
				conflictMessage =
					errData?.error ??
					errData?.message ??
					'This transaction was modified by another session. Please reload and try again.';
			} else {
				const errData = result.data as unknown as { error?: string; message?: string };
				error =
					errData?.error ??
					errData?.message ??
					`Failed to update transaction (${result.status})`;
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
		await loadData();
	}

	function getAccountName(id: string): string {
		const acct = accounts.find((a) => a.id === id);
		return acct ? acct.name : id.slice(0, 8) + '...';
	}
</script>

<svelte:head>
	<title>Edit Transaction</title>
</svelte:head>

<div class="space-y-6">
	<div class="flex items-center gap-3">
		<a
			href="/transactions/{transactionId}"
			class="text-blue-600 hover:text-blue-800 text-sm">&larr; Back</a
		>
		<h1 class="text-2xl font-bold text-gray-900">Edit Transaction</h1>
	</div>

	{#if loadLoading}
		<p class="text-gray-500 text-sm">Loading transaction...</p>
	{:else if loadError}
		<div class="p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">
			{loadError}
		</div>
	{:else if transaction}
		<div class="bg-white rounded-lg border border-gray-200 p-6">
			{#if error}
				<div class="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">
					{error}
				</div>
			{/if}
			{#if success}
				<div class="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 rounded text-sm">
					{success}
				</div>
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
				<!-- Account -->
				<div>
					<label for="edit-account" class="block text-sm font-medium text-gray-700 mb-1"
						>Account</label
					>
					<select
						id="edit-account"
						bind:value={editAccountId}
						class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
						required
					>
						{#each accounts as acct}
							<option value={acct.id}>{acct.name} ({acct.currency})</option>
						{/each}
						{#if !accounts.find((a) => a.id === editAccountId)}
							<option value={editAccountId}>{editAccountId}</option>
						{/if}
					</select>
				</div>

				<!-- Amounts -->
				<div class="grid grid-cols-2 gap-4">
					<div>
						<label for="edit-inflow" class="block text-sm font-medium text-gray-700 mb-1"
							>Inflow</label
						>
						<input
							id="edit-inflow"
							type="text"
							bind:value={editInflow}
							placeholder="0.00"
							class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-mono focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
						/>
					</div>
					<div>
						<label for="edit-outflow" class="block text-sm font-medium text-gray-700 mb-1"
							>Outflow</label
						>
						<input
							id="edit-outflow"
							type="text"
							bind:value={editOutflow}
							placeholder="0.00"
							class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-mono focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
						/>
					</div>
				</div>

				<!-- Payee & Category -->
				<div class="grid grid-cols-2 gap-4">
					<div>
						<label for="edit-payee" class="block text-sm font-medium text-gray-700 mb-1"
							>Payee</label
						>
						<input
							id="edit-payee"
							type="text"
							bind:value={editPayee}
							class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
						/>
					</div>
					<div>
						<label for="edit-category" class="block text-sm font-medium text-gray-700 mb-1"
							>Category</label
						>
						<input
							id="edit-category"
							type="text"
							bind:value={editCategory}
							class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
						/>
					</div>
				</div>

				<!-- Memo -->
				<div>
					<label for="edit-memo" class="block text-sm font-medium text-gray-700 mb-1">Memo</label>
					<textarea
						id="edit-memo"
						bind:value={editMemo}
						rows="2"
						class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
					></textarea>
				</div>

				<!-- Dates -->
				<div class="grid grid-cols-2 gap-4">
					<div>
						<label for="edit-entered-date" class="block text-sm font-medium text-gray-700 mb-1"
							>Entered Date</label
						>
						<input
							id="edit-entered-date"
							type="date"
							bind:value={editEnteredDate}
							class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
						/>
					</div>
					<div>
						<label for="edit-cleared-date" class="block text-sm font-medium text-gray-700 mb-1"
							>Cleared Date</label
						>
						<input
							id="edit-cleared-date"
							type="date"
							bind:value={editClearedDate}
							class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
						/>
					</div>
				</div>

				<!-- Reconciled -->
				<div class="flex items-center">
					<label class="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
						<input type="checkbox" bind:checked={editReconciled} class="rounded border-gray-300" />
						Reconciled
					</label>
				</div>

				<div class="text-xs text-gray-400">
					Version: {editVersion} &middot; ID: {transaction.id}
					{#if transaction.is_split_parent}
						&middot; <span class="text-purple-500 font-medium">Split Parent</span>
					{/if}
					{#if transaction.split_parent_id}
						&middot; <span class="text-purple-500 font-medium">Split Child</span>
					{/if}
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
						href="/transactions/{transactionId}"
						class="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50"
					>
						Cancel
					</a>
				</div>
			</form>
		</div>
	{/if}
</div>
