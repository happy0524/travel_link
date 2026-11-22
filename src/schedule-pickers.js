import {locale,ui} from './ui-copy.js';

const pad=value=>String(value).padStart(2,'0');
const iso=date=>date.toISOString().slice(0,10);
const utcDate=value=>new Date(value+'T00:00:00Z');
const sameMonth=(a,b)=>a.getUTCFullYear()===b.getUTCFullYear()&&a.getUTCMonth()===b.getUTCMonth();
const weekdays=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const monthLabel=new Intl.DateTimeFormat(locale,{month:'long',year:'numeric',timeZone:'UTC'});
const dayLabel=new Intl.DateTimeFormat(locale,{weekday:'long',timeZone:'UTC'});

function dateWithinMonth(date,move){
  const next=new Date(date),day=next.getUTCDate();
  next.setUTCDate(1);next.setUTCMonth(next.getUTCMonth()+move);
  const last=new Date(next);last.setUTCMonth(last.getUTCMonth()+1,0);
  next.setUTCDate(Math.min(day,last.getUTCDate()));
  return next;
}

function button(label,attributes={}){
  const element=document.createElement('button');element.type='button';element.textContent=label;
  for(const [key,value] of Object.entries(attributes))element.setAttribute(key,String(value));
  return element;
}

export function setupSchedulePickers({date,time,today,prefix=''}){
  const triggers={date:document.getElementById(prefix+'open-date'),time:document.getElementById(prefix+'open-time')};
  const panels={date:document.getElementById(prefix+'date-popover'),time:document.getElementById(prefix+'time-popover')};
  let active,calendarFocus,draft;

  function sync(){
    triggers.date.textContent=date.value||'Choose a date';
    triggers.date.setAttribute('aria-label',ui.travelDate+' · '+triggers.date.textContent);
    const [h,m]=time.value.split(':').map(Number);
    triggers.time.textContent=Number.isFinite(h)&&Number.isFinite(m)?`${h%12||12}:${pad(m)} ${h<12?'AM':'PM'}`:'Choose a time';
    triggers.time.setAttribute('aria-label',ui.departureTime+' · '+triggers.time.textContent);
  }
  function position(){
    if(!active)return;
    const panel=panels[active],anchor=triggers[active].getBoundingClientRect(),padding=8;
    const header=triggers[active].closest('header');
    const anchorBottom=header&&matchMedia('(max-width: 800px)').matches
      ?Math.max(anchor.bottom,header.getBoundingClientRect().bottom):anchor.bottom;
    const below=innerHeight-anchorBottom-2*padding,above=anchor.top-2*padding;
    const needed=panel.scrollHeight;
    const flip=below<Math.min(needed,235)&&above>below;
    panel.style.maxHeight=`${Math.max(80,flip?above:below)}px`;
    const width=panel.offsetWidth;
    panel.style.left=`${Math.max(padding,Math.min(anchor.left,innerWidth-width-padding))}px`;
    panel.style.top=`${flip?Math.max(padding,anchor.top-panel.offsetHeight-padding):anchorBottom+padding}px`;
  }
  function close({restore=false}={}){
    if(!active)return;
    const type=active;active=null;
    panels[type].hidden=true;triggers[type].setAttribute('aria-expanded','false');
    if(restore)triggers[type].focus({preventScroll:true});
  }
  function commit(input,value){
    close({restore:true});
    if(input.value===value)return;
    input.value=value;input.dispatchEvent(new Event('change',{bubbles:true}));
  }
  function renderCalendar(focus='day'){
    const panel=panels.date;
    const month=new Date(calendarFocus);month.setUTCDate(1);
    const heading=document.createElement('div');heading.className='calendar-heading';
    const title=document.createElement('strong');title.textContent=monthLabel.format(month);title.setAttribute('aria-live','polite');
    const prev=button('‹',{'aria-label':'Previous month'}),next=button('›',{'aria-label':'Next month'});
    const moveMonth=(offset,key)=>{calendarFocus=dateWithinMonth(calendarFocus,offset);renderCalendar(key);};
    prev.onclick=()=>moveMonth(-1,'prev');next.onclick=()=>moveMonth(1,'next');heading.append(prev,title,next);
    const grid=document.createElement('div');grid.className='calendar-grid';
    for(const weekday of weekdays){const label=document.createElement('span');label.textContent=weekday;grid.append(label);}
    for(let i=0;i<month.getUTCDay();i++)grid.append(document.createElement('span'));
    let focusedDay;
    for(const day=new Date(month);sameMonth(day,month);day.setUTCDate(day.getUTCDate()+1)){
      const value=iso(day),current=value===iso(calendarFocus);
      const isToday=value===today();
      const cell=button(String(day.getUTCDate()),{'aria-label':value+' '+dayLabel.format(day)+(isToday?' · Today':''),'aria-pressed':value===date.value,tabindex:current?0:-1});
      if(isToday){cell.setAttribute('aria-current','date');cell.title='Today';}
      if(current)focusedDay=cell;
      cell.onclick=()=>commit(date,value);
      cell.onkeydown=event=>{
        const day=utcDate(value),delta={ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7,Home:-day.getUTCDay(),End:6-day.getUTCDay()}[event.key];
        if(event.key==='PageUp'||event.key==='PageDown')calendarFocus=dateWithinMonth(day,event.key==='PageUp'?-1:1);
        else if(delta!==undefined){day.setUTCDate(day.getUTCDate()+delta);calendarFocus=day;}
        else return;
        event.preventDefault();renderCalendar();
      };
      grid.append(cell);
    }
    panel.replaceChildren(heading,grid);position();
    (focus==='prev'?prev:focus==='next'?next:focusedDay)?.focus({preventScroll:true});
  }
  function renderTime(){
    const panel=panels.time,columns=document.createElement('div');columns.className='time-columns';
    const groups=[['period','AM / PM',['AM','PM']],['hour','Hour',Array.from({length:12},(_,i)=>i+1)],['minute','Minute',Array.from({length:60},(_,i)=>i)]];
    let first;
    for(const [key,label,values] of groups){
      const column=document.createElement('div'),heading=document.createElement('strong');heading.textContent=label;
      const choices=document.createElement('div');choices.className='time-options';choices.setAttribute('role','group');choices.setAttribute('aria-label',label);
      values.forEach((value,index)=>{
        const option=button(key==='minute'?pad(value):value,{'aria-pressed':value===draft[key],tabindex:value===draft[key]?0:-1});
        option.onclick=()=>{
          draft[key]=value;
          for(const peer of choices.children){peer.setAttribute('aria-pressed',String(peer===option));peer.tabIndex=peer===option?0:-1;}
        };
        option.onkeydown=event=>{
          const target={ArrowUp:Math.max(0,index-1),ArrowDown:Math.min(values.length-1,index+1),Home:0,End:values.length-1}[event.key];
          if(target===undefined)return;
          event.preventDefault();const other=choices.children[target];other.click();other.focus();
        };
        choices.append(option);
      });
      column.append(heading,choices);columns.append(column);
      first??=choices.querySelector('[aria-pressed=true]');
    }
    const apply=button('Apply time');apply.className='schedule-apply';
    apply.onclick=()=>commit(time,`${pad(draft.hour%12+(draft.period==='PM'?12:0))}:${pad(draft.minute)}`);
    panel.replaceChildren(columns,apply);position();
    for(const list of panel.querySelectorAll('.time-options')){
      const selected=list.querySelector('[aria-pressed=true]');list.scrollTop=selected.offsetTop-selected.offsetHeight;
    }
    first?.focus({preventScroll:true});
  }
  function toggle(type){
    if(active===type){close({restore:true});return;}
    close();active=type;panels[type].hidden=false;triggers[type].setAttribute('aria-expanded','true');
    if(type==='date'){calendarFocus=utcDate(date.value||today());renderCalendar();}
    else{
      const [hour,minute]=time.value.split(':').map(Number);
      draft={period:hour>=12?'PM':'AM',hour:hour%12||12,minute:minute||0};renderTime();
    }
  }
  for(const type of ['date','time'])triggers[type].onclick=()=>toggle(type);
  document.addEventListener('pointerdown',event=>{
    if(active&&!panels[active].contains(event.target)&&!triggers[active].contains(event.target))close();
  });
  document.addEventListener('keydown',event=>{
    if(active&&event.key==='Escape'){event.preventDefault();close({restore:true});}
  });
  document.addEventListener('focusin',event=>{
    if(active&&!panels[active].contains(event.target)&&!triggers[active].contains(event.target))close();
  });
  window.addEventListener('resize',position);
  const scroller=triggers.date.closest('.arrival-scroll');
  scroller?.addEventListener('scroll',()=>{
    if(!active)return;
    const bounds=scroller.getBoundingClientRect(),anchor=triggers[active].getBoundingClientRect();
    if(anchor.bottom<bounds.top||anchor.top>bounds.bottom)close();
    else position();
  });
  date.addEventListener('change',sync);time.addEventListener('change',sync);sync();
  return {sync};
}
