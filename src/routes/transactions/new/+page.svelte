<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { getAuthState } from '$lib/auth.svelte';
	import { listAccounts, type Account } from '$lib/api/accounts';
	import {
		createTransaction,
		TRANSACTION_TYPES,
		type TransactionType,
		type CreateTransactionInput,
		type LedgerEntryInput,
	} from '$lib/api/transactions';

	const auth = getAuthState();

	// Accounts for the dropdown
	let accounts = $state<Account[]>([]);
	let accountsLoading = $state(true);
	let accountsError = $state('');

	// Form state
	let transactionType = $state<TransactionType>('expense');
	let accountId = $state('');
	let amount = $state('');
	let memo = $state('');
	let payee = $state('');
	let category = $state('');
	let enteredDate = $state(new Date().toISOString().slice(0, 10));
	let clearedDate = $state('');
	let reconciled = $state(false);

	// Split transaction state
	let isSplit = $state(false);
	let splitChildren = $state<
		{
			amount: string;
			memo: string;
			category: string;
		}[]
	>([]);

	// Ledger entries state
	let hasLedgerEntries = $state(false);
	let ledgerEntries = $state<
		{
			account_id: string;
			entry_type: 'debit' | 'credit';
			amount: string;
			currency: string;
			description: string;
		}[]
	>([]);

	// Submission state
	let loading = $state(false);
	let error = $state('');
	let success = $state('');

	// Pre-select account from query param
	let preselectedAccountId = '';

	onMount(() => {
		if (!auth.isAuthenticated) {
			goto('/login');
			return;
		}
		preselectedAccountId = $page.url.searchParams.get('account_id') ?? '';
		loadAccounts();
	});

	async function loadAccounts() {
		accountsLoading = true;
		accountsError = '';
		try {
			const result = await listAccounts({ is_active: true, limit: 1000 });
			if (result.ok) {
				accounts = result.data.accounts ?? [];
				// Pre-select first account or from query param
				if (preselectedAccountId && accounts.some((a) => a.id === preselectedAccountId)) {
					accountId = preselectedAccountId;
				} else if (accounts.length > 0 && !accountId) {
					accountId = accounts[0].id;
				}
			} else {
				const errData = result.data as unknown as { error?: string };
				accountsError = errData?.error ?? 'Failed to load accounts';
			}
		} catch {
			accountsError = 'Failed to connect to API';
		} finally {
			accountsLoading = false;
		}
	}

	/** Get the selected account's currency (for ledger entry defaults). */
	function selectedAccountCurrency(): string {
		const acct = accounts.find((a) => a.id === accountId);
		return acct?.currency ?? 'USD';
	}

	function addSplitChild() {
		splitChildren = [...splitChildren, { amount: '', memo: '', category: '' }];
	}

	function removeSplitChild(index: number) {
		splitChildren = splitChildren.filter((_, i) => i !== index);
	}

	function addLedgerEntry() {
		ledgerEntries = [
			...ledgerEntries,
			{
				account_id: accountId,
				entry_type: 'debit',
				amount: '',
				currency: selectedAccountCurrency(),
				description: '',
			},
		];
	}

	function removeLedgerEntry(index: number) {
		ledgerEntries = ledgerEntries.filter((_, i) => i !== index);
	}

	/** Build inflow/outflow from type + amount. */
	function resolveAmounts(type: TransactionType, amt: string): { inflow: string; outflow: string } {
		const value = amt.trim() || '0';
		switch (type) {
			case 'income':
				return { inflow: value, outflow: '0' };
			case 'expense':
				return { inflow: '0', outflow: value };
			case 'transfer':
				// Transfer: outflow from this account (inflow handled on destination)
				return { inflow: '0', outflow: value };
		}
	}

	async function handleSubmit(e: Event) {
		e.preventDefault();
		error = '';
		success = '';

		if (!accountId) {
			error = 'Please select an account';
			return;
		}

		if (!isSplit && (!amount.trim() || parseFloat(amount) < 0)) {
			error = 'Please enter a valid non-negative amount';
			return;
		}

		loading = true;
		try {
			if (isSplit && splitChildren.length > 0) {
				// Create split parent first
				const parentInput: CreateTransactionInput = {
					account_id: accountId,
					inflow: '0',
					outflow: '0',
					is_split_parent: true,
					memo: memo.trim() || undefined,
					payee: payee.trim() || undefined,
					entered_date: enteredDate ? new Date(enteredDate).toISOString() : undefined,
				};

				const parentResult = await createTransaction(parentInput);
				if (!parentResult.ok) {
					const errData = parentResult.data as unknown as { error?: string; message?: string };
					error =
						errData?.error ??
						errData?.message ??
						`Failed to create split parent (${parentResult.status})`;
					loading = false;
					return;
				}

				const parentId = parentResult.data.id;

				// Create each child split
				for (const child of splitChildren) {
					const { inflow, outflow } = resolveAmounts(transactionType, child.amount);
					const childInput: CreateTransactionInput = {
						account_id: accountId,
						inflow,
						outflow,
						split_parent_id: parentId,
						memo: child.memo.trim() || undefined,
						category: child.category.trim() || undefined,
						payee: payee.trim() || undefined,
						entered_date: enteredDate ? new Date(enteredDate).toISOString() : undefined,
					};

					// Add ledger entries to children if present
					if (hasLedgerEntries && ledgerEntries.length > 0) {
						childInput.ledger_entries = ledgerEntries
							.filter((le) => le.amount.trim() && le.account_id)
							.map((le) => ({
								account_id: le.account_id,
								entry_type: le.entry_type,
								amount: le.amount.trim(),
								currency: le.currency,
								description: le.description.trim() || undefined,
							}));
					}

					const childResult = await createTransaction(childInput);
					if (!childResult.ok) {
						const errData = childResult.data as unknown as { error?: string; message?: string };
						error =
							errData?.error ??
							errData?.message ??
							`Failed to create split child (${childResult.status})`;
						loading = false;
						return;
					}
				}

				success = `Split transaction created with ${splitChildren.length} child(ren)`;
			} else {
				// Simple (non-split) transaction
				const { inflow, outflow } = resolveAmounts(transactionType, amount);
				const input: CreateTransactionInput = {
					account_id: accountId,
					inflow,
					outflow,
					memo: memo.trim() || undefined,
					payee: payee.trim() || undefined,
					category: category.trim() || undefined,
					entered_date: enteredDate ? new Date(enteredDate).toISOString() : undefined,
					cleared_date: clearedDate ? new Date(clearedDate).toISOString() : undefined,
					reconciled: reconciled || undefined,
				};

				if (hasLedgerEntries && ledgerEntries.length > 0) {
					input.ledger_entries = ledgerEntries
						.filter((le) => le.amount.trim() && le.account_id)
						.map((le) => ({
							account_id: le.account_id,
							entry_type: le.entry_type,
							amount: le.amount.trim(),
							currency: le.currency,
							description: le.description.trim() || undefined,
						}));
				}

				const result = await createTransaction(input);
				if (result.ok) {
					success = `Transaction created successfully (${transactionType}: ${transactionType === 'income' ? 'inflow' : 'outflow'} ${amount})`;
					// Reset form
					amount = '';
					memo = '';
					payee = '';
					category = '';
					reconciled = false;
					clearedDate = '';
					hasLedgerEntries = false;
					ledgerEntries = [];
				} else {
					const errData = result.data as unknown as { error?: string; message?: string };
					error =
						errData?.error ??
						errData?.message ??
						`Failed to create transaction (${result.status})`;
				}
			}
		} catch {
			error = 'Failed to connect to API';
		} finally {
			loading = false;
		}
	}

	/** Label for the amount field based on transaction type. */
	function amountLabel(type: TransactionType): string {
		switch (type) {
			case 'income':
				return 'Inflow Amount';
			case 'expense':
				return 'Outflow Amount';
			case 'transfer':
				return 'Transfer Amount (outflow)';
		}
	}

	/** Hint text below the amount field. */
	function amountHint(type: TransactionType): string {
		switch (type) {
			case 'income':
				return 'Money received — sets inflow, outflow auto-zeroed';
			case 'expense':
				return 'Money spent — sets outflow, inflow auto-zeroed';
			case 'transfer':
				return 'Outflow from this account — create a matching inflow on the destination account';
		}
	}
</script>

<svelte:head>
	<title>New Transaction</title>
</svelte:head>

<div class="space-y-6">
	<div class="flex items-center gap-4">
		<a href="/transactions" class="text-sm text-blue-600 hover:text-blue-800">&larr; Transactions</a>
		<h1 class="text-2xl font-bold text-gray-900">New Transaction</h1>
	</div>

	{#if accountsLoading}
		<p class="text-gray-500 text-sm">Loading accounts...</p>
	{:else if accountsError}
		<div class="p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{accountsError}</div>
	{:else if accounts.length === 0}
		<div class="p-4 bg-yellow-50 border border-yellow-200 text-yellow-800 rounded text-sm">
			No active accounts found. <a href="/accounts" class="underline">Create an account</a> first.
		</div>
	{:else}
		<div class="bg-white rounded-lg border border-gray-200 p-6">
			{#if error}
				<div class="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{error}</div>
			{/if}
			{#if success}
				<div class="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 rounded text-sm">{success}</div>
			{/if}

			<form onsubmit={handleSubmit} class="space-y-5">
				<!-- Transaction Type Selector -->
				<fieldset>
					<legend class="block text-sm font-medium text-gray-700 mb-2">Transaction Type</legend>
					<div class="flex gap-2">
						{#each TRANSACTION_TYPES as type}
							<button
								type="button"
								onclick={() => (transactionType = type)}
								class="px-4 py-2 text-sm font-medium rounded-md border transition-colors
									{transactionType === type
									? type === 'income'
										? 'bg-green-600 text-white border-green-600'
										: type === 'expense'
											? 'bg-red-600 text-white border-red-600'
											: 'bg-blue-600 text-white border-blue-600'
									: 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}"
							>
								{type.charAt(0).toUpperCase() + type.slice(1)}
							</button>
						{/each}
					</div>
				</fieldset>

				<!-- Account Selection -->
				<div>
					<label for="account" class="block text-sm font-medium text-gray-700 mb-1">Account</label>
					<select
						id="account"
						bind:value={accountId}
						class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
					>
						{#each accounts as acct}
							<option value={acct.id}>
								{acct.name} ({acct.account_type} — {acct.currency}, balance: {acct.balance})
							</option>
						{/each}
					</select>
				</div>

				<!-- Split toggle -->
				<div class="flex items-center gap-2">
					<input
						id="is-split"
						type="checkbox"
						bind:checked={isSplit}
						class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
					/>
					<label for="is-split" class="text-sm text-gray-700">Split transaction (multiple categories/amounts)</label>
				</div>

				{#if !isSplit}
					<!-- Simple Amount Field — context-dependent -->
					<div>
						<label for="amount" class="block text-sm font-medium text-gray-700 mb-1">
							{amountLabel(transactionType)}
						</label>
						<div class="relative">
							<span class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
								{selectedAccountCurrency()}
							</span>
							<input
								id="amount"
								type="text"
								inputmode="decimal"
								bind:value={amount}
								placeholder="0.00"
								class="w-full pl-14 pr-3 py-2 border rounded-md text-sm font-mono focus:ring-2 focus:border-blue-500
									{transactionType === 'income'
									? 'border-green-300 focus:ring-green-500'
									: transactionType === 'expense'
										? 'border-red-300 focus:ring-red-500'
										: 'border-blue-300 focus:ring-blue-500'}"
								required
							/>
						</div>
						<p class="mt-1 text-xs text-gray-500">{amountHint(transactionType)}</p>
					</div>

					<!-- Category (for simple transactions) -->
					<div>
						<label for="category" class="block text-sm font-medium text-gray-700 mb-1">Category</label>
						<input
							id="category"
							type="text"
							bind:value={category}
							placeholder="e.g. Food:Groceries"
							class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
						/>
					</div>
				{:else}
					<!-- Split children -->
					<div class="space-y-3">
						<div class="flex items-center justify-between">
							<span class="text-sm font-medium text-gray-700">Split Items</span>
							<button
								type="button"
								onclick={addSplitChild}
								class="px-3 py-1 text-xs bg-gray-100 text-gray-700 border border-gray-300 rounded hover:bg-gray-200"
							>
								+ Add Split
							</button>
						</div>
						{#if splitChildren.length === 0}
							<p class="text-sm text-gray-500">No splits added. Click "Add Split" to create child transactions.</p>
						{/if}
						{#each splitChildren as child, i}
							<div class="p-3 bg-gray-50 rounded border border-gray-200 space-y-2">
								<div class="flex items-center justify-between">
									<span class="text-xs font-medium text-gray-600">Split #{i + 1}</span>
									<button
										type="button"
										onclick={() => removeSplitChild(i)}
										class="text-xs text-red-600 hover:text-red-800"
									>
										Remove
									</button>
								</div>
								<div class="grid grid-cols-3 gap-2">
									<div>
										<label for="split-amount-{i}" class="block text-xs text-gray-600 mb-0.5">{amountLabel(transactionType)}</label>
										<input
											id="split-amount-{i}"
											type="text"
											inputmode="decimal"
											bind:value={child.amount}
											placeholder="0.00"
											class="w-full px-2 py-1.5 border border-gray-300 rounded text-sm font-mono focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
											required
										/>
									</div>
									<div>
										<label for="split-category-{i}" class="block text-xs text-gray-600 mb-0.5">Category</label>
										<input
											id="split-category-{i}"
											type="text"
											bind:value={child.category}
											placeholder="Food:Groceries"
											class="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
										/>
									</div>
									<div>
										<label for="split-memo-{i}" class="block text-xs text-gray-600 mb-0.5">Memo</label>
										<input
											id="split-memo-{i}"
											type="text"
											bind:value={child.memo}
											placeholder="Description"
											class="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
										/>
									</div>
								</div>
							</div>
						{/each}
					</div>
				{/if}

				<!-- Common fields -->
				<div class="grid grid-cols-2 gap-4">
					<div>
						<label for="payee" class="block text-sm font-medium text-gray-700 mb-1">Payee</label>
						<input
							id="payee"
							type="text"
							bind:value={payee}
							placeholder="e.g. Whole Foods"
							class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
						/>
					</div>
					<div>
						<label for="memo" class="block text-sm font-medium text-gray-700 mb-1">Memo</label>
						<input
							id="memo"
							type="text"
							bind:value={memo}
							placeholder="Notes about this transaction"
							class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
						/>
					</div>
				</div>

				<div class="grid grid-cols-2 gap-4">
					<div>
						<label for="entered-date" class="block text-sm font-medium text-gray-700 mb-1">Date</label>
						<input
							id="entered-date"
							type="date"
							bind:value={enteredDate}
							class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
						/>
					</div>
					<div>
						<label for="cleared-date" class="block text-sm font-medium text-gray-700 mb-1">Cleared Date</label>
						<input
							id="cleared-date"
							type="date"
							bind:value={clearedDate}
							class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
						/>
					</div>
				</div>

				<div class="flex items-center gap-2">
					<input
						id="reconciled"
						type="checkbox"
						bind:checked={reconciled}
						class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
					/>
					<label for="reconciled" class="text-sm text-gray-700">Reconciled</label>
				</div>

				<!-- Ledger Entries (optional advanced section) -->
				<div class="border-t border-gray-200 pt-4">
					<div class="flex items-center gap-2 mb-3">
						<input
							id="has-ledger"
							type="checkbox"
							bind:checked={hasLedgerEntries}
							class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
						/>
						<label for="has-ledger" class="text-sm font-medium text-gray-700">Add ledger entries (double-entry)</label>
					</div>

					{#if hasLedgerEntries}
						<div class="space-y-3">
							<button
								type="button"
								onclick={addLedgerEntry}
								class="px-3 py-1 text-xs bg-gray-100 text-gray-700 border border-gray-300 rounded hover:bg-gray-200"
							>
								+ Add Entry
							</button>

							{#each ledgerEntries as entry, i}
								<div class="p-3 bg-blue-50 rounded border border-blue-200 space-y-2">
									<div class="flex items-center justify-between">
										<span class="text-xs font-medium text-blue-700">Ledger Entry #{i + 1}</span>
										<button
											type="button"
											onclick={() => removeLedgerEntry(i)}
											class="text-xs text-red-600 hover:text-red-800"
										>
											Remove
										</button>
									</div>
									<div class="grid grid-cols-2 gap-2">
										<div>
											<label for="le-account-{i}" class="block text-xs text-gray-600 mb-0.5">Account</label>
											<select
												id="le-account-{i}"
												bind:value={entry.account_id}
												class="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
											>
												{#each accounts as acct}
													<option value={acct.id}>{acct.name} ({acct.currency})</option>
												{/each}
											</select>
										</div>
										<div>
											<label for="le-type-{i}" class="block text-xs text-gray-600 mb-0.5">Type</label>
											<select
												id="le-type-{i}"
												bind:value={entry.entry_type}
												class="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
											>
												<option value="debit">Debit</option>
												<option value="credit">Credit</option>
											</select>
										</div>
									</div>
									<div class="grid grid-cols-3 gap-2">
										<div>
											<label for="le-amount-{i}" class="block text-xs text-gray-600 mb-0.5">Amount</label>
											<input
												id="le-amount-{i}"
												type="text"
												inputmode="decimal"
												bind:value={entry.amount}
												placeholder="0.00"
												class="w-full px-2 py-1.5 border border-gray-300 rounded text-sm font-mono focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
											/>
										</div>
										<div>
											<label for="le-currency-{i}" class="block text-xs text-gray-600 mb-0.5">Currency</label>
											<input
												id="le-currency-{i}"
												type="text"
												bind:value={entry.currency}
												placeholder="USD"
												class="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
											/>
										</div>
										<div>
											<label for="le-desc-{i}" class="block text-xs text-gray-600 mb-0.5">Description</label>
											<input
												id="le-desc-{i}"
												type="text"
												bind:value={entry.description}
												placeholder="Entry description"
												class="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
											/>
										</div>
									</div>
								</div>
							{/each}

							{#if ledgerEntries.length === 0}
								<p class="text-sm text-gray-500">No ledger entries. Click "Add Entry" to create double-entry bookkeeping entries.</p>
							{/if}
						</div>
					{/if}
				</div>

				<!-- Submit -->
				<div class="flex gap-3 pt-2">
					<button
						type="submit"
						disabled={loading}
						class="px-4 py-2 text-sm font-medium rounded-md text-white disabled:opacity-50 disabled:cursor-not-allowed
							{transactionType === 'income'
							? 'bg-green-600 hover:bg-green-700'
							: transactionType === 'expense'
								? 'bg-red-600 hover:bg-red-700'
								: 'bg-blue-600 hover:bg-blue-700'}"
					>
						{loading
							? 'Creating...'
							: isSplit
								? `Create Split ${transactionType.charAt(0).toUpperCase() + transactionType.slice(1)}`
								: `Create ${transactionType.charAt(0).toUpperCase() + transactionType.slice(1)}`}
					</button>
					<a
						href="/transactions"
						class="px-4 py-2 text-sm font-medium rounded-md text-gray-700 border border-gray-300 hover:bg-gray-50"
					>
						Cancel
					</a>
				</div>
			</form>
		</div>
	{/if}
</div>
