export const SETTINGS_VERSION=2;
export function needsCapture(row){return row.status!=='success'||row.settingsVersion!==SETTINGS_VERSION;}
export function canonical(raw) {
  const u = new URL(raw);
  if (!['https:', 'http:'].includes(u.protocol)) throw Error('非网页链接');
  u.hash = ''; return u.href;
}
export function allowedURL(raw, origin) {
  const u = new URL(raw);
  return u.protocol === 'https:' && (u.hostname === 'apexlegendsstatus.com' || u.hostname.endsWith('.apexlegendsstatus.com')) && u.origin === origin;
}
export function cleanName(s) { return s.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim().replace(/[ .]+$/g, '').slice(0,100) || 'game'; }
export function csv(rows) {
  const fields=['id','name','map','url','image','status','attempts','rings','error'];
  const quote=v=>'"'+String(v??'').replaceAll('"','""')+'"';
  return '\ufeff'+[fields,...rows.map(r=>fields.map(k=>r[k]??''))].map(r=>r.map(quote).join(',')).join('\r\n');
}
export function cropBox(clip, viewport, width, height) {
  if (![clip.x,clip.y,clip.width,clip.height,viewport.width,viewport.height,width,height].every(Number.isFinite)) throw Error('截图尺寸无效');
  if (viewport.width<=0 || viewport.height<=0 || width<=0 || height<=0 || clip.width<100 || clip.height<100) throw Error('地图尺寸过小');
  if (clip.x<0 || clip.y<0 || clip.x+clip.width>viewport.width+1 || clip.y+clip.height>viewport.height+1) throw Error('地图超出视口，拒绝裁切');
  if (Math.abs(clip.width/clip.height-1)>.03) throw Error('地图不是预期正方形');
  const sx=width/viewport.width, sy=height/viewport.height;
  if (Math.abs(sx/sy-1)>.02) throw Error('截图比例变化，请保持窗口大小不变');
  return {x:clip.x*sx,y:clip.y*sy,width:clip.width*sx,height:clip.height*sy};
}
