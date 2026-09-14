# Module-level production caching

The Web production compiler is configured to use Turbopack production builds with persistent caching.

Requirements:

- Next.js 15.5+ for the experimental persistent production cache path.
- `next build --turbopack` for the Web production build.
- The `.next` directory must be preserved between successive builds for cache reuse.

The cache is owned by Turbopack, not by `eh-dev`. `eh-dev` remains responsible for workspace scheduling and its own workspace fingerprints. This avoids pretending that a wrapper-level hash is equivalent to compiler-level module reuse.

After upgrading dependencies, verify with:

```bash
npm install
npm run build:clean
npm run build
npm run build
```

The first production build is the cold build. The second can reuse Turbopack's persisted compiler work for unchanged modules.

If a fully clean production build is required, remove `.next` or run the clean build workflow after clearing the compiler cache.
