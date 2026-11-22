export function createTripSave({write,onState,delay=750}){
  let pending=null,writing=null,timer,failed=false;
  const update=()=>onState(writing?'saving':failed?'failed':pending?'dirty':'saved',Boolean(pending));

  function flush(){
    clearTimeout(timer);
    if(writing)return writing;
    if(!pending)return Promise.resolve(true);
    failed=false;
    writing=Promise.resolve().then(async()=>{
      while(pending){
        const snapshot=pending;
        pending=null;
        update();
        try{await write(snapshot);}
        catch{
          pending??=snapshot;
          failed=true;
          return false;
        }
      }
      return true;
    }).finally(()=>{writing=null;update();});
    update();
    return writing;
  }
  return {
    flush,
    enqueue(snapshot){
      pending=snapshot;
      failed=false;
      update();
      if(!writing){clearTimeout(timer);timer=setTimeout(flush,delay);}
    },
    reset(){clearTimeout(timer);pending=null;failed=false;update();}
  };
}
