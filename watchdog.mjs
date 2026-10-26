export const WATCH_KEY='als-watchdog-session-v5';
export const WATCH_EVENTS='als-watchdog-events-v5';
export const ALARM_NAME='als-controller-watchdog';
export function watchdogDecision(session,now){
  if(!session?.active)return 'inactive';
  if(now-session.lastBeat<120000)return 'healthy';
  if(session.mode!=='batch')return 'pause';
  return (session.recoveries||[]).filter(t=>now-t<600000).length>=3?'limit':'recover';
}
export class CollectionWatchdog {
  constructor(browser,{now=()=>Date.now()}={}){this.b=browser;this.now=now;}
  async load(){return (await this.b.storage.session.get(WATCH_KEY))[WATCH_KEY]||null;}
  async save(session){await this.b.storage.session.set({[WATCH_KEY]:session});}
  async event(message){
    const previous=(await this.b.storage.local.get(WATCH_EVENTS))[WATCH_EVENTS]||[];
    await this.b.storage.local.set({[WATCH_EVENTS]:[...previous,{at:this.now(),message}].slice(-50)});
  }
  async ensureAlarm(){
    const s=await this.load();
    if(s?.active&&!await this.b.alarms.get(ALARM_NAME))await this.b.alarms.create(ALARM_NAME,{periodInMinutes:1});
  }
  async finish(s,reason){
    if(s){s.active=false;s.reason=reason;await this.save(s);}
    await this.b.alarms.clear(ALARM_NAME);
    if(s?.keepAwake&&await this.b.permissions.contains({permissions:['power']}))this.b.power.releaseKeepAwake();
    if(reason)await this.event(reason);
  }
  validSender(message,sender){
    try{
      const u=new URL(sender.url),base=new URL(this.b.runtime.getURL('panel.html'));
      return u.protocol===base.protocol&&u.host===base.host&&u.pathname===base.pathname&&Number(u.searchParams.get('tab'))===message.targetTabId;
    }catch{return false;}
  }
  async handle(message,sender){
    if(!this.validSender(message,sender))return {ok:false,error:'仅允许本扩展的原控制台注册任务'};
    const s=await this.load();
    if(message.op==='start'){
      if(!Number.isInteger(message.controllerTabId)||typeof message.token!=='string')return {ok:false,error:'任务注册参数无效'};
      const controller=await this.b.tabs.get(message.controllerTabId);
      if(controller.url!==sender.url)return {ok:false,error:'控制台标签页不匹配'};
      await this.b.tabs.get(message.targetTabId);
      if(s?.active&&s.controllerTabId!==message.controllerTabId)return {ok:false,error:'另一个控制台正在采集，请先停止或关闭旧控制台'};
      if(s?.active&&s.recovering&&s.token!==message.token)return {ok:false,error:'自动恢复令牌不匹配'};
      if(s?.keepAwake&&!message.keepAwake&&await this.b.permissions.contains({permissions:['power']}))this.b.power.releaseKeepAwake();
      const session={active:true,controllerTabId:message.controllerTabId,targetTabId:message.targetTabId,
        token:message.token,mode:message.mode,lastBeat:this.now(),recovering:false,
        recoveries:s?.token===message.token?s.recoveries||[]:[],keepAwake:false};
      if(message.keepAwake&&await this.b.permissions.contains({permissions:['power']})){
        this.b.power.requestKeepAwake('display');session.keepAwake=true;
      }
      await this.save(session);await this.ensureAlarm();return {ok:true,keepAwake:session.keepAwake};
    }
    if(!s||s.token!==message.token||s.targetTabId!==message.targetTabId)return {ok:false,error:'没有匹配的运行任务'};
    if(message.op==='beat'){
      if(!s.active||s.recovering)return {ok:false,error:s.reason||'控制台正在重新加载恢复'};
      s.lastBeat=this.now();s.phase=message.phase||'';await this.save(s);return {ok:true};
    }
    if(message.op==='end'){await this.finish(s,'任务已结束或暂停');return {ok:true};}
    if(message.op==='lifecycle'){
      if(s.active&&['freeze','resume','hidden','visible'].includes(message.event)){
        s.lifecycle={event:message.event,at:this.now()};await this.save(s);
        await this.event('控制台生命周期事件：'+message.event);
      }
      return {ok:true};
    }
    if(message.op==='recover')return {ok:Boolean(s.active&&s.recovering&&s.mode==='batch'),reason:s.reason};
    return {ok:false,error:'未知运行操作'};
  }
  async check(){
    const s=await this.load();if(!s?.active)return;
    let controller;
    try{
      controller=await this.b.tabs.get(s.controllerTabId);
      await this.b.tabs.get(s.targetTabId);
      if(!controller.url?.startsWith(this.b.runtime.getURL('panel.html')+'?'))throw Error('控制台已离开扩展页面');
    }catch{await this.finish(s,'原网页或控制台已关闭，已保留断点；不自动另开网站');return;}
    const decision=watchdogDecision(s,this.now());
    if(decision==='healthy')return;
    if(decision==='pause'||decision==='limit'){
      await this.finish(s,decision==='limit'?'10 分钟内自动恢复已达 3 次上限，请人工检查':'非批量操作长时间无响应，已暂停');return;
    }
    s.recoveries=[...(s.recoveries||[]).filter(t=>this.now()-t<600000),this.now()];
    s.recovering=true;s.lastBeat=this.now();await this.save(s);
    await this.event('控制台心跳中断超过 120 秒；重新加载控制台，从断点恢复批量任务');
    const url=new URL(controller.url);url.searchParams.set('resume',s.token);
    url.searchParams.set('recovery',String(s.recoveries.length));
    await this.b.tabs.update(s.controllerTabId,{url:url.href});
  }
  async removed(tabId){const s=await this.load();if(s?.active&&(s.targetTabId===tabId||s.controllerTabId===tabId))await this.finish(s,'任务标签页已关闭，已保存断点');}
}
export function installWatchdog(browser){
  const watcher=new CollectionWatchdog(browser);let chain=Promise.resolve();
  const serial=fn=>{const pending=chain.then(fn);chain=pending.catch(()=>{});return pending;};
  browser.runtime.onMessage.addListener((message,sender,reply)=>{
    if(message?.type!=='als-watchdog')return;
    serial(()=>watcher.handle(message,sender)).then(reply,e=>reply({ok:false,error:e.message}));return true;
  });
  browser.alarms.onAlarm.addListener(alarm=>{if(alarm.name===ALARM_NAME)void serial(()=>watcher.check()).catch(e=>watcher.event('后台检查失败：'+e.message));});
  browser.tabs.onRemoved.addListener(id=>{void serial(()=>watcher.removed(id));});
  void serial(()=>watcher.ensureAlarm()).catch(()=>{});return watcher;
}
