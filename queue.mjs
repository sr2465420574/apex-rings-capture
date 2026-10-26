import {canonical,allowedURL,cleanName} from './core.mjs';

export function parseNextSources(text,origin) {
  const unique=new Map();
  for(const line of text.split(/\r?\n/).map(s=>s.trim()).filter(Boolean)) {
    let url;
    try{url=new URL(line);}catch{throw Error('后续列表网址无效：'+line);}
    if(!allowedURL(url.href,origin))throw Error('后续列表必须与当前 Apex 页面同源：'+line);
    if(!/^\/algs\//.test(url.pathname)||!/\/Overview\/?$/i.test(url.pathname))throw Error('请填写赛事 Overview 列表网址，而非单场回放：'+line);
    unique.set(canonical(url.href),url.href);
  }
  return [...unique.values()];
}
export function sourcePlan(current,next) {
  if(!current)throw Error('请先收集当前赛事列表');
  const unique=new Map();
  for(const url of [current,...next])if(!unique.has(canonical(url)))unique.set(canonical(url),url);
  return [...unique.values()];
}
export function indexFilename(source) {
  if(!source)return 'ApexRings/index.csv';
  const normalized=canonical(source);
  let hash=2166136261;
  for(const c of normalized)hash=Math.imul(hash^c.charCodeAt(0),16777619)>>>0;
  const slug=cleanName(new URL(source).pathname.replace(/^\/algs\//,'').replaceAll('/','_'));
  return 'ApexRings/index_'+slug+'_'+hash.toString(16).padStart(8,'0')+'.csv';
}
// Index advances only after the source's records AND CSV are saved by processSource.
export async function runSourcePlan(plan,{selectSource,processSource,checkpoint,shouldStop=()=>false,onTransition=()=>{}}) {
  if(!Number.isInteger(plan.index)||plan.index<0||plan.index>plan.urls.length)throw Error('赛事队列断点无效');
  plan.status='running';await checkpoint();
  try {
    while(plan.index<plan.urls.length) {
      if(shouldStop())throw Error('已请求暂停');
      const url=plan.urls[plan.index];
      onTransition(url,plan.index,plan.urls.length);
      await selectSource(url);
      await processSource(url);
      plan.index++;await checkpoint();
    }
    plan.status='complete';await checkpoint();
  }catch(e){plan.status='paused';await checkpoint();throw e;}
}
