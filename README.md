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
RESEND_API_KEY=...            # for outbound email
EMAIL_FROM="RaJA <no-reply@info.raja-international.com>"
PUBLIC_APP_URL=https://your.app.host # used to build pass links
ENTRY_JWT_SECRET=long-random-secret # used to sign pass tokens
ENTRY_ADMIN_PIN=123456              # presented by admin at entrance
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

- `send_payment_confirmation` – send payment confirmation email
- `entry_pass` – actions:
  - `generate_link` { row_hash, baseUrl? }
  - `send_email` { row_hash, baseUrl?, from? }
  - `resolve` { token }
  - `check_in` { token, pin }

In the UI (admin): under Paid participants, use "Send entry pass" per row or "Send all entry passes".
