import {installWatchdog} from './watchdog.mjs';
installWatchdog(chrome);
chrome.action.onClicked.addListener(async tab => {
  const url = new URL(tab.url || 'about:blank');
  if (url.protocol !== 'https:' || !(url.hostname === 'apexlegendsstatus.com' || url.hostname.endsWith('.apexlegendsstatus.com'))) {
    await chrome.action.setBadgeText({text: 'ALS'});
    return;
  }
  await chrome.action.setBadgeText({text: ''});
  // An active tab in its own visible window is not an idle background controller tab.
  await chrome.windows.create({url:chrome.runtime.getURL('panel.html')+'?tab='+tab.id,
    type:'popup',width:520,height:900,focused:true});
});
