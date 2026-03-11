# Accounting Sample Web UI

A SvelteKit frontend for the [Accounting API](../). Exercises all core API functions: authentication, vault/encryption, accounts, and transactions.

## Prerequisites

- Node.js 18+
- The Accounting API backend running on `http://localhost:8080` (see parent directory)

## Setup

```sh
npm install
```

## Development

Start the backend first (from the parent directory):

```sh
docker-compose up -d
# or: cargo run
```

Then start the frontend dev server:

```sh
npm run dev
```

The Vite dev server (port 5173) proxies `/api`, `/health`, and `/deployment` requests to `http://localhost:8080` automatically. No environment variables needed for local development.

## Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `VITE_API_URL` | _(empty — uses relative URLs)_ | Override API base URL for cross-origin deployments |

For local development with the Vite proxy, leave `VITE_API_URL` unset. For production or when the API is on a different host:

```sh
VITE_API_URL=https://api.example.com npm run build
```

## Build

```sh
npm run build
npm run preview   # preview the production build locally
```

## Type Checking

```sh
npm run check
```

## What's Covered

- **Auth**: Register, login, logout, profile view, automatic JWT refresh on 401
- **Vault**: Zero-knowledge encryption setup, unlock, lock, status indicator
- **Accounts**: List (with filters), create, view, edit (optimistic locking), delete
- **Transactions**: List (with filters), create (context-dependent amount UX), split transactions with ledger entries, view, edit (optimistic locking), delete
- **Health**: API liveness and readiness status display
