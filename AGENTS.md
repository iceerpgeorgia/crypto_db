# Repository Guidelines

This repository is a Next.js (App Router) application written in TypeScript with Prisma for data access. Use the commands and structure below to develop consistently.

## Project Structure & Module Organization
- `app/`: Route groups and server actions (e.g., `app/api/audit/route.ts`).
- `lib/`: Shared utilities (e.g., `lib/audit.ts`). Use path alias `@/` (e.g., `@/lib/auth`).
- `scripts/`: Dev helpers and maintenance scripts (e.g., `scripts/dev-with-logs.js`).
- `package.json`: Scripts and dependency definitions.

## Build, Test, and Development Commands
- `npm run dev`: Start Next.js in dev mode.
- `node scripts/dev-with-logs.js`: Dev server with optional log export to `Server_Logs.txt`.
- `npm run dev:logs` / `npm run dev:no-logs`: PowerShell variants to run dev with/without log export.
- `npm run build`: Production build (`.next/`).
- `npm start`: Start production server.
- `npm run prisma:migrate`: Run Prisma migrations (requires `prisma/schema.prisma`).
- `npm run prisma:generate`: Regenerate Prisma client.
- `npm run prisma:studio`: Open Prisma Studio.

## Coding Style & Naming Conventions
- TypeScript, 2‑space indentation, semicolons on, single quotes or consistent quotes.
- React components: PascalCase files and exports; prefer function components.
- Modules: named exports when possible; group related helpers in `lib/`.
- Paths: prefer `@/...` imports over deep relatives when available.

## Testing Guidelines
- No default unit test framework is configured. If adding tests, prefer Vitest or Jest.
- Place tests alongside sources as `*.test.ts(x)` or under `tests/` mirroring `app/` and `lib/`.
- Aim for coverage on server actions, data mappers, and critical UI logic.

## Commit & Pull Request Guidelines
- Commit messages: use Conventional Commits (e.g., `feat: add audit logging`, `fix: handle null userId`).
- PRs: include a clear summary, linked issues, and screenshots for UI changes. Note breaking changes.
- Keep diffs focused; avoid unrelated refactors. Update scripts/docs if behavior changes.

## Security & Configuration Tips
- Create `.env.local` for secrets (not committed). Common vars: `DATABASE_URL`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`.
- Example:
  ```env
  DATABASE_URL=postgres://user:pass@localhost:5432/app
  NEXTAUTH_URL=http://localhost:3000
  NEXTAUTH_SECRET=replace-me
  ```
- Never log secrets. Review `scripts/` before running in CI/production.

