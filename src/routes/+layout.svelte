<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import { loadTokens, loadSessionId, hasTokens, logout, setTokens, getMe, setOnAuthExpired } from '$lib/api';
	import { onMount } from 'svelte';
	import HealthStatus from '$lib/components/HealthStatus.svelte';
	import VaultStatus from '$lib/components/VaultStatus.svelte';
	import { getAuthState } from '$lib/auth.svelte';
	import { goto } from '$app/navigation';

	const auth = getAuthState();
	let { children } = $props();

	onMount(async () => {
		// Wire up auth-expired callback so failed token refreshes clear UI state
		setOnAuthExpired(() => {
			auth.setUser(null);
		});

		loadTokens();
		loadSessionId();
		if (hasTokens()) {
			try {
				const result = await getMe();
				if (result.ok) {
					auth.setUser(result.data);
				} else {
					// Tokens are invalid, clear them
					setTokens(null);
				}
			} catch {
				setTokens(null);
			}
		}
	});

	async function handleLogout() {
		try {
			await logout();
		} catch {
			// Clear tokens even if API call fails
			setTokens(null);
		}
		auth.setUser(null);
		goto('/login');
	}
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<div class="min-h-screen bg-gray-50 flex flex-col">
	<nav class="bg-white border-b border-gray-200 px-4 py-3">
		<div class="max-w-4xl mx-auto flex items-center gap-4">
			<a href="/" class="font-semibold text-gray-900">Accounting UI</a>
			{#if auth.isAuthenticated}
				<a href="/accounts" class="text-sm text-blue-600 hover:text-blue-800">Accounts</a>
				<a href="/transactions" class="text-sm text-blue-600 hover:text-blue-800">Transactions</a>
				<a href="/vault" class="text-sm text-blue-600 hover:text-blue-800">Vault</a>
				<a href="/profile" class="text-sm text-blue-600 hover:text-blue-800 ml-auto">
					{auth.user?.display_name ?? auth.user?.email}
				</a>
				<button
					onclick={handleLogout}
					class="text-sm text-red-600 hover:text-red-800"
				>
					Logout
				</button>
			{:else}
				<a href="/register" class="text-sm text-blue-600 hover:text-blue-800 ml-auto">Register</a>
				<a href="/login" class="text-sm text-blue-600 hover:text-blue-800">Login</a>
			{/if}
		</div>
	</nav>
	<main class="max-w-4xl mx-auto p-4 flex-1 w-full">
		{@render children()}
	</main>
	<footer class="bg-white border-t border-gray-200 px-4 py-2 flex justify-end gap-3">
		<VaultStatus />
		<HealthStatus />
	</footer>
</div>
