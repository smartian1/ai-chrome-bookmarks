import { build } from 'esbuild';
import { cp, mkdir, rm } from 'node:fs/promises';
await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });
await cp('public', 'dist', { recursive: true });
await build({entryPoints:['src/worker.ts','src/ui.ts'],outdir:'dist',bundle:true,format:'esm',target:'chrome120'});
