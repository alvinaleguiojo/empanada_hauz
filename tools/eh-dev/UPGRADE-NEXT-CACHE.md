# Next upgrade note

This branch intentionally does not modify `package-lock.json` because dependency resolution must be produced by npm from the new Web dependency declaration.

Before merging, run from the repository root:

```bash
npm install
npm run build:clean
npm run build
npm run build
```

Commit the resulting `package-lock.json` update with the dependency upgrade. Do not merge this branch until the lockfile has been regenerated and the production build succeeds.
