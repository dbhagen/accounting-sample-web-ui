/**
 * API configuration.
 * Base URL is read from the VITE_API_URL environment variable.
 * Defaults to empty string (relative URLs), which works with the
 * Vite dev proxy (see vite.config.ts) and same-origin deployments.
 * Set VITE_API_URL for cross-origin production deployments.
 */
export const API_BASE_URL: string =
	(import.meta.env.VITE_API_URL as string | undefined) ?? '';
