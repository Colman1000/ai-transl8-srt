// build.ts
await Bun.build({
    entrypoints: ['./src/index.ts'],
    outdir: './dist',
    target: 'node', // Ensures compatibility with the broader ecosystem
});