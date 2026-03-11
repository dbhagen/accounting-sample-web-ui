<script lang="ts">
	import { vaultSetup, getMe, type VaultSetupResponse } from '$lib/api';
	import { getAuthState } from '$lib/auth.svelte';
	import { getVaultState } from '$lib/vault.svelte';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';

	const auth = getAuthState();
	const vault = getVaultState();

	let passphrase = $state('');
	let confirmPassphrase = $state('');
	let error = $state('');
	let loading = $state(false);
	let setupResult = $state<VaultSetupResponse | null>(null);
	let validationError = $state('');
	let copied = $state(false);

	const MIN_PASSPHRASE_LENGTH = 8;

	onMount(() => {
		if (!auth.isAuthenticated) {
			goto('/login');
			return;
		}
		if (auth.user?.has_encryption_setup) {
			// Already set up — redirect to vault unlock
			goto('/vault');
			return;
		}
	});

	function validate(): boolean {
		validationError = '';

		if (passphrase.length < MIN_PASSPHRASE_LENGTH) {
			validationError = `Passphrase must be at least ${MIN_PASSPHRASE_LENGTH} characters.`;
			return false;
		}

		if (passphrase !== confirmPassphrase) {
			validationError = 'Passphrases do not match.';
			return false;
		}

		return true;
	}

	// Reactive validation feedback (clear errors as user types)
	$effect(() => {
		// Re-run when either field changes
		passphrase;
		confirmPassphrase;
		if (validationError) {
			validationError = '';
		}
	});

	async function handleSubmit(e: SubmitEvent) {
		e.preventDefault();
		error = '';

		if (!validate()) return;

		loading = true;
		try {
			const result = await vaultSetup(passphrase);
			if (result.ok) {
				setupResult = result.data;

				// Store vault params in local state for later unlock
				vault.storeSetupResult(
					result.data.key_derivation_params,
					result.data.verification_payload,
				);

				// Refresh user profile to reflect has_encryption_setup = true
				try {
					const meResult = await getMe();
					if (meResult.ok) {
						auth.setUser(meResult.data);
					}
				} catch {
					// Non-critical: profile will refresh on next page load
				}
			} else {
				const errData = result.data as unknown as { error?: string; message?: string };
				error = errData.message ?? errData.error ?? `Setup failed (${result.status})`;
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'Network error. Is the API running?';
		} finally {
			loading = false;
		}
	}

	function getParamsJson(): string {
		if (!setupResult) return '';
		return JSON.stringify(
			{
				key_derivation_params: setupResult.key_derivation_params,
				verification_payload: setupResult.verification_payload,
			},
			null,
			2,
		);
	}

	async function copyParams() {
		try {
			await navigator.clipboard.writeText(getParamsJson());
			copied = true;
			setTimeout(() => (copied = false), 2000);
		} catch {
			// Fallback: select text
		}
	}

	function passphraseStrength(p: string): { label: string; color: string } {
		if (p.length === 0) return { label: '', color: '' };
		if (p.length < MIN_PASSPHRASE_LENGTH) return { label: 'Too short', color: 'text-red-600' };
		if (p.length < 12) return { label: 'Fair', color: 'text-yellow-600' };
		if (p.length < 20) return { label: 'Good', color: 'text-blue-600' };
		return { label: 'Strong', color: 'text-green-600' };
	}

	let strength = $derived(passphraseStrength(passphrase));
	let matchStatus = $derived(
		confirmPassphrase.length === 0
			? ''
			: passphrase === confirmPassphrase
				? 'match'
				: 'mismatch',
	);
</script>

<svelte:head>
	<title>Set Up Encryption Vault — Accounting UI</title>
</svelte:head>

<div class="max-w-md mx-auto mt-8">
	<h1 class="text-2xl font-bold mb-2">Set Up Encryption Vault</h1>

	{#if !setupResult}
		<p class="text-sm text-gray-600 mb-6">
			Choose a passphrase to protect your encrypted data. This passphrase is used for
			<strong>zero-knowledge encryption</strong> — the server never sees or stores it. If you
			forget it, your encrypted data cannot be recovered.
		</p>

		{#if error}
			<div class="bg-red-50 border border-red-200 text-red-800 rounded p-4 mb-4">
				{error}
			</div>
		{/if}

		{#if validationError}
			<div class="bg-yellow-50 border border-yellow-200 text-yellow-800 rounded p-4 mb-4">
				{validationError}
			</div>
		{/if}

		<form onsubmit={handleSubmit} class="space-y-4">
			<div>
				<label for="passphrase" class="block text-sm font-medium text-gray-700 mb-1">
					Passphrase
				</label>
				<input
					id="passphrase"
					type="password"
					bind:value={passphrase}
					required
					minlength={MIN_PASSPHRASE_LENGTH}
					class="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
					placeholder="Enter a strong passphrase"
				/>
				{#if strength.label}
					<p class="text-xs mt-1 {strength.color}">
						Strength: {strength.label}
					</p>
				{/if}
			</div>

			<div>
				<label for="confirm-passphrase" class="block text-sm font-medium text-gray-700 mb-1">
					Confirm Passphrase
				</label>
				<input
					id="confirm-passphrase"
					type="password"
					bind:value={confirmPassphrase}
					required
					minlength={MIN_PASSPHRASE_LENGTH}
					class="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 {matchStatus === 'mismatch' ? 'border-red-300 focus:border-red-500 focus:ring-red-500' : matchStatus === 'match' ? 'border-green-300 focus:border-green-500 focus:ring-green-500' : 'border-gray-300 focus:border-blue-500'}"
				/>
				{#if matchStatus === 'mismatch'}
					<p class="text-xs mt-1 text-red-600">Passphrases do not match</p>
				{:else if matchStatus === 'match'}
					<p class="text-xs mt-1 text-green-600">Passphrases match</p>
				{/if}
			</div>

			<div class="bg-amber-50 border border-amber-200 rounded p-3">
				<p class="text-xs text-amber-800">
					<strong>Important:</strong> There is no way to recover your passphrase. Write it down
					and store it securely. Losing it means losing access to all encrypted data.
				</p>
			</div>

			<button
				type="submit"
				disabled={loading || passphrase.length < MIN_PASSPHRASE_LENGTH || passphrase !== confirmPassphrase}
				class="w-full bg-blue-600 text-white rounded px-4 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
			>
				{loading ? 'Setting up...' : 'Set Up Encryption'}
			</button>
		</form>

		<p class="mt-4 text-sm text-gray-600">
			<a href="/profile" class="text-blue-600 hover:underline">&larr; Back to Profile</a>
		</p>
	{:else}
		<!-- Setup success — show the params to store -->
		<div class="bg-green-50 border border-green-200 text-green-800 rounded p-4 mb-4">
			{setupResult.message}
		</div>

		<div class="mb-4">
			<p class="text-sm text-gray-700 mb-2">
				Your encryption vault has been configured. The parameters below are needed to unlock
				your vault. They are stored by the API, but you may want to save a backup copy.
			</p>

			<div class="relative">
				<pre class="bg-gray-100 border border-gray-200 rounded p-3 text-xs overflow-x-auto max-h-48">{getParamsJson()}</pre>
				<button
					onclick={copyParams}
					class="absolute top-2 right-2 text-xs bg-white border border-gray-300 rounded px-2 py-1 hover:bg-gray-50"
				>
					{copied ? 'Copied!' : 'Copy'}
				</button>
			</div>
		</div>

		<div class="flex gap-3">
			<a
				href="/vault"
				class="flex-1 text-center bg-blue-600 text-white rounded px-4 py-2 text-sm font-medium hover:bg-blue-700"
			>
				Go to Vault
			</a>
			<a
				href="/profile"
				class="flex-1 text-center bg-gray-200 text-gray-800 rounded px-4 py-2 text-sm font-medium hover:bg-gray-300"
			>
				Back to Profile
			</a>
		</div>
	{/if}
</div>
