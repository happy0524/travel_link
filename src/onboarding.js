import {locale} from './ui-copy.js';
import {createTripSave} from './trip-save.js';

export function dateInZone(zone){
  const parts=new Intl.DateTimeFormat(locale,{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  const date=Object.fromEntries(parts.map(part=>[part.type,part.value]));
  return [date.year,date.month,date.day].join('-');
}

export function dateLabel(date){
  return new Intl.DateTimeFormat(locale,{timeZone:'UTC',dateStyle:'long'}).format(new Date(date+'T00:00:00Z'));
}

async function request(path,method='GET',body,signal){
  const response=await fetch('/api/'+path,{method,signal,
    ...(body?{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{}),
    ...(method==='PUT'?{keepalive:true}:{})});
  const data=await response.json();
  if(!response.ok)throw Error(data.message||'The request failed. Try again.');
  return data;
}

export function setupOnboarding({searchDestination,timeZone,restoreDestination,loadStops,prepareGlobe,raiseGlobe,onJourney,onSignOut}){
  const dialog=document.querySelector('#arrival');
  const field=key=>dialog.querySelector('#arrival-'+key);
  const form=field('form'),account=field('account'),notice=field('notice');
  const library=dialog.querySelector('#trip-library'),results=dialog.querySelector('#destination-results');
  const list=dialog.querySelector('#previous-trips'),first=field('first'),second=field('second');
  const begin=field('begin'),migration=field('migration'),legacyAccess=field('legacy-access');
  const scroll=dialog.querySelector('.arrival-scroll');
  const action=dialog.querySelector('#find-destination');
  const tripButton=document.querySelector('#my-trips'),saveButton=document.querySelector('#save-status'),saveNote=document.querySelector('#itinerary-save');
  const closeButton=document.querySelector('#trip-dialog-close'),cancelButton=document.querySelector('#trip-dialog-cancel');
  let signedIn=false,needsProfile=false,selection,userDestination='',searched='',controller,accountRevision=0;
  let activeTrip=null,requestId=crypto.randomUUID(),inFlight=false;
  let overlay=false,operation=null,committing=false,libraryRevision=0;
  const reduceMotion=matchMedia('(prefers-reduced-motion: reduce)');
  const saver=createTripSave({
    async write(data){
      const saved=await request('trips/'+data.id,'PUT',data);
      if(saved.id!==activeTrip?.id)return;
      activeTrip=data;
      const listedDate=list.querySelector('button[aria-current] span');
      if(listedDate)listedDate.textContent=dateLabel(data.date);
    },
    onState(status,pending){
      saveButton.dataset.status=activeTrip?status:'inactive';
      saveButton.textContent=!activeTrip?'Save trip':{dirty:'Save trip',saving:'Saving…',saved:'Saved',failed:'Try again'}[status];
      saveButton.disabled=!activeTrip||status==='saving'||status==='saved';
      saveNote.textContent=!activeTrip?'':{
        dirty:'Unsaved changes',saving:pending?'Saving · more changes pending':'Saving…',saved:'Saved',failed:'Save failed'
      }[status];
    }
  });
  const announce=message=>{notice.textContent=message;};
  const displayError=error=>{
    announce(error instanceof SyntaxError||error instanceof TypeError?'The request failed. Try again.':error.message);
    notice.scrollIntoView({block:'nearest'});
  };

  function fillConfirmation(trip,destination){
    const values={name:trip.name,destination:destination.name||trip.destination};
    for(const [key,value] of Object.entries(values)){
      second.querySelector('[data-letter='+key+']').textContent=value;
    }
  }
  function updateZone(){
    field('zone').textContent=selection?.zone||'Choose a destination';
  }
  const editTrip=event=>{
    if(event.target===field('destination')){
      controller?.abort();
      selection=null;results.replaceChildren();
    }
    updateZone();
  };
  form.oninput=editTrip;
  updateZone();

  function destinationResults(text){results.textContent=text;}
  action.onclick=async()=>{
    const query=field('destination').value.trim();
    if(!query){field('destination').focus();return;}
    controller?.abort();controller=new AbortController();
    const {signal}=controller;
    searched=query;selection=null;updateZone();destinationResults('Searching for destinations…');
    try{
      const choices=await searchDestination(query,signal);
      if(signal.aborted)return;
      destinationResults(choices.length?'':'No destinations found.');
      for(const place of choices){
        const button=document.createElement('button');button.type='button';
        button.textContent=[place.name,place.address].filter(Boolean).join(' · ');
        const confirm=async()=>{
          controller?.abort();controller=new AbortController();
          const {signal}=controller;
          destinationResults('Checking local time zone…');
          try{
            const zone=await timeZone(place,signal);
            if(signal.aborted)return;
            selection={...place,zone};userDestination=searched;
            field('destination').value=place.name;
            updateZone();destinationResults('Destination confirmed.');
          }catch(error){
            if(signal.aborted)return;
            destinationResults(error.code?.startsWith('API_')?error.message:'The local time zone could not be confirmed.');
            const retry=document.createElement('button');retry.type='button';retry.textContent='Try again';
            retry.onclick=confirm;results.append(retry);
          }
        };
        button.onclick=confirm;
        results.append(button);
      }
    }catch(error){if(!signal.aborted)destinationResults(error.code?.startsWith('API_')?error.message:'Could not search for destinations. Try again.');}
  };

  function showLibrary(show){
    const compatibility=!signedIn&&location.hash==='#legacy-access';
    first.hidden=show||compatibility;second.hidden=true;legacyAccess.hidden=!compatibility;
    if(show)library.after(notice);
    else if(compatibility)legacyAccess.append(notice);
    else account.after(notice);
    dialog.removeAttribute('aria-label');
    dialog.setAttribute('aria-labelledby',show?'trip-library-title':compatibility?'arrival-legacy-title':'arrival-title');
    library.hidden=!show;
    field('title').textContent=overlay?'Start a new trip':'A Letter from the Captain';
    begin.textContent=overlay?'Create trip':'Begin my journey';
    cancelButton.hidden=!overlay||show;
    scroll.scrollTop=0;
  }
  function configureAccount(){
    account.hidden=account.disabled=signedIn;
    migration.hidden=!needsProfile;
  }
  async function loadLibrary(preferLibrary,valid=()=>true){
    configureAccount();
    if(!signedIn){showLibrary(false);return false;}
    const {trips}=await request('trips');
    if(!valid())return false;
    const show=preferLibrary&&(overlay||trips.length>0||needsProfile);
    showLibrary(show);
    list.textContent=trips.length?'':'No saved trips yet.';
    for(const trip of trips){
      const button=document.createElement('button');button.type='button';
      const name=document.createElement('strong'),date=document.createElement('span');
      const current=trip.id===activeTrip?.id;
      if(current)button.setAttribute('aria-current','true');
      name.textContent=(current?'Current trip':'Resume')+' · '+trip.destination;
      date.textContent=dateLabel(current?activeTrip.date:trip.date);
      button.append(name,date);
      button.onclick=current&&overlay?closeOverlay:()=>launch(button,async signal=>{
        announce('Loading trip…');
        const saved=await request('trips/'+trip.id,'GET',undefined,signal);
        const destination=await restoreDestination(saved.placeId,saved.zone,signal);
        announce('Restoring places…');
        return {trip:{...saved,zone:destination.zone},destination,visits:await loadStops(saved.stops,destination.zone,signal)};
      });
      list.append(button);
    }
    return show;
  }
  function open(){
    dialog.showModal();
    document.body.classList.add('arrival-screen');
    announce('');
    const revision=++accountRevision;
    request('travel-session').then(async data=>{if(revision===accountRevision&&!inFlight){signedIn=data.signedIn;needsProfile=data.needsProfile;await loadLibrary(true);}}).catch(displayError);
  }
  function closeOverlay(){
    if(!overlay||committing)return;
    operation?.abort();operation=null;inFlight=false;libraryRevision++;
    dialog.removeAttribute('aria-busy');
    dialog.close();overlay=false;delete dialog.dataset.overlay;
    closeButton.hidden=cancelButton.hidden=true;
    tripButton.focus({preventScroll:true});
  }
  closeButton.onclick=cancelButton.onclick=closeOverlay;
  dialog.addEventListener('cancel',event=>{event.preventDefault();closeOverlay();});
  dialog.addEventListener('click',event=>{
    if(!overlay||event.target!==dialog)return;
    const {top,left,right,bottom}=dialog.getBoundingClientRect();
    if(event.clientX<left||event.clientX>right||event.clientY<top||event.clientY>bottom)closeOverlay();
  });
  window.addEventListener('hashchange',()=>{
    if(dialog.open&&!signedIn&&!inFlight){announce('');showLibrary(false);}
  });
  dialog.querySelector('#new-journey').onclick=async()=>{
    if(inFlight)return;
    if(overlay){
      const marker=libraryRevision;
      inFlight=true;
      try{
        if(!await saver.flush()){announce('Could not save your current trip. Try again or close this panel.');return;}
        if(!overlay||!dialog.open||marker!==libraryRevision)return;
        controller?.abort();selection=null;results.replaceChildren();form.reset();
        field('name').value=activeTrip?.name||'';updateZone();
      }finally{if(marker===libraryRevision)inFlight=false;}
    }
    requestId=crypto.randomUUID();
    announce('');showLibrary(false);field('name').focus();
  };
  dialog.querySelector('#arrival-logout').onclick=async()=>{
    if(inFlight)return;
    accountRevision++;
    inFlight=true;
    const wasOverlay=overlay,marker=libraryRevision;
    try{
      if(!await saver.flush()){announce('Could not save your current trip. Try again or close this panel.');return;}
      if(wasOverlay&&(!overlay||marker!==libraryRevision))return;
      committing=true;
      await request('travel-session','POST',{action:'logout'});
      overlay=false;delete dialog.dataset.overlay;closeButton.hidden=cancelButton.hidden=true;
      activeTrip=null;saver.reset();
      if(wasOverlay){
        document.body.classList.add('arrival-screen');
        controller?.abort();selection=null;results.replaceChildren();form.reset();updateZone();
        onSignOut();
      }
      signedIn=needsProfile=false;migration.open=false;
      field('number').value='';
      list.replaceChildren();announce('');await loadLibrary(false);
    }
    catch(error){displayError(error);}
    finally{inFlight=false;committing=false;}
  };
  field('back').onclick=()=>{
    history.replaceState(null,'',location.pathname+location.search);announce('');showLibrary(false);field('name').focus();
  };
  field('legacy-form').onsubmit=event=>{
    event.preventDefault();
    accountRevision++;
    launch(event.submitter,async()=>{
      const action=dialog.querySelector('#legacy-method').value,secret=dialog.querySelector('#legacy-secret');
      const session=await request('travel-session','POST',{action,email:dialog.querySelector('#legacy-email').value,
        ...(action==='legacy-login'?{password:secret.value}:{number:secret.value})});
      signedIn=session.signedIn;needsProfile=session.needsProfile;secret.value='';
      announce('');await loadLibrary(true);dialog.querySelector('#new-journey').focus();
    });
  };
  field('migrate-form').onsubmit=async event=>{
    event.preventDefault();
    if(inFlight)return;
    const button=event.submitter,name=dialog.querySelector('#migration-name'),number=dialog.querySelector('#migration-number');
    button.disabled=inFlight=true;
    try{
      await request('travel-session','POST',{action:'link-profile',name:name.value,number:number.value});
      number.value='';needsProfile=false;configureAccount();
      announce('Traveler profile linked. Use your name and favorite number on your next visit.');
      dialog.querySelector('#new-journey').focus();
    }catch(error){displayError(error);}
    finally{button.disabled=inFlight=false;}
  };
  const fade=(from,to)=>dialog.animate([{opacity:from},{opacity:to}],
    {duration:reduceMotion.matches?0:600,fill:'forwards',easing:'ease-in-out'});
  async function confirmJourney(data){
    await prepareGlobe();
    const out=fade(1,0);await out.finished;
    announce('');
    first.hidden=library.hidden=legacyAccess.hidden=true;second.hidden=false;
    dialog.removeAttribute('aria-labelledby');dialog.setAttribute('aria-label','Arrival confirmation');
    fillConfirmation(data.trip,data.destination);
    scroll.scrollTop=0;second.focus({preventScroll:true});
    const incoming=fade(0,1);
    const rise=Promise.resolve(raiseGlobe(reduceMotion.matches)).catch(()=>{});
    out.cancel();await incoming.finished;incoming.cancel();
    await new Promise(resolve=>setTimeout(resolve,3000));
    const end=fade(1,0);await end.finished;
    dialog.close();end.cancel();
    await rise;
  }
  async function launch(button,prepare){
    if(inFlight)return;
    inFlight=true;
    const fromPlanner=overlay,task=new AbortController();
    operation=task;
    dialog.setAttribute('aria-busy','true');
    button.disabled=true;
    announce('Preparing your trip…');
    notice.scrollIntoView({block:'nearest'});
    try{
      if(fromPlanner&&!await saver.flush()){
        if(!task.signal.aborted)announce('Could not save your current trip. Try again or close this panel.');
        return;
      }
      task.signal.throwIfAborted();
      const data=await prepare(task.signal);
      task.signal.throwIfAborted();
      if(!data)return;
      committing=true;
      activeTrip=data.trip;
      saver.reset();
      dialog.removeAttribute('aria-busy');
      if(!fromPlanner)await confirmJourney(data);
      try{await onJourney({...data,arrival:!fromPlanner});}
      finally{
        committing=false;
        if(fromPlanner)closeOverlay();
        else{document.body.classList.remove('arrival-screen');tripButton.focus({preventScroll:true});}
      }
    }catch(error){if(!task.signal.aborted)displayError(error);}
    finally{
      button.disabled=false;
      if(operation===task){operation=null;inFlight=false;committing=false;dialog.removeAttribute('aria-busy');}
    }
  }
  async function createJourney(signal){
    if(!selection?.id||![selection.lat,selection.lng].every(Number.isFinite)){
      announce('');destinationResults('Choose a verified destination first.');action.focus();return;
    }
    if(!field('name').value.trim()){field('name').focus();announce('Enter your traveler name.');return;}
    const destination=selection;
    const trip={requestId,name:field('name').value.trim(),destination:userDestination,placeId:destination.id,
      zone:destination.zone,date:dateInZone(destination.zone),time:'09:00',stops:[]};
    announce('Saving your trip…');
    if(overlay)committing=true;
    const saved=await request('trips','POST',trip);
    signal?.throwIfAborted();
    const verified=saved.placeId===destination.id?{...destination,zone:saved.zone||destination.zone}:await restoreDestination(saved.placeId,saved.zone,signal);
    requestId=crypto.randomUUID();
    return {trip:saved,destination:verified,visits:[]};
  }
  form.onsubmit=event=>{
    event.preventDefault();
    accountRevision++;
    launch(begin,async signal=>{
      if(!signedIn){
        const credentials={action:'enter-profile',name:field('name').value.trim(),number:field('number').value,allowCreate:!!selection};
        const session=await request('travel-session','POST',credentials);
        signedIn=session.signedIn;needsProfile=session.needsProfile;
        field('number').value='';
        if(await loadLibrary(true)){announce('');dialog.querySelector('#previous-trips button')?.focus();return;}
      }
      return createJourney(signal);
    });
  };
  async function openLibrary(){
    if(!activeTrip||dialog.open)return;
    overlay=true;dialog.dataset.overlay='true';closeButton.hidden=false;
    showLibrary(true);
    list.textContent='Loading trips…';announce('');
    dialog.showModal();closeButton.focus();
    const revision=++libraryRevision;
    try{await loadLibrary(true,()=>overlay&&revision===libraryRevision);}
    catch(error){if(overlay&&revision===libraryRevision){list.textContent='Could not load trips.';displayError(error);}}
  }
  tripButton.onclick=openLibrary;
  saveButton.onclick=saver.flush;
  return {open,save(snapshot){if(activeTrip)saver.enqueue({...activeTrip,...snapshot});}};
}
