import type { UserProfile } from './api';

// Reactive auth state using Svelte 5 runes
let user = $state<UserProfile | null>(null);
let isAuthenticated = $state(false);

export function getAuthState() {
	return {
		get user() { return user; },
		get isAuthenticated() { return isAuthenticated; },
		setUser(u: UserProfile | null) {
			user = u;
			isAuthenticated = u !== null;
		},
	};
}
