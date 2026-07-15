# Slidesmith

Slidesmith creates on-brand TikTok/Instagram carousel slideshows and renders them in the browser. The frontend remains React + Vite; all backend state, authentication, files, and active integrations run in Convex.

## Architecture

- **Convex Auth** — password sign-in restricted by `ALLOWED_USER_EMAIL`.
- **Convex Database** — owner-scoped projects, image packs, images, slideshows, slides, and settings.
- **Convex File Storage** — library images and temporary rendered PNG files.
- **Convex Actions** — OpenRouter generation with secrets kept out of the browser and database.
- **React + Vite** — existing dashboard, editor, browser-side 1080×1920 rendering, queue, and library views.

Post-bridge publishing is currently product-disabled. Its dormant backend module is guarded by `POST_BRIDGE_ENABLED=true`, so it cannot be invoked accidentally. Schedule/Results and publishing controls are hidden while the feature is disabled. A future local video export can replace this flow.

## Local setup

```bash
npm install
CONVEX_AGENT_MODE=anonymous npx convex dev --once
npx @convex-dev/auth --skip-git-check --web-server-url http://localhost:5173
```

Configure the deployment. Use the email that should be the only account allowed to sign up and sign in:

```bash
npx convex env set ALLOWED_USER_EMAIL owner@example.com
npx convex env set OPENROUTER_API_KEY your_openrouter_key
```

Then start Convex and Vite together:

```bash
npm run dev
```

Open the printed Vite URL. On first use choose **Create account** and use exactly the email configured in `ALLOWED_USER_EMAIL`; subsequent visits use **Sign in**.

## Bundled image migration

The old static background collection is retained only as a one-time source. In **Settings → Background packs**, click **Import bundled library to Convex Storage**. The authenticated browser uploads the JPG files to Convex Storage and creates `imagePacks`/`images` records. Re-running the import is safe: duplicate records are detected and duplicate uploaded files are deleted.

New image uploads follow the same Storage pattern: request an authenticated upload URL, upload the binary file, then register its `storageId` in the owner-scoped `images` table.

## Legacy JSON migration

The Express backend and `~/.slidesmith/config.json` / `queue.json` persistence are retired. `convex/migrations.ts` exposes the authenticated, idempotent `migrations.importLegacyData` mutation for project and queue data. It intentionally rejects API keys; secrets must be set as Convex environment variables.

The legacy input is bounded to 100 projects, 200 slideshows, and 100 slides per slideshow. Legacy IDs are retained for idempotency. The existing local project files are not read automatically by the app.

## Production

Link the repo to a Convex project, configure the same environment variables on the production deployment, initialize production Auth keys, deploy Convex, and build the frontend:

```bash
npx @convex-dev/auth --prod --skip-git-check --web-server-url https://your-app.example
npx convex deploy
npm run build
```

Deploy `dist/` to any static host and provide its production `VITE_CONVEX_URL` during the build.

## Validation

```bash
npm test
npm run lint
npm run build
CONVEX_AGENT_MODE=anonymous npx convex dev --once
```

Tests cover authentication, the allowlist, owner-scoped project access, and rejection of a second identity token.

## License

[PolyForm Noncommercial 1.0.0](./LICENSE)
