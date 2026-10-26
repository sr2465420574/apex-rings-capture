import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {canonical,allowedURL,cleanName,csv,cropBox,needsCapture,SETTINGS_VERSION} from './core.mjs';
import {pageTask} from './adapter.mjs';
import {waitForAutomaticVerification} from './flow.mjs';
import {parseNextSources,sourcePlan,indexFilename,runSourcePlan} from './queue.mjs';
import {ExecutionGap,createActivityMonitor,boundedOperation,isMissingTabError,canResumeApprovedPlan} from './runtime.mjs';
import {CollectionWatchdog,watchdogDecision,WATCH_KEY,WATCH_EVENTS,ALARM_NAME} from './watchdog.mjs';
const origin='https://apexlegendsstatus.com';
test('same origin grant and deceptive domains',()=>{
  assert.equal(allowedURL(origin+'/algs/game/a',origin),true);
  for(const url of ['https://fakeapexlegendsstatus.com/algs','https://apexlegendsstatus.com.evil.org/algs','http://apexlegendsstatus.com/algs','https://mirg.apexlegendsstatus.com/algs'])assert.equal(allowedURL(url,origin),false);
});
test('canonical keeps meaningful query',()=>{
  assert.equal(canonical(origin+'/a?v=1#tab'),origin+'/a?v=1');
  assert.throws(()=>canonical('javascript:alert(1)'));
});
test('download path cannot contain separators',()=>{
  assert.equal(cleanName('../A\\B?'), '.._A_B_');
  assert.equal(cleanName('...'),'game');
});
test('CSV quotes unicode, newlines and commas',()=>{
  const result=csv([{name:'决赛,"1"\n第二行',error:'timeout'}]);
  assert.ok(result.startsWith('\ufeff'));
  assert.ok(result.includes('"决赛,""1""\n第二行"'));
});
test('crop accounts for display scaling',()=>{
  assert.deepEqual(cropBox({x:100,y:50,width:600,height:600},{width:1920,height:1080},3840,2160),{x:200,y:100,width:1200,height:1200});
});
test('crop rejects clipping, aspect mismatch and blank bounds',()=>{
  for(const clip of [{x:-2,y:0,width:600,height:600},{x:1600,y:0,width:600,height:600},{x:0,y:0,width:600,height:400},{x:0,y:0,width:0,height:0}])assert.throws(()=>cropBox(clip,{width:1920,height:1080},1920,1080));
  assert.throws(()=>cropBox({x:0,y:0,width:600,height:600},{width:1920,height:1080},1920,2160));
});
test('verification stops before any map or checkbox interaction',()=>{
  globalThis.location={pathname:'/algs/game/a'};
  globalThis.document={body:{innerText:'Checking your browser… Verify you are human'},querySelectorAll(){throw Error('must not interact');}};
  for(const action of ['configure','discover','state','fit'])assert.equal(pageTask(action).blocked,true);
});
test('restricted access stops before configuration',()=>{
  globalThis.location={pathname:'/algs/game/a'};
  globalThis.document={body:{innerText:'Limited data available'},querySelectorAll(){throw Error('must not interact');}};
  assert.equal(pageTask('configure').blocked,true);
});
test('unknown DOM cannot produce successful map state',()=>{
  globalThis.location={pathname:'/algs/game/a'};
  globalThis.document={body:{innerText:'All rings'},querySelectorAll(){return [];}};
  assert.ok(pageTask('state').error);
  assert.ok(pageTask('configure').error);
});
test('extension has no broad hosts, debugger or cookie permissions',()=>{
  const m=JSON.parse(readFileSync(new URL('manifest.json',import.meta.url)));
  assert.deepEqual(m.permissions,['activeTab','scripting','storage','downloads','alarms']);
  assert.equal(m.host_permissions,undefined);
  assert.equal(m.manifest_version,3);
});

function toolbar({bare=false,hiddenDuplicate=false,missing=''}={}) {
  globalThis.location={pathname:'/algs/game/a'};
  globalThis.getComputedStyle=e=>({visibility:e.hidden?'hidden':'visible'});
  const defaults={'Next ring':true,'All rings':true,'Care packages':true,'Respawn beacons':true,Heatmap:false,Pathing:true};
  const inputs=Object.entries(defaults).filter(([name])=>name!==missing).map(([name,checked])=>({
    name,type:'checkbox',checked,disabled:false,labels:bare?[]:[{textContent:name}],
    getClientRects(){return [{}];},getAttribute(){return null;},
    matches(){return true;},querySelector(){return null;},click(){this.checked=!this.checked;}
  }));
  const select={value:'full',events:[],options:[{value:'full',textContent:'Full player info on map'},{value:'hidden',textContent:'All players hidden'}],
    getClientRects(){return this.hidden?[]:[{}];},dispatchEvent(e){this.events.push(e.type);}};
  const root={textContent:'Next ring All rings Care packages Respawn beacons Heatmap Pathing',
    querySelectorAll(){return inputs;},parentElement:null};
  select.parentElement=root;
  for(let i=0;i<inputs.length;i++) {
    inputs[i].parentElement=root;
    inputs[i].nextSibling={nodeType:3,textContent:' '+inputs[i].name+' ',nextSibling:inputs[i+1]};
  }
  const selects=hiddenDuplicate?[select,{...select,hidden:true}]:[select];
  globalThis.document={body:{innerText:root.textContent},querySelectorAll(q){return q==='select'?selects:inputs;}};
  return {inputs,select,defaults};
}
test('toolbar enables all rings and hides distracting overlays',()=>{
  const {inputs,select}=toolbar();
  const result=pageTask('configure');
  assert.equal(result.ok,true);assert.equal(result.changed,true);assert.equal(select.value,'hidden');
  assert.deepEqual(select.events,['input','change']);
  assert.deepEqual(Object.fromEntries(inputs.map(c=>[c.name,c.checked])),{'Next ring':true,'All rings':true,'Care packages':false,'Respawn beacons':false,Heatmap:false,Pathing:false});
  assert.equal(pageTask('configure').changed,false);
});
test('bare text after checkboxes works without label elements',()=>{
  toolbar({bare:true});assert.equal(pageTask('configure').ok,true);
});
test('hidden mobile select does not make toolbar ambiguous',()=>{
  toolbar({hiddenDuplicate:true});assert.equal(pageTask('configure').ok,true);
});
test('missing checkbox fails before any partial settings mutation',()=>{
  const {select,inputs}=toolbar({missing:'Pathing'});
  assert.ok(pageTask('configure').error);
  assert.equal(select.value,'full');assert.equal(inputs.find(c=>c.name==='Care packages').checked,true);
});
test('read-only screenshot gate rejects defaults without changing them',()=>{
  const {select}=toolbar();assert.ok(pageTask('settings').error);assert.equal(select.value,'full');
  pageTask('configure');assert.equal(pageTask('settings').ok,true);
});
test('settings are reconciled after a delayed reset from replay loading',()=>{
  const {select,inputs}=toolbar();pageTask('configure');
  select.value='full';inputs.find(c=>c.name==='Pathing').checked=true;
  assert.ok(pageTask('settings').error);
  assert.equal(pageTask('configure').changed,true);assert.equal(pageTask('settings').ok,true);
});
test('page handler reverting an earlier option is detected before screenshot',()=>{
  const {inputs}=toolbar();
  inputs.find(c=>c.name==='Pathing').click=function(){this.checked=!this.checked;inputs.find(c=>c.name==='All rings').checked=false;};
  assert.match(pageTask('configure').error,/All rings/);
});
function waitingFixture(sequence) {
  let clock=0,calls=0;
  return {probe:async()=>{const value=sequence[Math.min(calls++,sequence.length-1)];if(value instanceof Error)throw value;return value;},
    options:{now:()=>clock,sleep:async ms=>{clock+=ms;}},clock:()=>clock,calls:()=>calls};
}
test('automatic verification waits two seconds and resumes without user input',async()=>{
  const f=waitingFixture([{blocked:true,verification:true},{blocked:true,verification:true},{ok:true}]);
  const result=await waitForAutomaticVerification(f.probe,f.options);
  assert.equal(result.data.ok,true);assert.equal(result.waitedMs,2000);assert.equal(f.calls(),3);
});
test('hard permission failure is returned immediately, never treated as verification',async()=>{
  const f=waitingFixture([{blocked:true,error:'Access denied'}]);
  const result=await waitForAutomaticVerification(f.probe,f.options);
  assert.equal(result.data.blocked,true);assert.equal(result.waitedMs,0);assert.equal(f.calls(),1);
});
test('automatic verification timeout is bounded',async()=>{
  const f=waitingFixture([{blocked:true,verification:true}]);
  await assert.rejects(waitForAutomaticVerification(f.probe,{...f.options,timeoutMs:2500}),/等待超时/);
  assert.equal(f.clock(),2500);
});
test('stop cancels passive wait at next poll',async()=>{
  const f=waitingFixture([{blocked:true,verification:true}]);
  await assert.rejects(waitForAutomaticVerification(f.probe,{...f.options,shouldStop:()=>f.clock()>=1000}),/已请求暂停/);
  assert.equal(f.calls(),1);
});
test('a document reload during verification is tolerated',async()=>{
  const f=waitingFixture([{verification:true},Error('The frame was removed'),{ok:true}]);
  const result=await waitForAutomaticVerification(f.probe,f.options);
  assert.equal(result.data.ok,true);assert.equal(result.waitedMs,2000);
});
test('injection permission errors are not retried',async()=>{
  const f=waitingFixture([{verification:true},Error('Cannot access contents of url')]);
  await assert.rejects(waitForAutomaticVerification(f.probe,f.options),/Cannot access/);
  assert.equal(f.calls(),2);
});
test('legacy successful screenshots must be recaptured with correct settings',()=>{
  assert.equal(needsCapture({status:'success'}),true);
  assert.equal(needsCapture({status:'success',settingsVersion:1}),true);
  assert.equal(needsCapture({status:'success',settingsVersion:SETTINGS_VERSION}),false);
  assert.equal(needsCapture({status:'failed',settingsVersion:SETTINGS_VERSION}),true);
});

const apac=origin+'/algs/Y6-Split2/Pro-League/APAC_S/Overview#tab_replaysandbans';
const na=origin+'/algs/Y6-Split2/Pro-League/NA/Overview#tab_replaysandbans';
test('multi-source input handles blank lines, CRLF and duplicate fragments',()=>{
  assert.deepEqual(parseNextSources(' \r\n'+na+'\r\n'+na.replace('#tab_replaysandbans','#other')+'\n',origin),[na.replace('#tab_replaysandbans','#other')]);
  assert.deepEqual(sourcePlan(apac,[na,apac,na]),[apac,na]);
});
test('multi-source plan never expands authorization to other origins',()=>{
  for(const url of [na.replace(origin,'https://evil.org'),na.replace('https:','http:'),origin+'/algs/game/123','not a url'])assert.throws(()=>parseNextSources(url,origin));
});
test('CSV names separate regions, events, and query variants',()=>{
  assert.notEqual(indexFilename(apac),indexFilename(na));
  assert.notEqual(indexFilename(na),indexFilename(na.replace('Y6-Split2','Y6-Split1')));
  assert.notEqual(indexFilename(na),indexFilename(na.replace('#tab_replaysandbans','?v=2')));
  assert.equal(indexFilename(na),indexFilename(na.replace('#tab_replaysandbans','#other')));
});
test('current source is processed before automatically navigating to the next',async()=>{
  const events=[],plan={urls:[apac,na],index:0};
  await runSourcePlan(plan,{selectSource:async url=>events.push('open '+url),processSource:async url=>events.push('capture and CSV '+url),checkpoint:async()=>events.push('save '+plan.index+' '+plan.status)});
  assert.deepEqual(events,['save 0 running','open '+apac,'capture and CSV '+apac,'save 1 running','open '+na,'capture and CSV '+na,'save 2 running','save 2 complete']);
});
test('failure saving a source CSV keeps that source as the restart point',async()=>{
  const plan={urls:[apac,na],index:0};let visited=0;
  await assert.rejects(runSourcePlan(plan,{selectSource:async()=>{visited++;},processSource:async()=>{throw Error('CSV download interrupted');},checkpoint:async()=>{}}),/CSV download/);
  assert.equal(plan.index,0);assert.equal(plan.status,'paused');assert.equal(visited,1);
});
test('pause between sources resumes at next source, not the completed source',async()=>{
  const plan={urls:[apac,na],index:0};const processed=[];let stop=false;
  await assert.rejects(runSourcePlan(plan,{selectSource:async()=>{},processSource:async url=>{processed.push(url);stop=true;},checkpoint:async()=>{},shouldStop:()=>stop}),/已请求暂停/);
  assert.equal(plan.index,1);assert.equal(plan.status,'paused');
  await runSourcePlan(plan,{selectSource:async()=>{},processSource:async url=>processed.push(url),checkpoint:async()=>{}});
  assert.deepEqual(processed,[apac,na]);assert.equal(plan.status,'complete');
});
test('verification failure on next list stops before any of its games',async()=>{
  const plan={urls:[apac,na],index:0};const processed=[];
  await assert.rejects(runSourcePlan(plan,{selectSource:async url=>{if(url===na)throw Error('自动验证等待超时');},processSource:async url=>processed.push(url),checkpoint:async()=>{}}),/自动验证/);
  assert.deepEqual(processed,[apac]);assert.equal(plan.index,1);assert.equal(plan.status,'paused');
});
test('persisted last index produces no duplicate navigation',async()=>{
  const plan={urls:[apac,na],index:2};
  await runSourcePlan(plan,{selectSource:async()=>assert.fail('should not navigate'),processSource:async()=>assert.fail('should not capture'),checkpoint:async()=>{}});
  assert.equal(plan.status,'complete');
});
test('invalid checkpoint is rejected before starting any source',async()=>{
  await assert.rejects(runSourcePlan({urls:[na],index:-1},{checkpoint:async()=>assert.fail('invalid plan must not write')}),/断点无效/);
});
test('two-hour execution gap is classified as interruption, not missing map data',()=>{
  let clock=0;const activity=createActivityMonitor({now:()=>clock});
  clock=7200000;assert.throws(activity,ExecutionGap);
  clock+=1000;assert.doesNotThrow(activity);
});
test('normal replay loading and verification polls do not count as execution gaps',()=>{
  let clock=0;const activity=createActivityMonitor({now:()=>clock});
  for(let i=0;i<360;i++){clock+=1000;assert.doesNotThrow(activity);}
});
test('browser API that never returns is bounded rather than hanging indefinitely',async()=>{
  await assert.rejects(boundedOperation(()=>new Promise(()=>{}),'执行页面操作',5),/未返回/);
});
test('browser API result and explicit rejection are preserved',async()=>{
  assert.equal(await boundedOperation(async()=>42,'test',100),42);
  await assert.rejects(boundedOperation(async()=>{throw Error('real error');},'test',100),/real error/);
});
test('closed tab error is distinct from normal map loading failure',()=>{
  assert.equal(isMissingTabError(Error('No tab with id: 7.')),true);
  assert.equal(isMissingTabError(Error('map not found')),false);
});
test('only the same previously approved plan resumes without another sample confirmation',()=>{
  const plan={status:'paused',inputKey:'["NA"]',settingsVersion:2};
  assert.equal(canResumeApprovedPlan(plan,'["NA"]',2),true);
  assert.equal(canResumeApprovedPlan(plan,'["EMEA"]',2),false);
  assert.equal(canResumeApprovedPlan(plan,'["NA"]',3),false);
  assert.equal(canResumeApprovedPlan({...plan,status:'complete'},'["NA"]',2),false);
});
test('a delayed injection cannot change controls after the page has moved to another game',()=>{
  globalThis.location={href:origin+'/algs/game/new'};
  globalThis.document={get body(){throw Error('stale operation must not inspect or change DOM');}};
  assert.equal(pageTask('configure',origin+'/algs/game/old').stale,true);
});
test('keep-awake permission is optional and never granted implicitly',()=>{
  const m=JSON.parse(readFileSync(new URL('manifest.json',import.meta.url)));
  assert.deepEqual(m.optional_permissions,['power']);
  assert.equal(m.permissions.includes('power'),false);
});

function watchdogFixture(){
  let clock=0;const local={},session={},alarms=new Map(),updates=[],power=[];
  const extension='chrome-extension://unit/';
  const tabs=new Map([[7,{id:7,url:na,windowId:1}],[2,{id:2,url:extension+'panel.html?tab=7',windowId:2}],[3,{id:3,url:extension+'panel.html?tab=7',windowId:3}]]);
  const area=store=>({get:async key=>({[key]:structuredClone(store[key])}),set:async data=>Object.assign(store,structuredClone(data))});
  const browser={storage:{session:area(session),local:area(local)},runtime:{getURL:path=>extension+path},
    tabs:{get:async id=>{if(!tabs.has(id))throw Error('No tab with id: '+id);return structuredClone(tabs.get(id));},update:async(id,value)=>{updates.push({id,...value});Object.assign(tabs.get(id),value);return tabs.get(id);}},
    alarms:{get:async name=>alarms.get(name),create:async(name,value)=>alarms.set(name,value),clear:async name=>alarms.delete(name)},
    permissions:{contains:async()=>true},power:{requestKeepAwake:mode=>power.push(mode),releaseKeepAwake:()=>power.push('release')}};
  const watcher=new CollectionWatchdog(browser,{now:()=>clock});
  const message=(op,extra={})=>({op,targetTabId:7,controllerTabId:2,token:'lease-one',mode:'batch',...extra});
  const sender=()=>({url:tabs.get(2).url});
  return {watcher,browser,local,session,tabs,updates,power,alarms,message,sender,advance:ms=>{clock+=ms;},start:async(extra={})=>watcher.handle(message('start',extra),sender())};
}
test('independent watchdog registers an alarm and stays healthy with regular heartbeats for 30 minutes',async()=>{
  const f=watchdogFixture();assert.equal((await f.start()).ok,true);assert.ok(f.alarms.has(ALARM_NAME));
  for(let i=0;i<120;i++){f.advance(15000);assert.equal((await f.watcher.handle(f.message('beat'),f.sender())).ok,true);await f.watcher.check();}
  assert.equal(f.updates.length,0);assert.equal(f.session[WATCH_KEY].active,true);
});
test('frozen controller is reloaded by the background without changing saved game records',async()=>{
  const f=watchdogFixture();f.local['als-queue:'+origin]={records:[{id:'saved',status:'success'}]};await f.start();
  f.advance(121000);await f.watcher.check();
  assert.equal(f.updates.length,1);assert.equal(f.updates[0].id,2);
  assert.equal(new URL(f.updates[0].url).searchParams.get('resume'),'lease-one');
  assert.equal(f.session[WATCH_KEY].recovering,true);
  assert.equal(f.local['als-queue:'+origin].records[0].status,'success');
  assert.match(f.local[WATCH_EVENTS][0].message,/断点恢复/);
});
test('reloaded controller can validate its lease and restart the same batch',async()=>{
  const f=watchdogFixture();await f.start();f.advance(121000);await f.watcher.check();
  assert.equal((await f.watcher.handle(f.message('recover'),f.sender())).ok,true);
  assert.equal((await f.start()).ok,true);assert.equal(f.session[WATCH_KEY].recovering,false);
  assert.equal(f.session[WATCH_KEY].recoveries.length,1);
});
test('manual pause disables automatic recovery even if the controller later becomes stale',async()=>{
  const f=watchdogFixture();await f.start({keepAwake:true});
  await f.watcher.handle(f.message('end'),f.sender());f.advance(1200000);await f.watcher.check();
  assert.equal(f.updates.length,0);assert.equal(f.session[WATCH_KEY].active,false);assert.deepEqual(f.power,['display','release']);
});
test('closed original game tab is never reopened or replaced automatically',async()=>{
  const f=watchdogFixture();await f.start();f.tabs.delete(7);f.advance(121000);await f.watcher.check();
  assert.equal(f.updates.length,0);assert.equal(f.session[WATCH_KEY].active,false);
});
test('closing controller ends its lease and releases optional keep-awake',async()=>{
  const f=watchdogFixture();await f.start({keepAwake:true});await f.watcher.removed(2);
  assert.equal(f.session[WATCH_KEY].active,false);assert.ok(f.power.includes('release'));
});
test('watchdog recovery is limited to three attempts in ten minutes',async()=>{
  const f=watchdogFixture();await f.start();
  for(let i=0;i<4;i++){f.advance(121000);await f.watcher.check();}
  assert.equal(f.updates.length,3);assert.equal(f.session[WATCH_KEY].active,false);
  assert.match(f.session[WATCH_KEY].reason,/3 次上限/);
});
test('sample and discovery operations are not automatically restarted',async()=>{
  const f=watchdogFixture();await f.start({mode:'other'});f.advance(121000);await f.watcher.check();
  assert.equal(f.updates.length,0);assert.equal(f.session[WATCH_KEY].active,false);
});
test('unrelated webpage cannot register or control the extension watchdog',async()=>{
  const f=watchdogFixture();const response=await f.watcher.handle(f.message('start'),{url:na});
  assert.equal(response.ok,false);assert.equal(f.session[WATCH_KEY],undefined);
});
test('a second controller cannot take over a running batch',async()=>{
  const f=watchdogFixture();await f.start();
  const response=await f.watcher.handle(f.message('start',{controllerTabId:3,token:'second'}),{url:f.tabs.get(3).url});
  assert.equal(response.ok,false);assert.equal(f.session[WATCH_KEY].token,'lease-one');
});
test('stale end message cannot stop a newer run from the same controller',async()=>{
  const f=watchdogFixture();await f.start();await f.start({token:'lease-two'});
  assert.equal((await f.watcher.handle(f.message('end'),f.sender())).ok,false);
  assert.equal(f.session[WATCH_KEY].active,true);assert.equal(f.session[WATCH_KEY].token,'lease-two');
});
test('watchdog restores its alarm after background service worker restarts',async()=>{
  const f=watchdogFixture();await f.start();f.alarms.clear();
  const restarted=new CollectionWatchdog(f.browser);await restarted.ensureAlarm();
  assert.ok(f.alarms.has(ALARM_NAME));
});
test('recent heartbeat prevents watchdog recovery, an inactive lease is ignored',()=>{
  assert.equal(watchdogDecision({active:true,lastBeat:1000,mode:'batch'},120999),'healthy');
  assert.equal(watchdogDecision({active:false,lastBeat:0},999999),'inactive');
});
test('freeze lifecycle evidence is preserved without pretending it is a healthy heartbeat',async()=>{
  const f=watchdogFixture();await f.start();f.advance(60000);
  await f.watcher.handle(f.message('lifecycle',{event:'freeze'}),f.sender());
  assert.equal(f.session[WATCH_KEY].lastBeat,0);
  assert.equal(f.session[WATCH_KEY].lifecycle.event,'freeze');
  f.advance(61000);await f.watcher.check();assert.equal(f.updates.length,1);
  assert.match(f.local[WATCH_EVENTS][0].message,/freeze/);
});
