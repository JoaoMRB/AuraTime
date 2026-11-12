// Bundles the service and the shared screen code (../src/app/services/screen) into one file.
// The two native modules stay external: they are loaded from node_modules at run time.
import { build } from 'esbuild';

await build({
  entryPoints: ['src/main.ts'],
  outfile: 'dist/aura-time-display.mjs',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  external: ['serialport', '@napi-rs/canvas'],
  logLevel: 'info'
});
