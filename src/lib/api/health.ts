import { API_BASE_URL } from './config';

/** Response from GET /health (liveness probe). */
export interface HealthResponse {
	status: string;
	version: string;
}

/** Individual dependency check result. */
export interface DependencyCheck {
	status: string;
	latency_ms?: number;
	message?: string;
}

/** Response from GET /health/ready (readiness probe). */
export interface ReadinessResponse {
	status: string;
	version: string;
	checks: Record<string, DependencyCheck>;
}

/**
 * Fetch the liveness probe.
 * Returns null if the API is unreachable.
 */
export async function fetchHealth(): Promise<HealthResponse | null> {
	try {
		const res = await fetch(`${API_BASE_URL}/health`, {
			signal: AbortSignal.timeout(5000)
		});
		if (!res.ok) return null;
		return (await res.json()) as HealthResponse;
	} catch {
		return null;
	}
}

/**
 * Fetch the readiness probe.
 * Returns the response with the HTTP status code attached,
 * or null if the API is unreachable.
 */
export async function fetchReadiness(): Promise<(ReadinessResponse & { httpStatus: number }) | null> {
	try {
		const res = await fetch(`${API_BASE_URL}/health/ready`, {
			signal: AbortSignal.timeout(5000)
		});
		const body = (await res.json()) as ReadinessResponse;
		return { ...body, httpStatus: res.status };
	} catch {
		return null;
	}
}
