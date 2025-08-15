# New Simple ticketing

Vite + React + TypeScript + Tailwind CSS + Supabase.

## Setup

1. Install deps:

```bash
npm install
```

2. Configure environment variables in `.env`:

```bash
VITE_SUPABASE_URL=your-url
VITE_SUPABASE_ANON_KEY=your-anon-key
```

3. Start dev server:

```bash
npm run dev
```

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default tseslint.config([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      ...tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      ...tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      ...tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default tseslint.config([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

## Entry Pass feature

Edge Function `entry_pass` issues unique entry links and performs check-in with an admin PIN.

Required environment variables (Supabase Edge Function secrets):

```bash
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=... # or SERVICE_ROLE_KEY
SUPABASE_ANON_KEY=...         # used for verifying user token only
RESEND_API_KEY=...            # for outbound email
EMAIL_FROM="RaJA <no-reply@info.raja-international.com>"
# List of allowed sender identities (comma-separated). If set, any provided `from` must match one of these.
ALLOWED_FROM="RaJA <no-reply@info.raja-international.com>"
PUBLIC_APP_URL=https://your.app.host  # used to build pass links and CORS allow origin fallback
ENTRY_JWT_SECRET=long-random-secret   # used to sign pass tokens
ENTRY_ADMIN_PIN=123456               # presented by admin at entrance
# Optional: restrict who can call admin endpoints
ADMIN_EMAILS="admin@your.org,owner@your.org"  # only these Supabase Auth users can call admin actions
ADMIN_SECRET=some-strong-random      # optional bypass via x-admin-secret header (server-to-server only)
# Optional: CORS allowlist (comma-separated). If not set, defaults to PUBLIC_APP_URL origin, else '*'
CORS_ALLOW_ORIGINS="https://your.app.host,https://staging.your.app.host"
```

Database tables used:

```sql
-- Paid list (already used by app)
-- create table paidparticipants (
--   row_hash text primary key,
--   row_number int,
--   headers jsonb,
--   data jsonb
-- );

-- Check-in records
create table if not exists checkins (
  row_hash text primary key,
  checked_in_at timestamptz not null default now(),
  checked_in_by text
);
```

Endpoints (Edge Functions):

- `send_payment_confirmation` – send payment confirmation email (admin-only)
- `entry_pass` – actions:
  - `generate_link` { row_hash, baseUrl? } (admin-only)
  - `send_email` { row_hash, baseUrl?, from? } (admin-only)
  - `resolve` { token } (public with valid token)
  - `check_in` { token, pin } (public PIN; rate limited)
- `sync_participants` – imports or clears data from Google Sheets (admin-only)

### Security notes

- Admin-only actions require a valid Supabase Auth access token in the `Authorization: Bearer <token>` header, matching a user email in `ADMIN_EMAILS`. Alternatively provide `x-admin-secret: ADMIN_SECRET` for server-to-server calls.
- Do not expose service role keys to the client. Only the Edge Functions use service role keys.
- Set `CORS_ALLOW_ORIGINS` and `PUBLIC_APP_URL` to restrict cross-origin calls.
- Ensure RLS policies on `sheet_participants`, `paidparticipants`, and `checkins` allow only authenticated admins as needed.
