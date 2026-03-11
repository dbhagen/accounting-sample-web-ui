<script lang="ts">
	import { onMount } from 'svelte';
	import { fetchHealth, fetchReadiness } from '$lib/api/health';
	import type { HealthResponse, ReadinessResponse, DependencyCheck } from '$lib/api/health';

	/** How often to poll health (ms). */
	const POLL_INTERVAL = 30_000;

	type Status = 'loading' | 'ok' | 'degraded' | 'unreachable';

	let status: Status = $state('loading');
	let version: string = $state('');
	let checks: Record<string, DependencyCheck> = $state({});
	let expanded: boolean = $state(false);
	let lastChecked: string = $state('');

	function updateTimestamp() {
		lastChecked = new Date().toLocaleTimeString();
	}

	async function poll() {
		const readiness = await fetchReadiness();
		if (readiness === null) {
			// API unreachable — try liveness as fallback
			const health = await fetchHealth();
			if (health === null) {
				status = 'unreachable';
				version = '';
				checks = {};
			} else {
				// Process alive but readiness failed
				status = 'degraded';
				version = health.version;
				checks = {};
			}
		} else {
			version = readiness.version;
			checks = readiness.checks;
			status = readiness.status === 'ok' ? 'ok' : 'degraded';
		}
		updateTimestamp();
	}

	onMount(() => {
		poll();
		const interval = setInterval(poll, POLL_INTERVAL);
		return () => clearInterval(interval);
	});

	const dotColor: Record<Status, string> = {
		loading: '#9ca3af',
		ok: '#22c55e',
		degraded: '#f59e0b',
		unreachable: '#ef4444'
	};

	const labelText: Record<Status, string> = {
		loading: 'Checking...',
		ok: 'API Online',
		degraded: 'API Degraded',
		unreachable: 'API Offline'
	};
</script>

<div class="health-status-wrapper">
	<button
		class="health-status-btn"
		onclick={() => (expanded = !expanded)}
		title="API Health Status"
	>
		<span class="health-dot" style="background-color: {dotColor[status]}"></span>
		<span class="health-label">{labelText[status]}</span>
		{#if version}
			<span class="health-version">v{version}</span>
		{/if}
	</button>

	{#if expanded}
		<div class="health-details">
			<div class="health-details-header">
				<strong>API Health</strong>
				<button class="health-refresh-btn" onclick={poll} title="Refresh now">&#x21bb;</button>
			</div>

			<div class="health-row">
				<span>Status:</span>
				<span class="health-value" style="color: {dotColor[status]}">{status}</span>
			</div>

			{#if version}
				<div class="health-row">
					<span>Version:</span>
					<span class="health-value">{version}</span>
				</div>
			{/if}

			{#each Object.entries(checks) as [name, check]}
				<div class="health-row">
					<span>{name}:</span>
					<span
						class="health-value"
						style="color: {check.status === 'ok' ? '#22c55e' : '#ef4444'}"
					>
						{check.status}
						{#if check.latency_ms !== undefined}
							({check.latency_ms}ms)
						{/if}
						{#if check.message}
							— {check.message}
						{/if}
					</span>
				</div>
			{/each}

			{#if lastChecked}
				<div class="health-row health-last-checked">
					<span>Last checked:</span>
					<span class="health-value">{lastChecked}</span>
				</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	.health-status-wrapper {
		position: relative;
		display: inline-block;
		font-family: system-ui, -apple-system, sans-serif;
		font-size: 0.8125rem;
	}

	.health-status-btn {
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

	.health-status-btn:hover {
		background-color: #f9fafb;
	}

	.health-dot {
		display: inline-block;
		width: 0.5rem;
		height: 0.5rem;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.health-label {
		white-space: nowrap;
	}

	.health-version {
		color: #9ca3af;
		font-size: 0.75rem;
	}

	.health-details {
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

	.health-details-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 0.5rem;
		padding-bottom: 0.375rem;
		border-bottom: 1px solid #f3f4f6;
	}

	.health-refresh-btn {
		background: none;
		border: none;
		cursor: pointer;
		font-size: 1rem;
		color: #6b7280;
		padding: 0 0.25rem;
		line-height: 1;
	}

	.health-refresh-btn:hover {
		color: #111827;
	}

	.health-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.125rem 0;
		gap: 0.75rem;
	}

	.health-value {
		font-weight: 500;
		text-align: right;
	}

	.health-last-checked {
		margin-top: 0.375rem;
		padding-top: 0.375rem;
		border-top: 1px solid #f3f4f6;
		color: #9ca3af;
		font-size: 0.75rem;
	}
</style>
