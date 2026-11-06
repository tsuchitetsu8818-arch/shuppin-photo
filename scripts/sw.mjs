import { readdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const files = (await readdir("dist", { recursive: true })).filter(
  (f) => /\.(html|js|css|png|webmanifest)$/.test(f) && f !== "sw.js",
);
const hash = createHash("sha256");
hash.update(await readFile("scripts/sw.mjs"));
for (const f of files) hash.update(await readFile("dist/" + f));
const version = hash.digest("hex").slice(0, 12);
// A build-specific complete shell prevents mixed assets. Never force-reload an editor.
await writeFile(
  "dist/sw.js",
  `const CACHE='shuppin-v1-${version}';
const FILES=${JSON.stringify(["./", ...files.map((f) => "./" + f)])};
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('shuppin-')&&k!==CACHE).map(k=>caches.delete(k)))));});
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method!=='GET'||u.origin!==self.location.origin||!u.href.startsWith(self.registration.scope))return;e.respondWith(caches.open(CACHE).then(async c=>{if(e.request.mode==='navigate')return (await c.match('./'))||fetch(e.request);return (await c.match(e.request,{ignoreVary:true}))||fetch(e.request);}));});
`,
);
