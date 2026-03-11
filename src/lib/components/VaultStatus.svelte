<script lang="ts">
	import { onMount } from 'svelte';
	import { vaultStatus, getSessionId, hasTokens } from '$lib/api';
	import { getVaultState } from '$lib/vault.svelte';
	import { getAuthState } from '$lib/auth.svelte';

	const vault = getVaultState();
	const auth = getAuthState();

	/** How often to poll vault status (ms). */
	const POLL_INTERVAL = 15_000;

	type VaultDisplay = 'no-auth' | 'not-setup' | 'locked' | 'unlocked' | 'checking';

	let displayState: VaultDisplay = $state('checking');
	let sessionExpiry: string | null = $state(null);
	let expanded: boolean = $state(false);

	async function checkStatus() {
		if (!auth.isAuthenticated || !hasTokens()) {
			displayState = 'no-auth';
			return;
		}

		const sid = getSessionId();
		if (!sid) {
			// No session ID stored — check if vault is set up via user profile
			if (auth.user?.has_encryption_setup) {
				displayState = 'locked';
			} else {
				displayState = 'not-setup';
			}
			vault.setUnlocked(false, null);
			return;
		}

		try {
			const result = await vaultStatus(sid);
			if (result.ok && result.data.unlocked) {
				displayState = 'unlocked';
				vault.setUnlocked(true, sid);
				sessionExpiry = result.data.last_accessed_at ?? null;
			} else {
				// Session expired or invalid
				displayState = auth.user?.has_encryption_setup ? 'locked' : 'not-setup';
				vault.setUnlocked(false, null);
				sessionExpiry = null;
			}
		} catch {
			// Network error — keep previous state
		}
	}

	onMount(() => {
		checkStatus();
		const interval = setInterval(checkStatus, POLL_INTERVAL);
		return () => clearInterval(interval);
	});

	const dotColor: Record<VaultDisplay, string> = {
		'no-auth': '#9ca3af',
		'checking': '#9ca3af',
		'not-setup': '#9ca3af',
		'locked': '#f59e0b',
		'unlocked': '#22c55e',
	};

	const labelText: Record<VaultDisplay, string> = {
		'no-auth': '',
		'checking': 'Vault …',
		'not-setup': 'No Vault',
		'locked': 'Vault Locked',
		'unlocked': 'Vault Open',
	};

	const iconText: Record<VaultDisplay, string> = {
		'no-auth': '',
		'checking': '⏳',
		'not-setup': '—',
		'locked': '🔒',
		'unlocked': '🔓',
	};
</script>

{#if displayState !== 'no-auth'}
	<div class="vault-status-wrapper">
		<button
			class="vault-status-btn"
			onclick={() => (expanded = !expanded)}
			title="Vault Status"
		>
			<span class="vault-dot" style="background-color: {dotColor[displayState]}"></span>
			<span class="vault-label">{labelText[displayState]}</span>
		</button>

		{#if expanded}
			<div class="vault-details">
				<div class="vault-details-header">
					<strong>{iconText[displayState]} Vault Status</strong>
					<button class="vault-refresh-btn" onclick={() => { checkStatus(); }} title="Refresh now">&#x21bb;</button>
				</div>

				<div class="vault-row">
					<span>State:</span>
					<span class="vault-value" style="color: {dotColor[displayState]}">
						{#if displayState === 'unlocked'}
							Unlocked
						{:else if displayState === 'locked'}
							Locked
						{:else if displayState === 'not-setup'}
							Not configured
						{:else}
							Checking…
						{/if}
					</span>
				</div>

				{#if displayState === 'unlocked' && sessionExpiry}
					<div class="vault-row">
						<span>Last accessed:</span>
						<span class="vault-value">{new Date(sessionExpiry).toLocaleTimeString()}</span>
					</div>
				{/if}

				<div class="vault-row vault-action">
					{#if displayState === 'not-setup'}
						<a href="/vault/setup" class="vault-link" onclick={() => (expanded = false)}>Set up encryption →</a>
					{:else if displayState === 'locked'}
						<a href="/vault" class="vault-link" onclick={() => (expanded = false)}>Unlock vault →</a>
					{:else if displayState === 'unlocked'}
						<a href="/vault" class="vault-link" onclick={() => (expanded = false)}>Manage vault →</a>
					{/if}
				</div>
			</div>
		{/if}
	</div>
{/if}

<style>
	.vault-status-wrapper {
		position: relative;
		display: inline-block;
		font-family: system-ui, -apple-system, sans-serif;
		font-size: 0.8125rem;
	}

	.vault-status-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		background: none;
		border: 1px solid #e5e7eb;
		border-radius: 0.375rem;
		padding: 0.25rem 0.625rem;
		cursor: pointer;
		color: #374151;
		font-size: inherit;
		line-height: 1.4;
	}

	.vault-status-btn:hover {
		background-color: #f9fafb;
	}

	.vault-dot {
		display: inline-block;
		width: 0.5rem;
		height: 0.5rem;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.vault-label {
		white-space: nowrap;
	}

	.vault-details {
		position: absolute;
		bottom: calc(100% + 0.5rem);
		right: 0;
		background: #ffffff;
		border: 1px solid #e5e7eb;
		border-radius: 0.5rem;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
		padding: 0.75rem 1rem;
		min-width: 14rem;
		z-index: 50;
	}

	.vault-details-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 0.5rem;
		padding-bottom: 0.375rem;
		border-bottom: 1px solid #f3f4f6;
	}

	.vault-refresh-btn {
		background: none;
		border: none;
		cursor: pointer;
		font-size: 1rem;
		color: #6b7280;
		padding: 0 0.25rem;
		line-height: 1;
	}

	.vault-refresh-btn:hover {
		color: #111827;
	}

	.vault-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.125rem 0;
		gap: 0.75rem;
	}

	.vault-value {
		font-weight: 500;
		text-align: right;
	}

	.vault-action {
		margin-top: 0.375rem;
		padding-top: 0.375rem;
		border-top: 1px solid #f3f4f6;
	}

	.vault-link {
		color: #2563eb;
		text-decoration: none;
		font-size: 0.8125rem;
	}

	.vault-link:hover {
		text-decoration: underline;
	}
</style>
