import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(here);
const build = path.join(here, '.build');
const payload = path.join(build, 'payload');
const downloads = path.join(build, 'downloads');
await fs.mkdir(downloads, {recursive: true});
await fs.mkdir(payload, {recursive: true});
function run(exe, args, cwd = here) {
  return new Promise((resolve, reject) => {
    const p = spawn(exe, args, {cwd, env: {...process.env, VITE_APP_NAME:'Lox Billiard POS'}, stdio: 'inherit', windowsHide: true});
    p.on('error', reject);
    p.on('exit', code => code === 0 ? resolve() : reject(new Error(`${exe} exited ${code}`)));
  });
}
async function json(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Download metadata failed: ${url} (${r.status})`);
  return r.json();
}
const lockPath = path.join(here, 'runtimes.json');
let lock;
try { lock = JSON.parse(await fs.readFile(lockPath, 'utf8')); }
catch (e) {
  if (e.code !== 'ENOENT') throw e;
  const [php, maria, caddy] = await Promise.all([
    json('https://windows.php.net/downloads/releases/releases.json'),
    json('https://downloads.mariadb.org/rest-api/mariadb/11.4/'),
    json('https://api.github.com/repos/caddyserver/caddy/releases/latest')
  ]);
  const phpZip = php['8.5']['nts-vs17-x64'].zip;
  const mariaRelease = Object.values(maria.releases)[0];
  const mariaZip = mariaRelease.files.find(f => f.file_name.endsWith('-winx64.zip'));
  const caddyZip = caddy.assets.find(f => f.name.endsWith('_windows_amd64.zip'));
  const sums = await (await fetch(caddy.assets.find(f => f.name.endsWith('_checksums.txt')).browser_download_url)).text();
  const checksum = sums.split('\n').find(l => l.includes(caddyZip.name))?.split(/\s+/)[0];
  if (!checksum) throw new Error('Missing Caddy checksum');
  lock = {
    php: {version: php['8.5'].version, url: `https://windows.php.net/downloads/releases/${phpZip.path}`, sha256: phpZip.sha256},
    mariadb: {version: mariaRelease.release_id, url: mariaZip.file_download_url.replace('http:', 'https:'), sha256: mariaZip.checksum.sha256sum},
    caddy: {version: caddy.tag_name, url: caddyZip.browser_download_url, [checksum.length === 128 ? 'sha512' : 'sha256']: checksum},
    vc: {url: 'https://aka.ms/vs/17/release/vc_redist.x64.exe'}
  };
  await fs.writeFile(lockPath, JSON.stringify(lock, null, 2) + '\n');
}
await Promise.all(Object.entries(lock).map(async ([name, item]) => {
  const target = path.join(downloads, name === 'vc' ? 'vc_redist.x64.exe' : `${name}.zip`);
  let bytes;
  try { bytes = await fs.readFile(target); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  if (!bytes) {
    console.log(`Downloading ${name} ${item.version ?? ''}...`);
    const response = await fetch(item.url);
    if (!response.ok) throw new Error(`Download failed: ${name} (${response.status})`);
    bytes = Buffer.from(await response.arrayBuffer());
    await fs.writeFile(target, bytes);
  }
  const sha = crypto.createHash('sha256').update(bytes).digest('hex');
  if (item.sha256 && sha !== item.sha256) throw new Error(`${name}: checksum mismatch`);
  if (item.sha512 && crypto.createHash('sha512').update(bytes).digest('hex') !== item.sha512) throw new Error(`${name}: checksum mismatch`);
  if (name === 'vc') {
    // Verify the Microsoft Authenticode signature before accepting this redistributable.
    await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
      `$s=Get-AuthenticodeSignature -LiteralPath '${target.replaceAll("'", "''")}'; if ($s.Status -ne 'Valid' -or $s.SignerCertificate.Subject -notmatch 'Microsoft Corporation') { throw 'Invalid Microsoft runtime signature' }`]);
    if (!item.sha256) { item.sha256 = sha; await fs.writeFile(lockPath, JSON.stringify(lock, null, 2) + '\n'); }
    await fs.copyFile(target, path.join(payload, 'vc_redist.x64.exe'));
    return;
  }
  const extract = path.join(build, `unpack-${name}`);
  try { await fs.access(path.join(extract, '.complete')); }
  catch {
    console.log(`Extracting ${name}...`);
    await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
      `Expand-Archive -LiteralPath '${target.replaceAll("'", "''")}' -DestinationPath '${extract.replaceAll("'", "''")}' -Force`]);
    await fs.writeFile(path.join(extract, '.complete'), 'ok');
  }
  const source = name === 'mariadb' ? path.join(extract, `mariadb-${item.version}-winx64`) : extract;
  await fs.cp(source, path.join(payload, name), {recursive: true,
    filter: p => !p.endsWith('.complete') && !p.endsWith('.pdb')});
  console.log(`${name} ready (checksum verified).`);
}));

const stage = path.join(payload, 'app');
// Unlink the build junction before clearing, so the project's node_modules is never followed.
try { await fs.unlink(path.join(stage, 'node_modules')); } catch (e) { if (e.code !== 'ENOENT') throw e; }
// Stage from empty: a reused directory would ship files that no longer exist in the project.
await fs.rm(stage, {recursive: true, force: true});
await fs.mkdir(stage, {recursive: true});
for (const name of ['app','bootstrap','config','database','public','resources','routes','vendor','artisan','composer.json','composer.lock','package.json','package-lock.json','vite.config.ts','tsconfig.json']) {
  await fs.cp(path.join(root, name), path.join(stage, name), {recursive: true,
    filter: p => {
      const rel = path.relative(root, p).replaceAll('\\','/');
      return !/^public\/(hot|build|storage)(\/|$)/.test(rel) && !/^bootstrap\/cache\//.test(rel)
        && !/\.(sqlite|sql)$/.test(rel);
    }});
}
for (const rel of ['bootstrap/cache','storage/app/private','storage/app/public','storage/framework/cache/data','storage/framework/sessions','storage/framework/views','storage/logs']) {
  await fs.mkdir(path.join(stage, rel), {recursive: true});
}
// Desktop-only bootstrap changes: live source and its .env are never edited/copied.
const bootstrapPath = path.join(stage, 'bootstrap/app.php');
let bootstrap = await fs.readFile(bootstrapPath, 'utf8');
bootstrap = bootstrap.replace('return Application::configure(', '$app = Application::configure(');
bootstrap += `\nif ($desktopData = getenv('LOX_DATA_DIR')) {\n    $app->addAbsoluteCachePathPrefix($desktopData);\n    $app->useStoragePath($desktopData.'/storage');\n    $app->useEnvironmentPath($desktopData);\n}\nreturn $app;\n`;
await fs.writeFile(bootstrapPath, bootstrap);
const providerPath = path.join(stage, 'app/Providers/AppServiceProvider.php');
const provider = await fs.readFile(providerPath, 'utf8');
await fs.writeFile(providerPath, provider.replace("if (app()->isProduction()) {", "if (app()->isProduction() && ! getenv('LOX_DATA_DIR')) {"));
// A service worker is useful on the website, but the desktop loads local assets directly.
const frontendPath = path.join(stage, 'resources/js/app.tsx');
let frontend = await fs.readFile(frontendPath, 'utf8');
frontend = frontend.replace("import { registerSW } from 'virtual:pwa-register';", '');
frontend = frontend.replace(/registerSW\(\{\s*immediate: true,?\s*\}\);?/, '');
await fs.writeFile(frontendPath, frontend);
try { await fs.symlink(path.join(root, 'node_modules'), path.join(stage, 'node_modules'), 'junction'); }
catch (e) { if (e.code !== 'EEXIST') throw e; }
await run('node', [path.join(root,'node_modules/vite/bin/vite.js'), 'build'], stage);
// Remove only the build junction, never its target. All application dependencies are in vendor.
await fs.unlink(path.join(stage, 'node_modules'));
const ini = `opcache.enable=0\nopcache.enable_cli=0\ndate.timezone=UTC\nmemory_limit=512M\nmax_execution_time=120\ndisplay_errors=Off\nlog_errors=On\ncgi.force_redirect=0\nvariables_order=EGPCS\nexpose_php=Off\n`;
await fs.writeFile(path.join(payload, 'php', 'php.ini'), ini);
await fs.copyFile(lockPath, path.join(payload, 'runtimes.json'));
console.log('Desktop payload ready. No live source files or database records were changed.');
