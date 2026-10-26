// Runs in an isolated extension world. No site globals, network requests, or challenge interaction.
export function pageTask(action,expectedURL='') {
  if(expectedURL){
    const actual=new URL(location.href),wanted=new URL(expectedURL);actual.hash='';wanted.hash='';
    if(actual.href!==wanted.href)return {stale:true,error:'网页已切换，已忽略过期的操作'};
  }
  const text=document.body?.innerText||'';
  if (/Limited data available|Access denied|Sign in to view/i.test(text) || /\/login|\/signin/.test(location.pathname)) return {blocked:true,error:'网页显示登录或权限限制'};
  if (/Verification required|Checking your browser|Verify you are human|Just a moment|Please complete the challenge|正在验证/i.test(text)) return {blocked:true,verification:true,error:'正在等待网站自动验证'};
  if(action==='discover') {
    const records=[...document.querySelectorAll('a[href]')].filter(a=>/Open interactive replay/i.test(a.innerText)).map(a=>{
      let n=a.parentElement, name='';
      for(let i=0;n && i<8;i++,n=n.parentElement) {
        const h=n.querySelector('h1,h2,h3,h4,h5,h6');
        if(h && /Game|Final|Day|Match/i.test(h.textContent)) {name=h.textContent.trim();break;}
      }
      const map=["World's Edge",'E-District','Storm Point','Olympus','Broken Moon','Kings Canyon'].find(m=>name.replaceAll('’',"'").includes(m))||'';
      return {url:a.href,name:name||new URL(a.href).pathname.split('/').pop(),map};
    });
    return {url:location.href,records,height:document.body.scrollHeight};
  }
  if(action==='scroll') {window.scrollTo(0,document.body.scrollHeight);return {ok:true};}
  if(action==='configure'||action==='settings') {
    const normalize=s=>(s||'').replace(/\s+/g,' ').trim().toLowerCase();
    const visible=e=>e.getClientRects().length>0&&getComputedStyle(e).visibility!=='hidden';
    const selects=[...document.querySelectorAll('select')].filter(s=>visible(s)&&[...s.options].some(o=>normalize(o.textContent)==='all players hidden'));
    if(selects.length!==1) return {error:'找不到 All players hidden 下拉框；需要根据实际 DOM 适配'};
    const s=selects[0], option=[...s.options].find(o=>normalize(o.textContent)==='all players hidden');
    let root=document, changed=false;
    // Prefer the small toolbar containing the player select, excluding duplicate mobile controls.
    for(let n=s.parentElement,i=0;n&&i<7;n=n.parentElement,i++) {
      if(n.querySelectorAll('input[type="checkbox"]').length>=5&&/all\s+rings/i.test(n.textContent)&&n.textContent.length<4000){root=n;break;}
    }
    const inputs=[...root.querySelectorAll('input[type="checkbox"]')].filter(visible);
    function names(c) {
      const result=[...(c.labels||[])].map(l=>l.textContent);
      result.push(c.getAttribute('aria-label'),c.getAttribute('title'));
      const ids=(c.getAttribute('aria-labelledby')||'').split(/\s+/).filter(Boolean);
      if(ids.length)result.push(ids.map(id=>document.getElementById(id)?.textContent||'').join(' '));
      const p=c.parentElement;
      if(p&&p.querySelectorAll('input[type="checkbox"]').length===1)result.push(p.textContent);
      // Many toolbars use "<input> Next ring" rather than associated <label> elements.
      for(const direction of ['nextSibling','previousSibling']) {
        let adjacent='';
        for(let n=c[direction],i=0;n&&i<4;n=n[direction],i++) {
          if(n.nodeType===1&&(n.matches('input,select,button')||n.querySelector('input,select,button')))break;
          adjacent=direction==='nextSibling'?adjacent+n.textContent:n.textContent+adjacent;
          result.push(adjacent);
        }
      }
      return result.map(normalize).filter(Boolean);
    }
    const targets=[];
    for(const [label,value] of [['Next ring',true],['All rings',true],['Care packages',false],['Respawn beacons',false],['Heatmap',false],['Pathing',false]]) {
      const controls=inputs.filter(c=>names(c).includes(normalize(label)));
      if(controls.length!==1) return {error:'无法唯一定位选项 '+label+'，需要适配网页控件'};
      const c=controls[0];
      if(c.type!=='checkbox' || c.disabled) return {error:label+' 不是可用复选框'};
      targets.push({c,label,value});
    }
    // Resolve all controls before changing anything, then verify all of them after page handlers run.
    if(action==='configure') {
      if(s.value!==option.value) {
        const setter=typeof HTMLSelectElement==='undefined'?null:Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value')?.set;
        if(setter)setter.call(s,option.value);else s.value=option.value;
        s.dispatchEvent(new Event('input',{bubbles:true}));s.dispatchEvent(new Event('change',{bubbles:true}));changed=true;
      }
      for(const {c,value} of targets)if(c.checked!==value){c.click();changed=true;}
    }
    if(s.value!==option.value)return {error:'玩家隐藏设置未生效'};
    for(const {c,label,value} of targets)if(c.checked!==value)return {error:label+' 设置未生效'};
    return {ok:true,changed,settings:{players:'All players hidden',...Object.fromEntries(targets.map(t=>[t.label,t.c.checked]))}};
  }
  if(action==='diagnostic') return {url:location.href,title:document.title,
    capturedAt:new Date().toISOString(),visibility:document.visibilityState,readyState:document.readyState,wasDiscarded:Boolean(document.wasDiscarded),
    controls:[...document.querySelectorAll('select,input')].map(e=>({tag:e.tagName,id:e.id,type:e.type,text:e.tagName==='SELECT'?e.textContent:'',
      value:e.tagName==='SELECT'?e.value:undefined,checked:e.type==='checkbox'?e.checked:undefined,labels:[...(e.labels||[])].map(l=>l.textContent)})),
    surfaces:[...document.querySelectorAll('canvas,svg,.leaflet-container,img')].map(e=>({tag:e.tagName,id:e.id,class:e.getAttribute('class'),width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height}))};
  const maps=[...document.querySelectorAll('.leaflet-container')].filter(e=>e.getBoundingClientRect().width>100);
  if(maps.length!==1)return {error:'找不到唯一 Leaflet 地图，可能尚未加载或需要适配其他地图渲染方式'};
  const map=maps[0], mr=map.getBoundingClientRect();
  const images=[...map.querySelectorAll('img.leaflet-image-layer')].filter(e=>e.complete&&e.naturalWidth&&e.getBoundingClientRect().width>100);
  if(images.length!==1)return {error:'完整底图未就绪，或网页使用 Canvas/瓦片，需进一步适配'};
  const r=images[0].getBoundingClientRect();
  const clipped=r.left<mr.left-1||r.top<mr.top-1||r.right>mr.right+1||r.bottom>mr.bottom+1||r.left<0||r.top<0||r.right>innerWidth||r.bottom>innerHeight;
  if(action==='fit' && clipped) {
    const z=map.querySelector('.leaflet-control-zoom-out');
    if(!z||z.classList.contains('leaflet-disabled'))return {error:'无法显示完整底图；请缩小浏览器页面或地图'};
    z.click();return {zoomed:true};
  }
  const shapes=[...map.querySelectorAll('svg circle,svg ellipse,svg path')].filter(e=>{
    const st=getComputedStyle(e),b=e.getBoundingClientRect(),d=e.getAttribute('d')||'';
    return st.display!=='none'&&st.visibility!=='hidden'&&Number(st.opacity)>0&&
      /rgb\(2[0-5][0-9], 2[0-5][0-9], 2[0-5][0-9]\)/.test(st.stroke)&&
      (/circle|ellipse/i.test(e.tagName)||/[aA]/.test(d))&&b.width>8&&Math.abs(b.width-b.height)<Math.max(4,b.width*.05);
  });
  return {clip:{x:r.left,y:r.top,width:r.width,height:r.height},clipped,rings:shapes.length,
    viewport:{width:innerWidth,height:innerHeight},url:location.href,base:images[0].currentSrc,
    geometry:shapes.map(e=>[e.tagName,e.getAttribute('d'),e.getAttribute('r'),e.getAttribute('cx'),e.getAttribute('cy')])};
}
