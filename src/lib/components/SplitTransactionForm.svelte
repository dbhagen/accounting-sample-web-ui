<script lang="ts">
	import type { Account } from '$lib/api/accounts';
	import type {
		TransactionType,
		CreateTransactionInput,
		LedgerEntryInput,
	} from '$lib/api/transactions';
	import { createTransaction, TRANSACTION_TYPES } from '$lib/api/transactions';

	interface SplitChild {
		amount: string;
		accountId: string;
		memo: string;
		category: string;
	}

	interface SplitLedgerEntry {
		account_id: string;
		entry_type: 'debit' | 'credit';
		amount: string;
		currency: string;
		description: string;
	}

	// Props
	let {
		accounts,
		onSuccess,
		onError,
	}: {
		accounts: Account[];
		onSuccess?: (message: string) => void;
		onError?: (message: string) => void;
	} = $props();

	// Parent transaction fields
	let transactionType = $state<TransactionType>('expense');
	let parentAccountId = $state('');
	let parentMemo = $state('');
	let parentPayee = $state('');
	let enteredDate = $state(new Date().toISOString().slice(0, 10));

	// Split children
	let splitChildren = $state<SplitChild[]>([
		{ amount: '', accountId: '', memo: '', category: '' },
		{ amount: '', accountId: '', memo: '', category: '' },
	]);

	// Ledger entries (optional, per-child)
	let hasLedgerEntries = $state(false);
	let ledgerEntries = $state<SplitLedgerEntry[]>([]);

	// Submission state
	let submitting = $state(false);

	// Initialize parent account when accounts load
	$effect(() => {
		if (accounts.length > 0 && !parentAccountId) {
			parentAccountId = accounts[0].id;
		}
	});

	// Initialize split child account IDs when accounts change
	$effect(() => {
		if (accounts.length > 0) {
			for (const child of splitChildren) {
				if (!child.accountId) {
					child.accountId = parentAccountId || accounts[0].id;
				}
			}
		}
	});

	/** Get currency for a given account ID */
	function accountCurrency(acctId: string): string {
		return accounts.find((a) => a.id === acctId)?.currency ?? 'USD';
	}

	/** Compute the split total from all children */
	let splitTotal = $derived(
		splitChildren.reduce((sum, child) => {
			const val = parseFloat(child.amount);
			return sum + (isNaN(val) ? 0 : val);
		}, 0),
	);

	/** Format a number as a decimal string */
	function formatDecimal(n: number): string {
		return n.toFixed(2);
	}

	// --- Child row management ---

	function addSplitChild() {
		splitChildren = [
			...splitChildren,
			{ amount: '', accountId: parentAccountId || '', memo: '', category: '' },
		];
	}

	function removeSplitChild(index: number) {
		if (splitChildren.length <= 1) return; // keep at least one
		splitChildren = splitChildren.filter((_, i) => i !== index);
	}

	// --- Ledger entry management ---

	function addLedgerEntry() {
		ledgerEntries = [
			...ledgerEntries,
			{
				account_id: parentAccountId,
				entry_type: 'debit',
				amount: '',
				currency: accountCurrency(parentAccountId),
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
				return { inflow: '0', outflow: value };
		}
	}

	/** Label for the amount column based on transaction type */
	function amountLabel(type: TransactionType): string {
		switch (type) {
			case 'income':
				return 'Inflow';
			case 'expense':
				return 'Outflow';
			case 'transfer':
				return 'Transfer Amount';
		}
	}

	// --- Validation ---

	function validate(): string | null {
		if (!parentAccountId) return 'Please select a parent account';
		if (splitChildren.length === 0) return 'Add at least one split entry';

		for (let i = 0; i < splitChildren.length; i++) {
			const child = splitChildren[i];
			const amt = parseFloat(child.amount);
			if (!child.amount.trim() || isNaN(amt) || amt < 0) {
				return `Split #${i + 1}: enter a valid non-negative amount`;
			}
			if (!child.accountId) {
				return `Split #${i + 1}: select an account`;
			}
		}

		return null;
	}

	// --- Submission ---

	async function handleSubmit(e: Event) {
		e.preventDefault();

		const validationError = validate();
		if (validationError) {
			onError?.(validationError);
			return;
		}

		submitting = true;

		try {
			// 1. Create the split parent transaction
			const parentInput: CreateTransactionInput = {
				account_id: parentAccountId,
				inflow: '0',
				outflow: '0',
				is_split_parent: true,
				memo: parentMemo.trim() || undefined,
				payee: parentPayee.trim() || undefined,
				entered_date: enteredDate ? new Date(enteredDate).toISOString() : undefined,
			};

			const parentResult = await createTransaction(parentInput);
			if (!parentResult.ok) {
				const errData = parentResult.data as unknown as { error?: string; message?: string };
				onError?.(
					errData?.error ??
						errData?.message ??
						`Failed to create split parent (${parentResult.status})`,
				);
				return;
			}

			const parentId = parentResult.data.id;

			// 2. Create each child split transaction
			const createdChildren: string[] = [];
			for (let i = 0; i < splitChildren.length; i++) {
				const child = splitChildren[i];
				const { inflow, outflow } = resolveAmounts(transactionType, child.amount);

				const childInput: CreateTransactionInput = {
					account_id: child.accountId,
					inflow,
					outflow,
					split_parent_id: parentId,
					memo: child.memo.trim() || undefined,
					category: child.category.trim() || undefined,
					payee: parentPayee.trim() || undefined,
					entered_date: enteredDate ? new Date(enteredDate).toISOString() : undefined,
				};

				// Attach ledger entries if enabled
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
					onError?.(
						errData?.error ??
							errData?.message ??
							`Failed to create split child #${i + 1} (${childResult.status})`,
					);
					return;
				}
				createdChildren.push(childResult.data.id);
			}

			onSuccess?.(
				`Split transaction created: parent ${parentId} with ${createdChildren.length} child(ren). Total: ${formatDecimal(splitTotal)}`,
			);

			// Reset form
			resetForm();
		} catch {
			onError?.('Failed to connect to API');
		} finally {
			submitting = false;
		}
	}

	function resetForm() {
		parentMemo = '';
		parentPayee = '';
		enteredDate = new Date().toISOString().slice(0, 10);
		splitChildren = [
			{ amount: '', accountId: parentAccountId, memo: '', category: '' },
			{ amount: '', accountId: parentAccountId, memo: '', category: '' },
		];
		hasLedgerEntries = false;
		ledgerEntries = [];
	}
</script>

<div class="bg-white rounded-lg border border-gray-200 p-6">
	<h2 class="text-lg font-semibold text-gray-900 mb-4">Split Transaction</h2>

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

		<!-- Parent fields -->
		<div class="space-y-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
			<h3 class="text-sm font-semibold text-gray-700">Parent Transaction</h3>

			<div>
				<label for="split-parent-account" class="block text-sm font-medium text-gray-700 mb-1"
					>Account</label
				>
				<select
					id="split-parent-account"
					bind:value={parentAccountId}
					class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
				>
					{#each accounts as acct}
						<option value={acct.id}>
							{acct.name} ({acct.account_type} — {acct.currency}, balance: {acct.balance})
						</option>
					{/each}
				</select>
			</div>

			<div class="grid grid-cols-3 gap-4">
				<div>
					<label for="split-parent-payee" class="block text-sm font-medium text-gray-700 mb-1"
						>Payee</label
					>
					<input
						id="split-parent-payee"
						type="text"
						bind:value={parentPayee}
						placeholder="e.g. Whole Foods"
						class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
					/>
				</div>
				<div>
					<label for="split-parent-memo" class="block text-sm font-medium text-gray-700 mb-1"
						>Memo</label
					>
					<input
						id="split-parent-memo"
						type="text"
						bind:value={parentMemo}
						placeholder="Notes"
						class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
					/>
				</div>
				<div>
					<label for="split-parent-date" class="block text-sm font-medium text-gray-700 mb-1"
						>Date</label
					>
					<input
						id="split-parent-date"
						type="date"
						bind:value={enteredDate}
						class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
					/>
				</div>
			</div>
		</div>

		<!-- Split Children -->
		<div class="space-y-3">
			<div class="flex items-center justify-between">
				<span class="text-sm font-semibold text-gray-700">
					Split Entries ({splitChildren.length})
				</span>
				<div class="flex items-center gap-3">
					<span class="text-sm text-gray-500">
						Total: <span class="font-mono font-medium">{formatDecimal(splitTotal)}</span>
					</span>
					<button
						type="button"
						onclick={addSplitChild}
						class="px-3 py-1 text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded hover:bg-blue-100"
					>
						+ Add Split
					</button>
				</div>
			</div>

			{#each splitChildren as child, i}
				<div class="p-3 bg-gray-50 rounded border border-gray-200 space-y-2">
					<div class="flex items-center justify-between">
						<span class="text-xs font-medium text-gray-600">Split #{i + 1}</span>
						<button
							type="button"
							onclick={() => removeSplitChild(i)}
							disabled={splitChildren.length <= 1}
							class="text-xs text-red-600 hover:text-red-800 disabled:text-gray-400 disabled:cursor-not-allowed"
						>
							Remove
						</button>
					</div>
					<div class="grid grid-cols-4 gap-2">
						<div>
							<label for="split-child-amount-{i}" class="block text-xs text-gray-600 mb-0.5"
								>{amountLabel(transactionType)}</label
							>
							<input
								id="split-child-amount-{i}"
								type="text"
								inputmode="decimal"
								bind:value={child.amount}
								placeholder="0.00"
								class="w-full px-2 py-1.5 border border-gray-300 rounded text-sm font-mono focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
								required
							/>
						</div>
						<div>
							<label for="split-child-account-{i}" class="block text-xs text-gray-600 mb-0.5"
								>Account</label
							>
							<select
								id="split-child-account-{i}"
								bind:value={child.accountId}
								class="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
							>
								{#each accounts as acct}
									<option value={acct.id}>{acct.name} ({acct.currency})</option>
								{/each}
							</select>
						</div>
						<div>
							<label for="split-child-category-{i}" class="block text-xs text-gray-600 mb-0.5"
								>Category</label
							>
							<input
								id="split-child-category-{i}"
								type="text"
								bind:value={child.category}
								placeholder="Food:Groceries"
								class="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
							/>
						</div>
						<div>
							<label for="split-child-memo-{i}" class="block text-xs text-gray-600 mb-0.5"
								>Memo</label
							>
							<input
								id="split-child-memo-{i}"
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

		<!-- Optional Ledger Entries -->
		<div class="border-t border-gray-200 pt-4">
			<div class="flex items-center gap-2 mb-3">
				<input
					id="split-has-ledger"
					type="checkbox"
					bind:checked={hasLedgerEntries}
					class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
				/>
				<label for="split-has-ledger" class="text-sm font-medium text-gray-700"
					>Add ledger entries (double-entry bookkeeping)</label
				>
			</div>

			{#if hasLedgerEntries}
				<div class="space-y-3">
					<button
						type="button"
						onclick={addLedgerEntry}
						class="px-3 py-1 text-xs bg-gray-100 text-gray-700 border border-gray-300 rounded hover:bg-gray-200"
					>
						+ Add Ledger Entry
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
									<label for="split-le-account-{i}" class="block text-xs text-gray-600 mb-0.5"
										>Account</label
									>
									<select
										id="split-le-account-{i}"
										bind:value={entry.account_id}
										class="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
									>
										{#each accounts as acct}
											<option value={acct.id}>{acct.name} ({acct.currency})</option>
										{/each}
									</select>
								</div>
								<div>
									<label for="split-le-type-{i}" class="block text-xs text-gray-600 mb-0.5"
										>Type</label
									>
									<select
										id="split-le-type-{i}"
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
									<label for="split-le-amount-{i}" class="block text-xs text-gray-600 mb-0.5"
										>Amount</label
									>
									<input
										id="split-le-amount-{i}"
										type="text"
										inputmode="decimal"
										bind:value={entry.amount}
										placeholder="0.00"
										class="w-full px-2 py-1.5 border border-gray-300 rounded text-sm font-mono focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
									/>
								</div>
								<div>
									<label for="split-le-currency-{i}" class="block text-xs text-gray-600 mb-0.5"
										>Currency</label
									>
									<input
										id="split-le-currency-{i}"
										type="text"
										bind:value={entry.currency}
										placeholder="USD"
										class="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
									/>
								</div>
								<div>
									<label for="split-le-desc-{i}" class="block text-xs text-gray-600 mb-0.5"
										>Description</label
									>
									<input
										id="split-le-desc-{i}"
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
						<p class="text-sm text-gray-500">
							No ledger entries. Click "Add Ledger Entry" to create double-entry bookkeeping
							entries.
						</p>
					{/if}
				</div>
			{/if}
		</div>

		<!-- Submit -->
		<div class="flex gap-3 pt-2">
			<button
				type="submit"
				disabled={submitting}
				class="px-4 py-2 text-sm font-medium rounded-md text-white disabled:opacity-50 disabled:cursor-not-allowed
					{transactionType === 'income'
					? 'bg-green-600 hover:bg-green-700'
					: transactionType === 'expense'
						? 'bg-red-600 hover:bg-red-700'
						: 'bg-blue-600 hover:bg-blue-700'}"
			>
				{submitting
					? 'Creating Split...'
					: `Create Split ${transactionType.charAt(0).toUpperCase() + transactionType.slice(1)}`}
			</button>
			<button
				type="button"
				onclick={resetForm}
				disabled={submitting}
				class="px-4 py-2 text-sm font-medium rounded-md text-gray-700 border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
			>
				Reset
			</button>
		</div>
	</form>
</div>
