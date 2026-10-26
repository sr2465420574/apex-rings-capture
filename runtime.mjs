export class ExecutionGap extends Error {
  constructor(milliseconds){super('检测到执行中断约 '+Math.round(milliseconds/1000)+' 秒（可能休眠、页面冻结或浏览器挂起）；重新加载本场重试');this.name='ExecutionGap';}
}
export function createActivityMonitor({now=()=>Date.now(),thresholdMs=45000}={}) {
  let previous=now();
  return ()=>{const current=now(),gap=current-previous;previous=current;if(gap>thresholdMs)throw new ExecutionGap(gap);};
}
export function isMissingTabError(error){return /No tab with id|Invalid tab ID|tab was closed|No tab found/i.test(error?.message||'');}
export async function boundedOperation(operation,label,timeoutMs=20000) {
  let timer;
  try{return await Promise.race([Promise.resolve().then(operation),new Promise((_,reject)=>{
    timer=setTimeout(()=>reject(Error(label+' 超过 '+Math.round(timeoutMs/1000)+' 秒未返回；本场将有限重试')),timeoutMs);
  })]);}finally{clearTimeout(timer);}
}
export function canResumeApprovedPlan(plan,inputKey,settingsVersion){
  return Boolean(plan&&['paused','running'].includes(plan.status)&&plan.inputKey===inputKey&&plan.settingsVersion===settingsVersion);
}
