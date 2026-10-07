import fs from "node:fs";
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(process.env.PLAYWRIGHT_PACKAGE || import.meta.url);
const {chromium}=require('playwright');
const browser=await chromium.launch({headless:true,channel:process.env.BROWSER_CHANNEL || 'msedge'});
const page=await browser.newPage({viewport:{width:1440,height:960}}), errors=[];
page.on('pageerror',e=>errors.push(e.message));
const style={version:8,sources:{land:{type:'geojson',attribution:'Test map fixture · © OpenStreetMap contributors',data:{type:'FeatureCollection',features:[{type:'Feature',properties:{},geometry:{type:'Polygon',coordinates:[[[-11,51],[-5.5,51],[-5.5,56],[-11,56],[-11,51]]]}},{type:'Feature',properties:{},geometry:{type:'Polygon',coordinates:[[[-5,50],[2,50],[2,60],[-5,60],[-5,50]]]}}]}}},layers:[{id:'water',type:'background',paint:{'background-color':'#b5d6e6'}},{id:'land',type:'fill',source:'land',paint:{'fill-color':'#eef0df'}}]};
const live = process.env.MAP_TEST_LIVE === '1';
if (!live) await page.route('**/test-style.json',r=>r.fulfill({json:style}));
if (!live) await page.route('https://api.maptiler.com/geocoding/**',r=>r.fulfill({json:{features:[{center:[-6.2603,53.3498],place_name:'Dublin test result'}]}}));
try {
  await page.goto(process.env.TEST_URL || 'http://127.0.0.1:5174');
  await page.waitForFunction(()=>!document.querySelector('.loading-status'),{},{timeout:35000});
  assert.match(await page.locator('.map-credit').innerText(),/腾讯地图/);
  await page.locator('.member-select').filter({hasText:'小溪'}).click();
  await page.waitForFunction(()=>document.querySelector('.maplibregl-canvas'));
  const alignment=await page.evaluate(async()=>{
    const {createMap}=await import('/src/maps.ts');const host=document.createElement('div');host.style.cssText='position:fixed;left:-20000px;width:800px;height:600px';document.body.append(host);
    const adapter=await createMap(host,{lat:53.3498,lng:-6.2603,zoom:10},'overseas');await adapter.ready();
    const p=adapter.project(53.3498,-6.2603),q=adapter.project(53.3498,-6.1603);const view=adapter.getView();const canvas=host.querySelector('canvas');canvas.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',keyCode:39,which:39,shiftKey:true,bubbles:true}));canvas.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowUp',keyCode:38,which:38,shiftKey:true,bubbles:true}));await new Promise(r=>setTimeout(r,400));const qAfter=adapter.project(53.3498,-6.1603);adapter.destroy();host.remove();return {p,q,view,keyboardStable:Math.abs(q.x-qAfter.x)<.01&&Math.abs(q.y-qAfter.y)<.01};
  });
  assert.ok(Math.abs(alignment.p.x-400)<.01 && Math.abs(alignment.p.y-300)<.01);
  assert.ok(Math.abs((alignment.q.x-alignment.p.x)-256*2**10*.1/360)<.01);
  assert.equal(alignment.view.zoom,10);
  assert.ok(alignment.keyboardStable);
  await page.getByLabel('搜索区域').selectOption('overseas');await page.getByLabel('搜索地点').fill('Dublin');await page.getByRole('button',{name:'搜索',exact:true}).click();await page.getByText(/已找到：/).waitFor();
  await page.getByLabel('地图服务').selectOption('tencent');await page.getByLabel('地图服务').selectOption('overseas');await page.getByLabel('地图服务').selectOption('auto');
  await page.waitForFunction(()=>!document.querySelector('.loading-status'),{},{timeout:35000});
  assert.equal(await page.locator('.map-host').count(),1);
  await page.locator('.member-select').filter({hasText:'又派了个大星'}).click();
  await page.waitForFunction(()=>!document.querySelector('.loading-status'),{},{timeout:35000});
  assert.match(await page.locator('.map-credit').innerText(),/腾讯地图/);
  await page.getByLabel('保存为默认',{exact:true}).click();
  const snapshot=await page.evaluate(()=>JSON.parse(localStorage.getItem('beixi-default-v2')));assert.equal(snapshot.coordinateSystem,'WGS84');
  await page.reload();await page.waitForFunction(()=>!document.querySelector('.loading-status'),{},{timeout:35000});
  assert.equal(await page.locator('.member-row').count(),12);
  const result=await page.evaluate(async()=>{
    const {defaultMembers}=await import('/src/model.ts');const {prepareExport,renderExport,moveExportMember,resetExportLayout,exportBlob}=await import('/src/export.ts');
    const before=JSON.stringify(defaultMembers);const scene=await prepareExport(defaultMembers,{lat:36,lng:105,zoom:4},'smart');
    const canvas=document.createElement('canvas');renderExport(scene,canvas);const initial=scene.layers[1].positions[0];const previous={...initial};
    const moved=moveExportMember(scene,1,0,initial.x+15,initial.y+10);const fixedAnchor=initial.ax===previous.ax && initial.ay===previous.ay;resetExportLayout(scene);renderExport(scene,canvas);
    const blob=await exportBlob(canvas);const output={layers:scene.layers.length,credit:scene.credit,width:canvas.width,height:canvas.height,moved,fixedAnchor,reset:initial.x===previous.x&&initial.y===previous.y,unchanged:JSON.stringify(defaultMembers)===before,bytes:blob.size};
    document.body.appendChild(canvas);canvas.id='test-export';canvas.style.cssText='position:fixed;inset:0;width:100vw;height:auto;z-index:200;background:white';return output;
  });
  assert.equal(result.layers,2);assert.match(result.credit,/腾讯地图/);assert.match(result.credit,/OpenStreetMap/);assert.equal(result.width,2560);assert.equal(result.height,1800);assert.ok(result.moved&&result.fixedAnchor&&result.reset&&result.unchanged&&result.bytes>10000);
  fs.writeFileSync(live ? 'hybrid-live-export-preview.png' : 'hybrid-export-preview.png', Buffer.from(await page.locator('#test-export').evaluate(canvas=>canvas.toDataURL().split(',')[1]), 'base64'));await page.locator('#test-export').evaluate(el=>el.remove());
  const cancel=await page.evaluate(async()=>{const {defaultMembers}=await import('/src/model.ts');const {prepareExport}=await import('/src/export.ts');const c=new AbortController();const promise=prepareExport(defaultMembers,{lat:36,lng:105,zoom:4},'smart',c.signal);setTimeout(()=>c.abort(),80);try{await promise;return false;}catch(e){return e.name==='AbortError' && ![...document.querySelectorAll('body > div')].some(e=>e.style.left==='-20000px');}});assert.ok(cancel);
  await page.locator('.member-select').filter({hasText:'小溪'}).click();await page.waitForFunction(()=>!document.querySelector('.loading-status'),{},{timeout:35000});
  await page.setViewportSize({width:390,height:844});await page.waitForTimeout(400);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:'hybrid-mobile-preview.png'});
  const current=await page.evaluate(async()=>{const {defaultMembers}=await import('/src/model.ts');const {prepareExport}=await import('/src/export.ts');const scene=await prepareExport(defaultMembers,{lat:53.3498,lng:-6.2603,zoom:5},'current',undefined,'overseas');return {count:scene.layers[0].positions.length,credit:scene.credit};});
  assert.match(current.credit,/OpenStreetMap/);assert.ok(current.count>0);
  assert.deepEqual(errors,[]);console.log(live ? 'LIVE PROVIDERS' : 'FIXTURE', 'PASS auto/manual/rapid switching, search, zoom/projection and disabled keyboard rotation, mobile, save/reload; mixed smart export, 2560x1800, both credits, draggable/reset anchors, cancellation, current-view export',JSON.stringify(result));
} finally {await browser.close();}

