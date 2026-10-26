// Static release hygiene check, generated with OpenAI Codex. Not a security audit.
import {readdir,readFile,lstat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root=fileURLToPath(new URL('../',import.meta.url));
const allowed=new Set([
  '.gitignore','README.md','README.en.md','LICENSE','SECURITY.md','DISCLAIMER.md','PUBLISHING.md',
  'manifest.json','package.json','background.js','panel.html','panel.js','adapter.mjs',
  'core.mjs','flow.mjs','queue.mjs','runtime.mjs','watchdog.mjs','tests.mjs',
  'scripts/check-release.mjs'
]);
const errors=[];
const texts=new Map();
async function walk(directory,relative=''){
  for(const entry of await readdir(directory,{withFileTypes:true})){
    const name=relative?relative+'/'+entry.name:entry.name;
    if(!relative&&entry.name==='.git')continue;
    const absolute=path.join(directory,entry.name);
    const stat=await lstat(absolute);
    if(stat.isSymbolicLink()){errors.push(name+': symbolic links are not allowed in the release');continue;}
    if(entry.isDirectory()){
      if(name!=='scripts'){errors.push(name+': unexpected directory; remove local data from the release');continue;}
      await walk(absolute,name);continue;
    }
    if(!entry.isFile()||!allowed.has(name)){errors.push(name+': unexpected release file');continue;}
    texts.set(name,await readFile(absolute,'utf8'));
  }
}
await walk(root);
for(const name of allowed)if(!texts.has(name))errors.push(name+': required release file is missing');
const patterns=[
  ['absolute local drive path',/\b[A-Za-z]:[\\/]/],
  ['local home directory',/(?:\/Users\/|\/home\/)[^\s/]+/],
  ['GitHub credential',/\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{30,})\b/],
  ['private key',/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['embedded URL credentials',/https?:\/\/[^\s/]+:[^\s/]+@/],
  ['literal secret assignment',/(?:api[_-]?key|password|secret)\s*[:=]\s*['"][^'"\r\n]{8,}['"]/i]
];
const localName=process.env.USERNAME||process.env.USER||'';
const genericAccounts=new Set(['root','user','admin','administrator','runner','node','codex','system']);
for(const [name,source] of texts){
  for(const [label,pattern] of patterns)if(pattern.test(source))errors.push(name+': possible '+label);
  if(localName.length>=3&&!genericAccounts.has(localName.toLowerCase())&&source.toLowerCase().includes(localName.toLowerCase()))errors.push(name+': contains the current local account name');
}
try{
  const manifest=JSON.parse(texts.get('manifest.json'));
  const pkg=JSON.parse(texts.get('package.json'));
  if(manifest.version!==pkg.version)errors.push('manifest/package version mismatch');
  if(pkg.license!=='MIT')errors.push('package license must match LICENSE');
  if(manifest.host_permissions?.length)errors.push('unexpected persistent host permissions');
}catch{errors.push('manifest.json or package.json is invalid');}
if(errors.length){
  for(const error of errors)console.error(error);
  process.exitCode=1;
}else console.log('Release check passed: '+texts.size+' allowed source/documentation files; no known local data patterns found. This is not a full security audit.');
