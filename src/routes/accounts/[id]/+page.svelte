<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { getAuthState } from '$lib/auth.svelte';
	import { getAccount, deleteAccount, type Account } from '$lib/api/accounts';

	const auth = getAuthState();

	let account = $state<Account | null>(null);
	let loading = $state(true);
	let error = $state('');
	let deleting = $state(false);
	let deleteError = $state('');
	let showDeleteConfirm = $state(false);

	onMount(() => {
		if (!auth.isAuthenticated) {
			goto('/login');
			return;
		}
		loadAccount();
	});

	async function loadAccount() {
		const id = $page.params.id!;
		loading = true;
		error = '';
		try {
			const result = await getAccount(id);
			if (result.ok) {
				account = result.data;
			} else {
				const errData = result.data as unknown as { error?: string };
				error = errData?.error ?? `Failed to load account (${result.status})`;
			}
		} catch {
			error = 'Failed to connect to API';
		} finally {
			loading = false;
		}
	}

	function formatDate(dateStr: string): string {
		return new Date(dateStr).toLocaleString();
	}

	async function handleDelete() {
		if (!account) return;
		deleting = true;
		deleteError = '';
		try {
			const result = await deleteAccount(account.id);
			if (result.ok || result.status === 204) {
				goto('/accounts');
			} else {
				const errData = result.data as unknown as { error?: string; message?: string };
				deleteError = errData?.error ?? errData?.message ?? `Failed to delete account (${result.status})`;
				showDeleteConfirm = false;
			}
		} catch {
			deleteError = 'Failed to connect to API';
			showDeleteConfirm = false;
		} finally {
			deleting = false;
		}
	}
</script>

<svelte:head>
	<title>{account?.name ?? 'Account Details'}</title>
</svelte:head>

<div class="space-y-6">
	<div class="flex items-center gap-3">
		<a href="/accounts" class="text-blue-600 hover:text-blue-800 text-sm">&larr; Back to Accounts</a>
	</div>

	{#if loading}
		<p class="text-gray-500 text-sm">Loading account...</p>
	{:else if error}
		<div class="p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{error}</div>
	{:else if account}
		<div class="bg-white rounded-lg border border-gray-200 p-6">
			<div class="flex items-start justify-between mb-6">
				<div>
					<h1 class="text-2xl font-bold text-gray-900">{account.name}</h1>
					<p class="text-sm text-gray-500 mt-1 capitalize">{account.account_type} account</p>
				</div>
				<div class="text-right">
					<p class="text-2xl font-mono font-semibold text-gray-900">{account.balance}</p>
					<p class="text-sm text-gray-500">{account.currency}</p>
				</div>
			</div>

			<div class="border-t border-gray-200 pt-4">
				<dl class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 text-sm">
					<div>
						<dt class="font-medium text-gray-500">Account ID</dt>
						<dd class="mt-1 text-gray-900 font-mono text-xs break-all">{account.id}</dd>
					</div>

					<div>
						<dt class="font-medium text-gray-500">Status</dt>
						<dd class="mt-1">
							{#if account.is_active}
								<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">Active</span>
							{:else}
								<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">Inactive</span>
							{/if}
						</dd>
					</div>

					<div>
						<dt class="font-medium text-gray-500">Account Type</dt>
						<dd class="mt-1 text-gray-900 capitalize">{account.account_type}</dd>
					</div>

					<div>
						<dt class="font-medium text-gray-500">Currency</dt>
						<dd class="mt-1 text-gray-900">{account.currency}</dd>
					</div>

					<div>
						<dt class="font-medium text-gray-500">Display Order</dt>
						<dd class="mt-1 text-gray-900">{account.display_order}</dd>
					</div>

					<div>
						<dt class="font-medium text-gray-500">Version</dt>
						<dd class="mt-1 text-gray-900">{account.version}</dd>
					</div>

					<div>
						<dt class="font-medium text-gray-500">Encrypted</dt>
						<dd class="mt-1 text-gray-900">{account.is_encrypted ? 'Yes' : 'No'}</dd>
					</div>

					{#if account.owner_id}
						<div>
							<dt class="font-medium text-gray-500">Owner ID</dt>
							<dd class="mt-1 text-gray-900 font-mono text-xs break-all">{account.owner_id}</dd>
						</div>
					{/if}

					{#if account.organization_id}
						<div>
							<dt class="font-medium text-gray-500">Organization ID</dt>
							<dd class="mt-1 text-gray-900 font-mono text-xs break-all">{account.organization_id}</dd>
						</div>
					{/if}

					{#if account.chart_account_id}
						<div>
							<dt class="font-medium text-gray-500">Chart Account ID</dt>
							<dd class="mt-1 text-gray-900 font-mono text-xs break-all">{account.chart_account_id}</dd>
						</div>
					{/if}

					<div>
						<dt class="font-medium text-gray-500">Created</dt>
						<dd class="mt-1 text-gray-900">{formatDate(account.created_at)}</dd>
					</div>

					<div>
						<dt class="font-medium text-gray-500">Last Updated</dt>
						<dd class="mt-1 text-gray-900">{formatDate(account.updated_at)}</dd>
					</div>
				</dl>
			</div>

			{#if account.metadata && Object.keys(account.metadata).length > 0}
				<div class="border-t border-gray-200 pt-4 mt-4">
					<h3 class="text-sm font-medium text-gray-500 mb-2">Metadata</h3>
					<pre class="bg-gray-50 rounded p-3 text-xs text-gray-800 overflow-x-auto">{JSON.stringify(account.metadata, null, 2)}</pre>
				</div>
			{/if}

			<!-- Actions -->
			<div class="border-t border-gray-200 pt-4 mt-4 flex flex-wrap gap-3">
				<a
					href="/accounts/{account.id}/transactions"
					class="px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700"
				>
					View Transactions
				</a>
				<a
					href="/accounts/{account.id}/edit"
					class="px-3 py-1.5 text-sm text-gray-700 border border-gray-300 rounded hover:bg-gray-100"
				>
					Edit Account
				</a>
			</div>

			<!-- Delete Account -->
			<div class="border-t border-gray-200 pt-4 mt-4">
				{#if deleteError}
					<div class="mb-3 p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{deleteError}</div>
				{/if}

				{#if showDeleteConfirm}
					<div class="p-4 bg-red-50 border border-red-200 rounded-md">
						<p class="text-sm text-red-800 mb-3">
							Are you sure you want to delete <strong>{account.name}</strong>? This action cannot be undone.
						</p>
						<div class="flex gap-2">
							<button
								type="button"
								onclick={handleDelete}
								disabled={deleting}
								class="px-3 py-1.5 bg-red-600 text-white text-sm font-medium rounded hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
							>
								{deleting ? 'Deleting...' : 'Yes, Delete'}
							</button>
							<button
								type="button"
								onclick={() => showDeleteConfirm = false}
								disabled={deleting}
								class="px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded hover:bg-gray-100 disabled:opacity-50"
							>
								Cancel
							</button>
						</div>
					</div>
				{:else}
					<button
						type="button"
						onclick={() => showDeleteConfirm = true}
						class="px-3 py-1.5 text-sm text-red-600 border border-red-300 rounded hover:bg-red-50"
					>
						Delete Account
					</button>
				{/if}
			</div>
		</div>
	{/if}
</div>
