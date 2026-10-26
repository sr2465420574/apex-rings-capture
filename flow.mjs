// A bounded passive wait. This never interacts with a verification widget.
export async function waitForAutomaticVerification(probe, {
  sleep=ms=>new Promise(r=>setTimeout(r,ms)), now=()=>Date.now(), timeoutMs=90000,
  onWaiting=()=>{}, onResumed=()=>{}, shouldStop=()=>false
}={}) {
  const started=now();let waiting=false;
  while(true) {
    if(shouldStop())throw Error('已请求暂停');
    if(waiting&&now()-started>=timeoutMs)throw Error('自动验证等待超时；验证未通过，已暂停本场');
    let data;
    try{data=await probe();}catch(e){
      // A challenge may reload the document automatically. Do not retry permission errors.
      if(!waiting||!/frame.*removed|frame.*not found|document.*unloaded/i.test(e.message))throw e;
      await sleep(1000);continue;
    }
    if(!data?.verification) {
      if(waiting)onResumed();
      return {data,waitedMs:waiting?now()-started:0,verified:waiting};
    }
    if(!waiting){waiting=true;onWaiting();}
    await sleep(Math.min(1000,timeoutMs-(now()-started)));
  }
}
