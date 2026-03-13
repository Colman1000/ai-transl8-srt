// build.ts
await Bun.build({
    entrypoints: ['./index.ts'],
    outdir: './dist',
    target: 'node', // Ensures compatibility with the broader ecosystem
});