import {build} from 'esbuild';
await build({entryPoints:['src/extension.mjs'],outfile:'dist/extension.cjs',bundle:true,platform:'node',format:'cjs',external:['vscode']});
await build({entryPoints:['src/server.mjs'],outfile:'dist/server.mjs',bundle:true,platform:'node',format:'esm',banner:{js:"import {createRequire} from 'node:module'; const require=createRequire(import.meta.url);"}});
