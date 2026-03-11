<script lang="ts">
	import { register, setTokens } from '$lib/api';
	import { getAuthState } from '$lib/auth.svelte';
	import { goto } from '$app/navigation';

	const auth = getAuthState();

	let email = $state('');
	let password = $state('');
	let displayName = $state('');
	let error = $state('');
	let loading = $state(false);
	let success = $state(false);

	async function handleSubmit(e: SubmitEvent) {
		e.preventDefault();
		error = '';
		loading = true;

		try {
			const result = await register(email, password, displayName || undefined);

			if (result.ok) {
				setTokens(result.data.tokens);
				auth.setUser(result.data.user);
				success = true;
				// Redirect after short delay so user sees success
				setTimeout(() => goto('/'), 1000);
			} else {
				const errData = result.data as unknown as { error?: string; message?: string };
				error = errData.message ?? errData.error ?? `Registration failed (${result.status})`;
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'Network error. Is the API running?';
		} finally {
			loading = false;
		}
	}
</script>

<svelte:head>
	<title>Register - Accounting UI</title>
</svelte:head>

<div class="max-w-md mx-auto mt-8">
	<h1 class="text-2xl font-bold mb-6">Create Account</h1>

	{#if success}
		<div class="bg-green-50 border border-green-200 text-green-800 rounded p-4 mb-4">
			Registration successful! Redirecting...
		</div>
	{/if}

	{#if error}
		<div class="bg-red-50 border border-red-200 text-red-800 rounded p-4 mb-4">
			{error}
		</div>
	{/if}

	<form onsubmit={handleSubmit} class="space-y-4">
		<div>
			<label for="email" class="block text-sm font-medium text-gray-700 mb-1">
				Email
			</label>
			<input
				id="email"
				type="email"
				bind:value={email}
				required
				class="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
				placeholder="user@example.com"
			/>
		</div>

		<div>
			<label for="password" class="block text-sm font-medium text-gray-700 mb-1">
				Password
			</label>
			<input
				id="password"
				type="password"
				bind:value={password}
				required
				minlength={8}
				class="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
				placeholder="Minimum 8 characters"
			/>
		</div>

		<div>
			<label for="displayName" class="block text-sm font-medium text-gray-700 mb-1">
				Display Name <span class="text-gray-400">(optional)</span>
			</label>
			<input
				id="displayName"
				type="text"
				bind:value={displayName}
				class="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
				placeholder="John Doe"
			/>
		</div>

		<button
			type="submit"
			disabled={loading}
			class="w-full bg-blue-600 text-white rounded px-4 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
		>
			{loading ? 'Registering...' : 'Register'}
		</button>
	</form>

	<p class="mt-4 text-sm text-gray-600">
		Already have an account? <a href="/login" class="text-blue-600 hover:underline">Log in</a>
	</p>
</div>
