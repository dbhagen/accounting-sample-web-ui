<script lang="ts">
	import { getAuthState } from '$lib/auth.svelte';
	import { getVaultState } from '$lib/vault.svelte';
	import {
		vaultUnlock,
		vaultLock,
		vaultStatus,
		getSessionId,
		setSessionId,
		loadSessionId,
	} from '$lib/api';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';

	const auth = getAuthState();
	const vault = getVaultState();

	let unlockPassphrase = $state('');
	let loading = $state(false);
	let error = $state('');
	let success = $state('');
	let statusLoading = $state(false);

	onMount(async () => {
		if (!auth.isAuthenticated) {
			goto('/login');
			return;
		}

		vault.loadStoredParams();
		loadSessionId();

		// Sync hasSetup from user profile
		if (auth.user?.has_encryption_setup) {
			vault.setHasSetup(true);
		}

		// Check vault status if we have a stored session
		const sid = getSessionId();
		if (sid) {
			await checkStatus(sid);
		}
	});

	async function checkStatus(sid: string) {
		statusLoading = true;
		try {
			const result = await vaultStatus(sid);
			if (result.ok && result.data.unlocked) {
				vault.setUnlocked(true, sid);
			} else {
				vault.setUnlocked(false, null);
				setSessionId(null);
			}
		} catch {
			vault.setUnlocked(false, null);
		} finally {
			statusLoading = false;
		}
	}

	async function handleUnlock() {
		error = '';
		success = '';

		if (!unlockPassphrase) {
			error = 'Passphrase is required to unlock';
			return;
		}

		if (!vault.storedParams || !vault.storedVerification) {
			error = 'No vault parameters stored. Please set up the vault first.';
			return;
		}

		if (!auth.user?.id) {
			error = 'User not loaded';
			return;
		}

		loading = true;
		try {
			const result = await vaultUnlock(
				auth.user.id,
				unlockPassphrase,
				vault.storedParams,
				vault.storedVerification,
			);
			if (result.ok) {
				const sid = result.data.session_id;
				setSessionId(sid);
				vault.setUnlocked(true, sid);
				success = result.data.message || `Vault unlocked. Session expires in ${result.data.expires_in_seconds}s.`;
				unlockPassphrase = '';
			} else {
				const errData = result.data as unknown as { error?: string; message?: string };
				error = errData?.error ?? errData?.message ?? `Unlock failed (${result.status})`;
			}
		} catch {
			error = 'Network error during vault unlock';
		} finally {
			loading = false;
		}
	}

	async function handleLock() {
		error = '';
		success = '';

		const sid = getSessionId();
		if (!sid) {
			error = 'No active session to lock';
			return;
		}

		loading = true;
		try {
			const result = await vaultLock(sid);
			if (result.ok) {
				vault.setUnlocked(false, null);
				setSessionId(null);
				success = result.data.message || 'Vault locked successfully.';
			} else {
				const errData = result.data as unknown as { error?: string; message?: string };
				error = errData?.error ?? errData?.message ?? `Lock failed (${result.status})`;
			}
		} catch {
			error = 'Network error during vault lock';
		} finally {
			loading = false;
		}
	}

	async function handleRefreshStatus() {
		error = '';
		const sid = getSessionId();
		if (sid) {
			await checkStatus(sid);
		} else {
			vault.setUnlocked(false, null);
		}
	}
</script>

<svelte:head>
	<title>Encryption Vault — Accounting UI</title>
</svelte:head>

<div class="max-w-lg mx-auto">
	<h1 class="text-2xl font-bold text-gray-900 mb-6">Encryption Vault</h1>

	{#if error}
		<div class="bg-red-50 border border-red-200 text-red-700 rounded p-3 mb-4">
			{error}
		</div>
	{/if}

	{#if success}
		<div class="bg-green-50 border border-green-200 text-green-700 rounded p-3 mb-4">
			{success}
		</div>
	{/if}

	<!-- Vault Status -->
	<div class="bg-white border border-gray-200 rounded-lg p-4 mb-6">
		<div class="flex items-center justify-between">
			<div>
				<h2 class="text-sm font-medium text-gray-500">Vault Status</h2>
				{#if statusLoading}
					<p class="text-gray-400 mt-1">Checking…</p>
				{:else if vault.isUnlocked}
					<p class="text-green-600 font-semibold mt-1">🔓 Unlocked</p>
				{:else if vault.hasSetup || auth.user?.has_encryption_setup}
					<p class="text-yellow-600 font-semibold mt-1">🔒 Locked</p>
				{:else}
					<p class="text-gray-500 mt-1">Not configured</p>
				{/if}
			</div>
			<button
				onclick={handleRefreshStatus}
				class="text-sm text-blue-600 hover:text-blue-800"
				disabled={statusLoading}
			>
				↻ Refresh
			</button>
		</div>
	</div>

	<!-- Setup Prompt (vault not yet set up) -->
	{#if !vault.hasSetup && !auth.user?.has_encryption_setup}
		<div class="bg-white border border-gray-200 rounded-lg p-4 mb-6">
			<h2 class="text-lg font-semibold text-gray-900 mb-2">Set Up Encryption</h2>
			<p class="text-sm text-gray-500 mb-4">
				Your encryption vault is not configured yet. Set up a passphrase to enable zero-knowledge encryption for your data.
			</p>
			<a
				href="/vault/setup"
				class="block w-full text-center bg-blue-600 text-white rounded px-4 py-2 text-sm font-medium hover:bg-blue-700"
			>
				Set Up Encryption Vault
			</a>
		</div>
	{/if}

	<!-- Unlock Section (vault set up but locked) -->
	{#if (vault.hasSetup || auth.user?.has_encryption_setup) && !vault.isUnlocked}
		<div class="bg-white border border-gray-200 rounded-lg p-4 mb-6">
			<h2 class="text-lg font-semibold text-gray-900 mb-2">Unlock Vault</h2>
			<p class="text-sm text-gray-500 mb-4">
				Enter your passphrase to decrypt and access your data.
			</p>
			{#if !vault.storedParams}
				<div class="bg-yellow-50 border border-yellow-200 text-yellow-700 rounded p-3 mb-4 text-sm">
					Vault parameters not found in this browser. If you set up the vault on another device, the parameters need to be available here.
				</div>
			{/if}
			<form onsubmit={(e) => { e.preventDefault(); handleUnlock(); }}>
				<div class="mb-4">
					<label for="unlock-passphrase" class="block text-sm font-medium text-gray-700 mb-1">
						Passphrase
					</label>
					<input
						id="unlock-passphrase"
						type="password"
						bind:value={unlockPassphrase}
						class="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
						placeholder="Enter your vault passphrase"
						disabled={loading || !vault.storedParams}
					/>
				</div>
				<button
					type="submit"
					class="w-full bg-green-600 text-white rounded px-4 py-2 text-sm font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
					disabled={loading || !vault.storedParams}
				>
					{loading ? 'Unlocking…' : 'Unlock Vault'}
				</button>
			</form>
		</div>
	{/if}

	<!-- Lock Section (vault is unlocked) -->
	{#if vault.isUnlocked}
		<div class="bg-white border border-gray-200 rounded-lg p-4 mb-6">
			<h2 class="text-lg font-semibold text-gray-900 mb-2">Vault is Unlocked</h2>
			<p class="text-sm text-gray-500 mb-4">
				Your encryption vault is active. Lock it when you're done to secure your data.
			</p>
			{#if vault.sessionId}
				<p class="text-xs text-gray-400 mb-3 font-mono break-all">
					Session: {vault.sessionId}
				</p>
			{/if}
			<button
				onclick={handleLock}
				class="w-full bg-yellow-600 text-white rounded px-4 py-2 text-sm font-medium hover:bg-yellow-700 disabled:opacity-50 disabled:cursor-not-allowed"
				disabled={loading}
			>
				{loading ? 'Locking…' : 'Lock Vault'}
			</button>
		</div>
	{/if}
</div>
