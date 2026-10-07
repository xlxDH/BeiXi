import fs from 'node:fs';
import ts from 'typescript';
import assert from 'node:assert/strict';
const url=(s)=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
const compile=(s)=>ts.transpileModule(s,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const coordinatesUrl=url(compile(fs.readFileSync('src/coordinates.ts','utf8').replace('import boundary from "./mainland-boundary.json";',`const boundary=${fs.readFileSync('src/mainland-boundary.json','utf8')};`)));
const c=await import(coordinatesUrl);
for(const [lat,lng] of [[22.5345,113.9345],[31.090054,121.613814],[24.4798,118.0894],[39.9,116.4],[20.04,110.34],[18.313372,109.542620]]) {
  assert.equal(c.providerFor(lat,lng),'tencent');
  const g=c.wgs84ToGcj02(lat,lng), w=c.gcj02ToWgs84(g.lat,g.lng);
  assert.ok(Math.abs(w.lat-lat)<1e-7 && Math.abs(w.lng-lng)<1e-7);
}
for(const [lat,lng] of [[53.3498,-6.2603],[37.56,126.97],[28.61,77.21],[21.02,105.83],[25.03,121.56],[22.28,114.16],[22.19,113.55],[47.91,106.88]]) {
  assert.equal(c.providerFor(lat,lng),'overseas');
  assert.deepEqual(c.wgs84ToGcj02(lat,lng),{lat,lng});
}
for(const [lat,lng] of [[38.914,121.6147],[37.5131,122.1204],[29.9853,122.2072]]) {
  assert.equal(c.providerFor(lat,lng),'tencent');
  const g=c.wgs84ToGcj02(lat,lng); assert.ok(Math.abs(g.lat-lat)>1e-5 && Math.abs(g.lng-lng)>1e-5);
  const w=c.gcj02ToWgs84(g.lat,g.lng); assert.ok(Math.abs(w.lat-lat)<1e-7 && Math.abs(w.lng-lng)<1e-7);
}
assert.equal(c.providerFor(53,-6,'tencent'),'tencent');
assert.equal(c.providerFor(31,121,'overseas'),'overseas');
assert.equal(c.normalizeLng(540),-180);
let modelSource=fs.readFileSync('src/model.ts','utf8').replace('from "./coordinates"',`from "${coordinatesUrl}"`).replace('import.meta.url','"http://localhost/src/model.ts"');
globalThis.location={origin:'http://localhost'};
const m=await import(url(compile(modelSource)));
const legacy={members:[{...m.defaultMembers[0],lat:22.5345,lng:113.9345},{...m.defaultMembers[1]}],view:{lat:31.2,lng:121.4,zoom:5},panelOpen:true,stackOpen:false};
const before=JSON.stringify(legacy), migrated=m.restoreSnapshot(legacy,true);
assert.equal(JSON.stringify(legacy),before);
assert.equal(migrated.coordinateSystem,'WGS84');
assert.notEqual(migrated.members[0].lng,legacy.members[0].lng);
assert.deepEqual(migrated.members[1],legacy.members[1]);
assert.deepEqual(m.restoreSnapshot(migrated),migrated);
assert.equal(m.restoreSnapshot(legacy),null);
assert.equal(m.restoreSnapshot({...migrated,mapMode:'invalid'}),null);
assert.notEqual(m.STORAGE_KEY,m.LEGACY_STORAGE_KEY);
for(const [lat,lng] of [[38.914,121.6147],[37.5131,122.1204],[29.9853,122.2072]]) {
  const source={...legacy,members:[{...legacy.members[0],lat,lng}]};
  const restored=m.restoreSnapshot(source,true);const back=c.wgs84ToGcj02(restored.members[0].lat,restored.members[0].lng);
  assert.ok(Math.abs(back.lat-lat)<1e-7&&Math.abs(back.lng-lng)<1e-7);
  assert.notEqual(restored.members[0].lng,lng);
}
console.log('PASS mainland/neighbor routing, manual override, coordinate round trips, legacy preservation, one-time WGS84 migration and schema validation');
