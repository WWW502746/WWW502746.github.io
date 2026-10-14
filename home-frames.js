(() => {
  const workerURL=new URL('./home-frame-worker.js?v=v5.10',document.currentScript.src);
  const diagnostic=new URLSearchParams(location.search).has('film-debug');
  window.createScrollFrames = async (video,source,options={}) => {
    let worker,canvas,observer,player,closed=false,failed=false,suspended=false,ready=false,desired=0,painted=-1,serial=0;
    const reads=new Map(),captures=new Map();
    const stats={targetFrame:0,drawnFrame:-1,pending:true,liveFrames:0,maxFrames:0};
    const fps=Number(video.dataset.fps)||60;
    const current=()=>Math.max(0,Math.min(Number(video.dataset.frames)-1,Math.round(options.getFrame?.()??desired)));
    const visibility=()=>{if(canvas)canvas.style.opacity=ready&&!failed&&!closed&&!suspended?video.style.opacity:'0';};
    function fail(error){
      if(failed||closed)return;
      failed=true;ready=false;stats.failed=String(error);
      worker?.terminate();observer?.disconnect();reads.clear();
      for(const pending of captures.values())pending.reject(error);captures.clear();
      canvas?.remove();
      options.onFallback?.(error);
    }
    try{
      if(!window.Worker||!HTMLCanvasElement.prototype.transferControlToOffscreen)throw new Error('后台绘制不可用');
      const provider=await source.getSource();
      canvas=document.createElement('canvas');canvas.width=3840;canvas.height=2160;
      canvas.className='transition-film';canvas.style.opacity='0';canvas.style.pointerEvents='none';canvas.setAttribute('aria-hidden','true');video.after(canvas);
      const offscreen=canvas.transferControlToOffscreen();
      worker=new Worker(workerURL);
      observer=new MutationObserver(visibility);observer.observe(video,{attributes:true,attributeFilter:['style']});
      let resolveInit,rejectInit;
      const initialized=new Promise((resolve,reject)=>{resolveInit=resolve;rejectInit=reject;});
      worker.onerror=event=>{const error=new Error(event.message||'后台绘制失败');rejectInit(error);fail(error);};
      worker.onmessage=async event=>{
        const message=event.data;
        if(closed||failed)return;
        if(message.type==='read'){
          const request={group:message.group};reads.set(message.requestId,request);
          try{
            const bytes=await provider.read(message.src);
            if(reads.get(message.requestId)!==request||closed||failed||suspended)return;
            reads.delete(message.requestId);
            // Source buffers are shared with native fallback; copy one GOP rather than detaching them.
            const copy=bytes.slice(0);
            worker.postMessage({type:'data',requestId:message.requestId,group:message.group,bytes:copy},[copy]);
          }catch(error){if(reads.get(message.requestId)===request&&!closed&&!failed){reads.delete(message.requestId);fail(error);}}
        } else if(message.type==='cancelRead')reads.delete(message.requestId);
        else if(message.type==='ready'){
          if(message.width!==3840||message.height!==2160){fail(new Error('原视频尺寸发生变化'));return;}
          resolveInit();
        } else if(message.type==='drawn'){
          if(suspended)return;
          painted=message.frame;canvas.dataset.frame=String(painted);
          Object.assign(stats,message.stats||{});
          stats.drawnFrame=painted;stats.pending=painted!==current();
          if(!ready&&painted===current()){ready=true;visibility();options.onReady?.(player);}
        } else if(['stats','suspended','closed'].includes(message.type))Object.assign(stats,message.stats||{});
        else if(message.type==='captured'){
          const pending=captures.get(message.requestId);if(pending){captures.delete(message.requestId);message.error?pending.reject(new Error(message.error)):pending.resolve(message);}
        } else if(message.type==='error'){
          const error=new Error(message.message||'后台解码失败');rejectInit(error);fail(error);
        }
      };
      player={
        canvas,
        ensureFrame(index=current()){
          if(closed||failed)return;
          desired=Math.max(0,Math.min(provider.manifest.frames-1,Math.round(index)));
          if(suspended)return;
          stats.targetFrame=desired;
          stats.pending=painted!==desired;
          if(desired===painted&&ready)return;
          worker.postMessage({type:'target',frame:desired,serial:++serial});
        },
        get ready(){return ready;},get failed(){return failed;},get seeking(){return painted!==current();},get paintedFrame(){return painted;},
        suspend(){
          if(suspended||closed||failed)return;
          suspended=true;ready=false;visibility();reads.clear();worker.postMessage({type:'suspend'});
        },
        resume(){
          if(closed||failed)return;
          if(suspended){suspended=false;ready=false;worker.postMessage({type:'resume'});}
          player.ensureFrame(current());
        },
        capture(){
          if(failed||closed)return Promise.reject(new Error('没有可读取的画面'));
          const requestId='capture-'+(++serial);
          return new Promise((resolve,reject)=>{captures.set(requestId,{resolve,reject});worker.postMessage({type:'capture',requestId});});
        },
        close(){
          if(closed)return;closed=true;ready=false;reads.clear();worker.terminate();observer.disconnect();
          for(const pending of captures.values())pending.reject(new Error('测试画面已关闭'));captures.clear();
          canvas.remove();
        }
      };
      if(diagnostic){window.homeFramePlayer=player;window.homeFrameStats=stats;}
      worker.postMessage({type:'init',canvas:offscreen,manifest:provider.manifest,init:provider.init.slice(0),fps},[offscreen]);
      let initTimeout;
      try{await Promise.race([initialized,new Promise((_,reject)=>{initTimeout=setTimeout(()=>reject(new Error('后台解码初始化超时')),10000);})]);}
      finally{clearTimeout(initTimeout);}
      player.ensureFrame(current());return player;
    }catch(error){fail(error);return null;}
  };
})();
