import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
for (const dir of ['src','public','scripts','tests']) for (const file of readdirSync(dir).filter(name => /\.(mjs|js)$/.test(name))) {
  const result = spawnSync(process.execPath, ['--check', `${dir}/${file}`], { stdio: 'inherit' }); if (result.status) process.exit(result.status);
}
console.log('JavaScript syntax checks passed.');
