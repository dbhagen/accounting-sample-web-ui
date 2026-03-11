<script lang="ts">
	import { getMe, type UserProfile } from '$lib/api';
	import { getAuthState } from '$lib/auth.svelte';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';

	const auth = getAuthState();

	let profile = $state<UserProfile | null>(null);
	let loading = $state(true);
	let error = $state('');

	onMount(async () => {
		if (!auth.isAuthenticated) {
			goto('/login');
			return;
		}
		await fetchProfile();
	});

	async function fetchProfile() {
		loading = true;
		error = '';
		try {
			const result = await getMe();
			if (result.ok) {
				profile = result.data;
				auth.setUser(result.data);
			} else {
				const errData = result.data as unknown as { error?: string };
				error = errData?.error ?? `Failed to load profile (${result.status})`;
			}
		} catch (e) {
			error = 'Network error loading profile';
		} finally {
			loading = false;
		}
	}
</script>

<svelte:head>
	<title>Profile — Accounting UI</title>
</svelte:head>

<div class="max-w-lg mx-auto">
	<h1 class="text-2xl font-bold text-gray-900 mb-6">My Profile</h1>

	{#if loading}
		<p class="text-gray-500">Loading profile…</p>
	{:else if error}
		<div class="bg-red-50 border border-red-200 text-red-700 rounded p-3 mb-4">
			{error}
		</div>
		<button onclick={fetchProfile} class="text-sm text-blue-600 hover:text-blue-800">
			Retry
		</button>
	{:else if profile}
		<div class="bg-white border border-gray-200 rounded-lg divide-y divide-gray-100">
			<div class="px-4 py-3 flex justify-between">
				<span class="text-sm font-medium text-gray-500">Email</span>
				<span class="text-sm text-gray-900">{profile.email}</span>
			</div>
			<div class="px-4 py-3 flex justify-between">
				<span class="text-sm font-medium text-gray-500">Display Name</span>
				<span class="text-sm text-gray-900">{profile.display_name ?? '—'}</span>
			</div>
			<div class="px-4 py-3 flex justify-between">
				<span class="text-sm font-medium text-gray-500">User ID</span>
				<span class="text-sm text-gray-900 font-mono text-xs">{profile.id}</span>
			</div>
			<div class="px-4 py-3 flex justify-between">
				<span class="text-sm font-medium text-gray-500">Status</span>
				<span class="text-sm {profile.is_active ? 'text-green-600' : 'text-red-600'}">
					{profile.is_active ? 'Active' : 'Inactive'}
				</span>
			</div>
			<div class="px-4 py-3 flex justify-between items-center">
				<span class="text-sm font-medium text-gray-500">Encryption Vault</span>
				{#if profile.has_encryption_setup}
					<span class="text-sm text-green-600">Configured</span>
				{:else}
					<a href="/vault/setup" class="text-sm text-blue-600 hover:underline">
						Set Up Encryption &rarr;
					</a>
				{/if}
			</div>
			<div class="px-4 py-3 flex justify-between">
				<span class="text-sm font-medium text-gray-500">Version</span>
				<span class="text-sm text-gray-900">{profile.version}</span>
			</div>
			<div class="px-4 py-3 flex justify-between">
				<span class="text-sm font-medium text-gray-500">Created</span>
				<span class="text-sm text-gray-900">{new Date(profile.created_at).toLocaleString()}</span>
			</div>
			<div class="px-4 py-3 flex justify-between">
				<span class="text-sm font-medium text-gray-500">Updated</span>
				<span class="text-sm text-gray-900">{new Date(profile.updated_at).toLocaleString()}</span>
			</div>
		</div>

		<div class="mt-4">
			<button
				onclick={fetchProfile}
				class="text-sm text-blue-600 hover:text-blue-800"
			>
				↻ Refresh
			</button>
		</div>
	{/if}
</div>
