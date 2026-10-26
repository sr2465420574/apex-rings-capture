import {allowedURL,canonical,cleanName,csv,cropBox,SETTINGS_VERSION,needsCapture} from './core.mjs';
import {pageTask} from './adapter.mjs';
import {waitForAutomaticVerification} from './flow.mjs';
import {parseNextSources,sourcePlan,indexFilename,runSourcePlan} from './queue.mjs';
import {boundedOperation,createActivityMonitor,isMissingTabError,canResumeApprovedPlan} from './runtime.mjs';
import {WATCH_EVENTS} from './watchdog.mjs';
const $=id=>document.getElementById(id);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const tabId=Number(new URL(location.href).searchParams.get('tab'));
let origin, key, state={records:[],source:'',sampleId:''}, busy=false, stopped=false, expected='';
let verificationWaitMs=0, verificationSerial=0;
let queues={}, plan=null, queuesKey, planKey;
let preferences={}, preferencesKey, activity=()=>{};
let watchToken='', phase='等待操作';
class Pause extends Error {}
async function api(operation,label,timeout=20000){
  phase=label;
  activity();
  try{const result=await boundedOperation(operation,label,timeout);activity();return result;}
  catch(e){if(isMissingTabError(e))throw new Pause('原比赛标签页已关闭或失效，请在赛事网页重新点击扩展图标；已保留断点，不会反复重试');throw e;}
}
function log(message) {$('log').textContent+=new Date().toLocaleTimeString()+' '+message+'\n';$('status').textContent=message;}
async function persist(){
  if(state.source)queues[canonical(state.source)]=state;
  // Saving the checkpoint must not itself throw an execution-gap error during error recovery.
  await boundedOperation(()=>chrome.storage.local.set({[key]:state,[queuesKey]:queues,[planKey]:plan,[preferencesKey]:preferences}),'保存断点');
}
async function tabGuard(active=false) {
  const t=await api(()=>chrome.tabs.get(tabId),'读取比赛标签页');
  if(!t.url||!allowedURL(t.url,origin))throw new Pause('授权标签页已离开本站；返回原页面并重新点击扩展图标');
  if(active&&!t.active)throw new Pause('原网页不在前台，已暂停以避免截图到其他标签页');
  if(expected&&canonical(t.url)!==expected)throw new Pause('页面网址与当前比赛不符，已停止截图');
  return t;
}
async function task(action){
  if(stopped)throw new Pause('已请求暂停');
  const seconds=Math.max(5,Math.min(600,Number($('verifySeconds').value)||90));
  let result;
  try {
    result=await waitForAutomaticVerification(async()=>{
      await tabGuard();
      const frames=await api(()=>chrome.scripting.executeScript({target:{tabId},func:pageTask,args:[action,expected]}),'执行页面操作 '+action);
      if(!frames[0]?.result)throw Error('页面尚未返回数据');
      return frames[0].result;
    },{timeoutMs:seconds*1000,shouldStop:()=>stopped,
       onWaiting:()=>log('等待网站自动验证，最多 '+seconds+' 秒；不需要按回车'),
       onResumed:()=>log('验证提示已消失，继续加载并检查顶部选项')});
  }catch(e){if(/自动验证等待超时|已请求暂停/.test(e.message))throw new Pause(e.message);throw e;}
  verificationWaitMs+=result.waitedMs;
  if(result.verified)verificationSerial++;
  const data=result.data;
  if(!data)throw Error('页面尚未返回数据');
  if(data.blocked)throw new Pause(data.error);
  if(data.stale)throw new Pause(data.error);
  return data;
}
async function foreground(){await tabGuard();await api(()=>chrome.tabs.update(tabId,{active:true}),'切回比赛标签页');}
async function downloadBlob(blob, filename) {
  const url=URL.createObjectURL(blob);
  try {
    const id=await api(()=>chrome.downloads.download({url,filename,saveAs:false,conflictAction:'overwrite'}),'创建下载');
    for(let i=0;i<120;i++) {
      const [item]=await api(()=>chrome.downloads.search({id}),'检查下载状态');
      if(item?.state==='complete')return;
      if(item?.state==='interrupted')throw Error('下载被取消或中断：'+(item.error||''));
      await sleep(500);
    }
    throw Error('下载未在 60 秒内完成，请检查浏览器下载列表');
  } finally {URL.revokeObjectURL(url);}
}
async function discover({automatic=false}={}) {
  expected='';await foreground();
  const url=(await tabGuard()).url;
  expected=canonical(url);
  let last='',stable=0,result;
  const started=Date.now(), priorWait=verificationWaitMs;
  do {
    result=await task('discover');
    if(result.records.length)break;
    if(Date.now()-started-(verificationWaitMs-priorWait)>=120000)throw Error('赛事列表加载超时，找不到回放链接');
    await sleep(1000);
  }while(true);
  for(let i=0;i<100;i++) {
    result=await task('discover');
    const fingerprint=JSON.stringify(result.records.map(r=>r.url))+':'+result.height;
    stable=fingerprint===last?stable+1:0;last=fingerprint;
    if(stable>=4)break;
    if(i===99)throw Error('滚动收集超过安全上限，不能确认完整性');
    await task('scroll');await sleep(900);
  }
  if(!result.records.length)throw Error('当前页面找不到 Open interactive replay 链接，请回赛事列表收集');
  const old=new Map();
  for(const row of [...Object.values(queues).flatMap(q=>q.records||[]),...state.records]) {
    const prior=old.get(row.url);
    if(!prior||needsCapture(prior))old.set(row.url,row);
  }
  const unique=new Map();
  for(const r of result.records) {
    if(!allowedURL(r.url,origin))throw new Pause('发现跨域回放；此版本仅支持同源标签页，不扩大访问权限');
    r.url=canonical(r.url);
    const bytes=new TextEncoder().encode(r.url);
    const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('').slice(0,16);
    unique.set(r.url,old.get(r.url)||{...r,id:hash,status:'pending',attempts:0});
  }
  const saved=queues[canonical(url)];
  state={records:[...unique.values()],source:url,sampleId:saved?.sampleId||'',sampleVersion:saved?.sampleVersion||0};
  if(!automatic){$('approved').checked=false;plan=null;}
  await persist();log('已收集 '+state.records.length+' 场。'+(automatic?'按已确认的圈型设置继续采集。':'请核对场数，再采集样例。'));
}
async function openPage(url) {
  expected='';await tabGuard();
  if(!allowedURL(url,origin))throw new Pause('网址不是授权域名');
  await api(()=>chrome.tabs.update(tabId,{url,active:true}),'打开比赛页面');
  await sleep(500);
  for(let i=0;i<120;i++) {
    if(stopped)throw new Pause('已请求暂停');
    const t=await api(()=>chrome.tabs.get(tabId),'检查页面导航');
    if(t.status==='complete') {
      if(!t.url||!allowedURL(t.url,origin))throw new Pause('页面跳转到其他域名，已暂停');
      if(canonical(t.url)!==canonical(url))throw new Pause('页面发生意外跳转，已暂停');
      expected=canonical(url);return;
    }
    await sleep(1000);
  }
  throw Error('页面导航加载超时');
}
async function openReplay(row){return openPage(row.url);}
async function snapshot(data) {
  const t=await tabGuard(true);
  const raw=await api(()=>chrome.tabs.captureVisibleTab(t.windowId,{format:'png'}),'获取地图截图');
  await tabGuard(true);
  const img=await boundedOperation(async()=>createImageBitmap(await (await fetch(raw)).blob()),'解码截图');
  try {
    const box=cropBox(data.clip,data.viewport,img.width,img.height);
    const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=1024;
    canvas.getContext('2d').drawImage(img,box.x,box.y,box.width,box.height,0,0,1024,1024);
    return await boundedOperation(()=>new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('PNG 编码失败')),'image/png')),'编码 PNG');
  } finally {img.close();}
}
async function capture(row) {
  await openReplay(row);
  let reason='尚未加载', fitSteps=0, fingerprint='', stableAt=0;
  const started=Date.now(), priorWait=verificationWaitMs;
  while(true) {
    activity();
    if(Date.now()-started-(verificationWaitMs-priorWait)>=120000)break;
    // Pages can restore defaults after replay data arrives. Reconcile throughout loading.
    const result=await task('configure');
    if(result.error){reason=result.error;fingerprint='';stableAt=0;await sleep(1000);continue;}
    if(result.changed){log('已隐藏玩家并启用多阶段圈型，等待画面稳定');fingerprint='';stableAt=0;await sleep(1000);continue;}
    const configuredAt=verificationSerial;
    const data=await task('state');
    if(configuredAt!==verificationSerial){fingerprint='';stableAt=0;continue;}
    if(data.error){reason=data.error;await sleep(1000);continue;}
    if(data.clipped) {
      if(fitSteps++>=12)throw Error('缩小后仍未完整显示底图');
      const fit=await task('fit');
      if(fit.error)throw Error(fit.error);
      await sleep(700);continue;
    }
    if(data.rings<2){reason='尚未检测到多个白色 SVG 圈线，或网页需要适配';await sleep(1000);continue;}
    const blob=await snapshot(data);
    const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()))].join(',')+JSON.stringify(data);
    if(hash!==fingerprint){fingerprint=hash;stableAt=Date.now();}
    else if(Date.now()-stableAt>=3000) {
      const verify=await task('settings');if(verify.error){reason=verify.error;fingerprint='';stableAt=0;continue;}
      const final=await task('state');
      if(configuredAt!==verificationSerial){fingerprint='';stableAt=0;continue;}
      if(JSON.stringify(final)!==JSON.stringify(data))throw Error('截图前地图或圈线变化，请重试');
      // The retained blob was captured from the verified original tab with these same bounds.
      row.image='ApexRings/images/'+cleanName(row.name)+'__'+row.id+'.png';
      await downloadBlob(blob,row.image);
      row.status='success';row.rings=data.rings;row.error='';row.settingsVersion=SETTINGS_VERSION;
      $('preview').src=URL.createObjectURL(blob);$('preview').hidden=false;
      return;
    }
    await sleep(1200);
  }
  throw Error('地图加载检查超时：'+reason);
}
async function exportCSV(){await downloadBlob(new Blob([csv(state.records)],{type:'text/csv;charset=utf-8'}),indexFilename(state.source));}
async function runCurrentSource(sample) {
  if(!state.records.length)throw Error('请先收集赛事列表');
  const rows=sample?state.records.slice(0,1):state.records;
  for(const row of rows) {
    if(!sample&&!needsCapture(row))continue;
    for(let attempt=0;attempt<3;attempt++) {
      row.status='running';row.attempts++;await persist();log('采集 '+row.name+'，尝试 '+(attempt+1));
      try {await capture(row);await persist();log('保存成功 '+row.image);break;}
      catch(error) {
        if(error instanceof Pause&&watchToken)try{await watchdogMessage('end');}catch{}
        row.error=error.message;row.status=error instanceof Pause?'paused':'failed';await persist();
        if(error instanceof Pause)throw error;
        if(preferences.saveDiagnostics===true)try {
          const diagnostic=await task('diagnostic');
          await downloadBlob(new Blob([JSON.stringify(diagnostic,null,2)],{type:'application/json'}),'ApexRings/diagnostics/'+row.id+'.json');
        }catch(e){log('诊断未保存：'+e.message);}
        log('失败：'+error.message);
        if(attempt<2)await sleep(8000*2**attempt);
      }
    }
    if(sample&&row.status==='success'){state.sampleId=row.id;state.sampleVersion=SETTINGS_VERSION;await persist();log('单场样例已保存，请返回控制台检查预览后再批量运行');}
    if(stopped)throw new Pause('已请求暂停');
    await sleep(8000+Math.random()*2000);
  }
  await exportCSV();
  const failures=state.records.filter(needsCapture).length;
  log('当前列表处理结束，CSV 已保存：'+indexFilename(state.source)+(failures?'；仍有 '+failures+' 场未成功，可稍后重试':''));
}
async function runBatch() {
  const next=parseNextSources($('nextSources').value,origin);
  const inputKey=JSON.stringify(next.map(canonical));
  const resume=canResumeApprovedPlan(plan,inputKey,SETTINGS_VERSION);
  if(!resume&&!$('approved').checked)throw Error('新任务需先检查样例并勾选确认；后续列表会沿用这些设置自动采集');
  if(resume)log('恢复已确认的原计划，无需重复勾选样例');
  if(!resume) {
    if(!state.sampleId||state.sampleVersion!==SETTINGS_VERSION)throw Error('请先采集一次样例并检查，再启动跨列表采集');
    plan={urls:sourcePlan(state.source,next),index:0,status:'running',settingsVersion:SETTINGS_VERSION,inputKey,inputText:$('nextSources').value};
  }
  await runSourcePlan(plan,{
    checkpoint:persist,shouldStop:()=>stopped,
    onTransition:(url,index,total)=>log('赛事列表 '+(index+1)+' / '+total+'：'+url),
    selectSource:async url=>{
      if(state.source&&canonical(state.source)===canonical(url)&&state.records.length)return;
      await openPage(url);
      await discover({automatic:true});
    },
    processSource:()=>runCurrentSource(false)
  });
  log('所有赛事列表均已处理结束；普通失败已记录在各自 CSV，成功图片不会重复采集。');
}
async function watchdogMessage(op,token=watchToken,extra={}){
  return boundedOperation(()=>chrome.runtime.sendMessage({type:'als-watchdog',op,token,targetTabId:tabId,...extra}),'后台运行检查',10000);
}
async function guarded(fn,mode='other',resumeToken='') {
  if(busy)return;busy=true;stopped=false;
  activity=createActivityMonitor();
  let cleanup=async()=>{}, heartbeat, heartbeatAt=Date.now(),watchBeat;
  for(const id of ['discover','sample','batch','csv','nextSources','verifySeconds','approved','keepAwake','saveDiagnostics'])$(id).disabled=true;
  try{
    preferences={verifySeconds:Number($('verifySeconds').value)||90,keepAwake:$('keepAwake').checked,saveDiagnostics:$('saveDiagnostics').checked};
    await persist();
    cleanup=await protectSession();
    const controller=await api(()=>chrome.tabs.getCurrent(),'读取运行控制台');
    watchToken=resumeToken||crypto.randomUUID();
    const registration=await watchdogMessage('start',watchToken,{controllerTabId:controller.id,mode,keepAwake:$('keepAwake').checked});
    if(!registration.ok)throw new Pause(registration.error||'后台运行保护注册失败');
    if(registration.keepAwake)log('已启用可选保持唤醒；任务结束后由后台释放');
    log('后台检查已启动：心跳连续中断约 2～3 分钟时恢复已确认的批量任务');
    watchBeat=setInterval(async()=>{
      const token=watchToken;
      try{const result=await watchdogMessage('beat',token,{phase});if(watchToken!==token)return;if(!result.ok){stopped=true;log('后台任务已暂停：'+(result.error||'会话失效'));}}
      catch(e){log('后台心跳发送失败：'+e.message);}
    },15000);
    heartbeat=setInterval(()=>{
      const gap=Date.now()-heartbeatAt;heartbeatAt=Date.now();
      if(gap>90000)log('检测到运行心跳中断约 '+Math.round(gap/1000)+' 秒；恢复执行后会重新检查本场');
      if(busy)log('任务仍在执行；成功 '+state.records.filter(r=>!needsCapture(r)).length+' / '+state.records.length);
    },60000);
    await fn();
  }catch(e){log('已停止：'+e.message);}
  finally{
    clearInterval(heartbeat);clearInterval(watchBeat);activity=()=>{};
    if(watchToken)try{await watchdogMessage('end');}catch(e){log('后台结束通知未完成：'+e.message);}
    watchToken='';
    await cleanup();busy=false;
    for(const id of ['discover','sample','batch','csv','nextSources','verifySeconds','approved','keepAwake','saveDiagnostics'])$(id).disabled=false;
  }
}
async function protectSession(){
  const originals=[];
  try{
    const controller=await api(()=>chrome.tabs.getCurrent(),'读取控制台标签页');
    for(const id of [tabId,controller?.id].filter(Number.isInteger)){
      const tab=await api(()=>chrome.tabs.get(id),'检查任务标签页');
      originals.push({id,autoDiscardable:tab.autoDiscardable!==false});
      await api(()=>chrome.tabs.update(id,{autoDiscardable:false}),'保护任务标签页');
    }
  }catch(e){
    if(e instanceof Pause){for(const item of originals)try{await chrome.tabs.update(item.id,{autoDiscardable:item.autoDiscardable});}catch{}throw e;}
    log('部分运行保护未启用：'+e.message);
  }
  let released=false;
  const release=async()=>{
    if(released)return;released=true;
    for(const item of originals)try{await boundedOperation(()=>chrome.tabs.update(item.id,{autoDiscardable:item.autoDiscardable}),'恢复标签页状态',5000);}catch{}
    window.removeEventListener('pagehide',release);
  };
  window.addEventListener('pagehide',release,{once:true});return release;
}
$('keepAwake').onchange=async()=>{
  if(!$('keepAwake').checked)return;
  try{if(!await chrome.permissions.request({permissions:['power']})){$('keepAwake').checked=false;log('未授权保持唤醒；采集仍可运行，但电脑自动休眠时无法继续截图');}}
  catch(e){$('keepAwake').checked=false;log('保持唤醒未启用：'+e.message);}
};
$('stop').onclick=()=>{
  stopped=true;log('已请求暂停，将在当前步骤结束后停止；不会被后台自动重启');
  if(watchToken)void watchdogMessage('end',watchToken).catch(e=>log('暂停后台通知未返回：'+e.message));
};
$('discover').onclick=()=>guarded(()=>discover());
$('sample').onclick=()=>guarded(()=>runCurrentSource(true));
$('batch').onclick=()=>guarded(runBatch,'batch');
$('csv').onclick=()=>guarded(exportCSV);
for(const event of ['freeze','resume'])document.addEventListener(event,()=>{
  if(watchToken)void watchdogMessage('lifecycle',watchToken,{event}).catch(()=>{});
});
document.addEventListener('visibilitychange',()=>{
  if(watchToken)void watchdogMessage('lifecycle',watchToken,{event:document.visibilityState}).catch(()=>{});
});
try {
  const t=await chrome.tabs.get(tabId);
  origin=new URL(t.url).origin;
  if(!allowedURL(t.url,origin))throw Error('请在 Apex Legends Status 页面点击扩展图标');
  key='als-queue:'+origin;
  queuesKey='als-lists:'+origin;planKey='als-plan:'+origin;
  preferencesKey='als-prefs:'+origin;
  const saved=await chrome.storage.local.get([key,queuesKey,planKey,preferencesKey]);
  state=saved[key]||state;queues=saved[queuesKey]||{};plan=saved[planKey]||null;
  if(state.source)queues[canonical(state.source)]=state;
  $('nextSources').value=plan?.inputText||'';
  preferences=saved[preferencesKey]||{};
  $('verifySeconds').value=preferences.verifySeconds||90;
  $('saveDiagnostics').checked=preferences.saveDiagnostics===true;
  $('keepAwake').checked=Boolean(preferences.keepAwake&&await chrome.permissions.contains({permissions:['power']}));
  $('approved').checked=canResumeApprovedPlan(plan,JSON.stringify(parseNextSources($('nextSources').value,origin).map(canonical)),SETTINGS_VERSION);
  $('target').textContent='操作原标签页：'+t.title+'（标签 ID '+tabId+'）';
  log('扩展 v'+chrome.runtime.getManifest().version+' 已连接。当前列表 '+state.records.length+' 场；已保存 '+Object.keys(queues).length+' 个列表断点。');
  if(plan&&['paused','running'].includes(plan.status))log('有未完成的已确认计划；点击“批量续跑”将从第 '+(plan.index+1)+' 个列表恢复。');
  const events=(await chrome.storage.local.get(WATCH_EVENTS))[WATCH_EVENTS]||[];
  for(const event of events.slice(-3))log('后台记录 '+new Date(event.at).toLocaleTimeString()+'：'+event.message);
  const recoveryToken=new URL(location.href).searchParams.get('resume');
  if(recoveryToken){
    const recovery=await watchdogMessage('recover',recoveryToken);
    if(recovery.ok&&canResumeApprovedPlan(plan,JSON.stringify(parseNextSources($('nextSources').value,origin).map(canonical)),SETTINGS_VERSION)){
      log('后台已重新加载控制台，自动从保存的断点续跑；未保存成功的本场会重新加载');
      await guarded(runBatch,'batch',recoveryToken);
    }else{
      if(recovery.ok)await watchdogMessage('end',recoveryToken);
      log('没有匹配的已确认批量计划，未自动启动采集');
    }
  }
} catch(e) {log(e.message);for(const id of ['discover','sample','batch','csv'])$(id).disabled=true;}
