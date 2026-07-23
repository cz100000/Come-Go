const STORAGE_KEY='arbeitszeit-pwa-v1';
const STORAGE_BACKUP_KEY=STORAGE_KEY+'-backup';
const STORAGE_CORRUPT_KEY=STORAGE_KEY+'-corrupt';
const BACKUP_FORMAT='arbeitszeit-pwa-backup';
let storageNotice='';
const CHECKPOINT_DATE='2026-07-22';
const CHECKPOINT_MINUTES=11631;
const APP_VERSION='5.7';
const CURRENT_SCHEMA=9;
const IMPORT_DATA_VERSION=2;
let state=loadState();
let currentView='day';
let cursorDate=parseDateKey(state.settings.lastEditedDay||todayKey());
let monthDrill=null;
let editingEntries=[];
let absenceEditorContext=null;
let lastModalFocus=null;
let confettiTimer=null;

const $=id=>document.getElementById(id);
const SVG={
  in:`<svg class="icon" viewBox="0 0 32 32"><path d="M11 5.5h12v21H11"/><path d="M4.5 16h16M15.5 10.5 21 16l-5.5 5.5"/></svg>`,
  out:`<svg class="icon" viewBox="0 0 32 32"><path d="M21 5.5H9v21h12"/><path d="M27.5 16h-16M16.5 10.5 11 16l5.5 5.5"/></svg>`,
  check:`<svg class="icon" viewBox="0 0 24 24"><path d="m6 12 4 4 8-9"/></svg>`,
  edit:`<svg class="icon" viewBox="0 0 24 24"><path d="M4 20h4l11-11-4-4L4 16zM13.5 6.5l4 4"/></svg>`,
  pause:`<svg class="icon" viewBox="0 0 24 24"><path d="M5 7h11v6a5.5 5.5 0 0 1-11 0zM16 9h2.2a2.8 2.8 0 0 1 0 5.6H16M4 20h14"/></svg>`,
  note:`<svg class="icon" viewBox="0 0 24 24"><path d="M21 12a8 8 0 0 1-8 8H7l-4 2 1.4-4.2A8 8 0 1 1 21 12Z"/></svg>`
};

function todayKey(){return dateKey(new Date())}
function dateKey(d){return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`}
function parseDateKey(k){const [y,m,d]=String(k||todayKey()).split('-').map(Number);return new Date(y,m-1,d,12)}
function pad(n){return String(n).padStart(2,'0')}
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function hm(d=new Date()){return `${pad(d.getHours())}:${pad(d.getMinutes())}`}
function minutes(t){if(!t)return 0;const [h,m]=String(t).split(':').map(Number);return (Number(h)||0)*60+(Number(m)||0)}
function clockFromMinutes(v){v=((Math.round(v)%1440)+1440)%1440;return `${pad(Math.floor(v/60))}:${pad(v%60)}`}
function roundLogged(t,type){const m=minutes(t);return clockFromMinutes(type==='in'?Math.ceil(m/5)*5:Math.floor(m/5)*5)}
function formatDuration(v,{signed=true}={}){v=Math.round(Number(v)||0);const sign=signed?(v<0?'-':v>0?'+':''):'';v=Math.abs(v);return `${sign}${pad(Math.floor(v/60))}:${pad(v%60)}`}
function parseSignedTime(v){const m=String(v||'').trim().replace(',',':').match(/^([+-])?(\d{1,4})(?::(\d{1,2}))?$/);if(!m)return null;const n=Number(m[2])*60+Number(m[3]||0);return m[1]==='-'?-n:n}
function formatDate(k,opts={weekday:'long',day:'2-digit',month:'long',year:'numeric'}){return new Intl.DateTimeFormat('de-DE',opts).format(parseDateKey(k))}
function hasMeaningfulData(d){return !!(d&&((d.entries&&d.entries.length)||(Number(d.pauseMinutes)||0)||d.absence||d.note||d.edited||d.capturedAfterImport))}
function clone(v){return JSON.parse(JSON.stringify(v))}

function isProtectedLocalDay(d){
  if(!d)return false;
  if(d.date>CHECKPOINT_DATE)return true;
  if(d.edited||d.capturedAfterImport||d.modifiedAt||d.importCleared)return true;
  if(!d.sourceYear&&hasMeaningfulData(d))return true;
  return (d.entries||[]).some(e=>e&&(['capture','manual'].includes(e.source)||e.edited));
}
function migrateState(raw){
  const migrated=raw&&typeof raw==='object'?raw:{};
  migrated.days=migrated.days&&typeof migrated.days==='object'?migrated.days:{};
  migrated.settings=migrated.settings&&typeof migrated.settings==='object'?migrated.settings:{};
  for(const original of IMPORTED){
    const existing=migrated.days[original.date];
    if(!existing||!isProtectedLocalDay(existing))migrated.days[original.date]=clone(original);
  }
  const preservedDay=migrated.days['2026-07-23'];
  if(!hasMeaningfulData(preservedDay)){
    migrated.days['2026-07-23']={date:'2026-07-23',entries:[
      {type:'in',actual:'11:35',logged:'11:35',source:'manual',createdAt:'2026-07-23T11:35:00'},
      {type:'out',actual:'18:25',logged:'18:25',source:'manual',createdAt:'2026-07-23T18:25:00'}
    ],pauseMinutes:80,absence:null,note:'',archived:false,sourceYear:null,capturedAfterImport:true,modifiedAt:'2026-07-23T18:25:00'};
  }
  const s=migrated.settings;
  if(!Number.isFinite(s.targetMinutes))s.targetMinutes=480;
  if(typeof s.employeeName!=='string')s.employeeName='';
  if(typeof s.freeChristmasEve!=='boolean')s.freeChristmasEve=true;
  if(typeof s.freeNewYearsEve!=='boolean')s.freeNewYearsEve=true;
  if(typeof s.reportSignature!=='boolean')s.reportSignature=true;
  if(typeof s.countdownEnabled!=='boolean')s.countdownEnabled=true;
  if(typeof s.countdownCelebratedDate!=='string')s.countdownCelebratedDate=null;
  s.balanceCheckpointDate=CHECKPOINT_DATE;
  if(!Number.isFinite(s.balanceCheckpointMinutes)||s.balanceCheckpointVersion!==IMPORT_DATA_VERSION)s.balanceCheckpointMinutes=CHECKPOINT_MINUTES;
  s.balanceCheckpointVersion=IMPORT_DATA_VERSION;
  s.importDataVersion=IMPORT_DATA_VERSION;
  s.schemaVersion=CURRENT_SCHEMA;
  Object.values(migrated.days).forEach(d=>{
    if(!Array.isArray(d.entries))d.entries=[];
    d.entries=d.entries.map(e=>({type:e.type==='out'?'out':'in',actual:e.actual||'',logged:e.logged||roundLogged(e.actual||'00:00',e.type==='out'?'out':'in'),source:e.source||((d.sourceYear&&!d.edited)?'import':'manual'),createdAt:e.createdAt||null,edited:!!e.edited}));
    if(!Number.isFinite(Number(d.pauseMinutes)))d.pauseMinutes=0;
    if(d.absence==='Halber Urlaub'){d.absence='Urlaub';d.absenceCode='vacation';d.absenceDuration='half'}
    if(d.absence==='Gleittag'){d.absence='Zeitausgleich';d.absenceCode='timeOff'}
    if(d.absence&&!d.absenceCode)d.absenceCode=absenceCodeFromLabel(d.absence);
    if(d.absence&&!d.absenceDuration)d.absenceDuration='full';
    if(d.absenceNote==null)d.absenceNote='';
    if(d.absenceMinutes!=null&&!Number.isFinite(Number(d.absenceMinutes)))delete d.absenceMinutes;
  });
  if(!s.lastEditedDay||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(s.lastEditedDay))s.lastEditedDay=findLatestRelevantDay(migrated.days);
  return migrated;
}
function findLatestRelevantDay(days){
  const t=todayKey();
  const candidates=Object.values(days||{}).filter(d=>d.date<=t&&hasMeaningfulData(d)).sort((a,b)=>b.date.localeCompare(a.date));
  return candidates[0]?.date||t;
}
function isDateKey(v){return /^\d{4}-\d{2}-\d{2}$/.test(String(v||''))}
function isClock(v){return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(v||''))}
function validateDayRecord(day,key){
  if(!day||typeof day!=='object'||!isDateKey(day.date||key))return false;
  if(!Array.isArray(day.entries))return false;
  if(day.entries.some(e=>!e||!['in','out'].includes(e.type)||(e.actual&&!isClock(e.actual))||(e.logged&&!isClock(e.logged))))return false;
  if(!Number.isFinite(Number(day.pauseMinutes||0))||Number(day.pauseMinutes||0)<0||Number(day.pauseMinutes||0)>1440)return false;
  return true;
}
function validateStateShape(raw){
  if(!raw||typeof raw!=='object')throw new Error('Backup enthält kein Datenobjekt.');
  if(raw.format===BACKUP_FORMAT)raw=raw.state;
  if(raw.compact===true){
    if(!raw.settings||typeof raw.settings!=='object'||!raw.overrides||typeof raw.overrides!=='object')throw new Error('Kompakter Speicherstand ist unvollständig.');
    Object.entries(raw.overrides).forEach(([k,d])=>{if(!validateDayRecord(d,k))throw new Error(`Ungültiger Tag: ${k}`)});
    return raw;
  }
  if(!raw.days||typeof raw.days!=='object'||!raw.settings||typeof raw.settings!=='object')throw new Error('Backup-Struktur ist unvollständig.');
  Object.entries(raw.days).forEach(([k,d])=>{if(!validateDayRecord(d,k))throw new Error(`Ungültiger Tag: ${k}`)});
  return raw;
}
function compactState(full){
  const overrides={};
  Object.entries(full.days||{}).forEach(([k,d])=>{
    const original=IMPORTED_BY_DATE[k];
    if(!original||isProtectedLocalDay(d)||JSON.stringify(d)!==JSON.stringify(original))overrides[k]=d;
  });
  return{compact:true,schemaVersion:CURRENT_SCHEMA,appVersion:APP_VERSION,savedAt:new Date().toISOString(),settings:full.settings,overrides};
}
function expandCompact(raw){
  const days=Object.fromEntries(IMPORTED.map(d=>[d.date,clone(d)]));
  Object.entries(raw.overrides||{}).forEach(([k,d])=>{days[k]=clone(d)});
  return{days,settings:clone(raw.settings||{})};
}
function parseStored(raw){
  const parsed=validateStateShape(JSON.parse(raw));
  return parsed.compact===true?expandCompact(parsed):parsed;
}
function loadState(){
  const primary=localStorage.getItem(STORAGE_KEY);
  if(primary){
    try{return migrateState(parseStored(primary))}catch(e){
      try{localStorage.setItem(STORAGE_CORRUPT_KEY,primary)}catch(_e){}
      const backup=localStorage.getItem(STORAGE_BACKUP_KEY);
      if(backup){try{storageNotice='Der Hauptspeicher war beschädigt. Die letzte Sicherung wurde geladen.';return migrateState(parseStored(backup))}catch(_e){}}
      storageNotice='Gespeicherte Daten konnten nicht gelesen werden. Der beschädigte Stand wurde separat erhalten.';
    }
  }
  return migrateState(null);
}
function saveState(){
  try{
    const payload=JSON.stringify(compactState(state));
    const previous=localStorage.getItem(STORAGE_KEY);
    if(previous)localStorage.setItem(STORAGE_BACKUP_KEY,previous);
    localStorage.setItem(STORAGE_KEY,payload);
    return true;
  }catch(e){
    storageNotice='Speichern fehlgeschlagen. Bitte ein JSON-Backup exportieren und freien Gerätespeicher prüfen.';
    if(typeof showToast==='function')showToast(storageNotice);
    console.error('Arbeitszeit: Speichern fehlgeschlagen',e);
    return false;
  }
}
function touchDay(k){state.settings.lastEditedDay=k;state.settings.lastActivityAt=new Date().toISOString();saveState()}
function dayObject(k,create=false){
  if(state.days[k])return state.days[k];
  const d={date:k,entries:[],pauseMinutes:0,absence:null,note:'',archived:Number(k.slice(0,4))<new Date().getFullYear(),sourceYear:null};
  if(create)state.days[k]=d;
  return d;
}

function easterSunday(y){const a=y%19,b=Math.floor(y/100),c=y%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),month=Math.floor((h+l-7*m+114)/31),day=((h+l-7*m+114)%31)+1;return new Date(y,month-1,day,12)}
function addDays(d,n){const x=new Date(d);x.setDate(x.getDate()+n);return dateKey(x)}
function hessenHolidays(y){
  const e=easterSunday(y),h={};
  h[`${y}-01-01`]='Neujahr';h[addDays(e,-2)]='Karfreitag';h[addDays(e,1)]='Ostermontag';h[`${y}-05-01`]='Tag der Arbeit';h[addDays(e,39)]='Christi Himmelfahrt';h[addDays(e,50)]='Pfingstmontag';h[addDays(e,60)]='Fronleichnam';h[`${y}-10-03`]='Tag der Deutschen Einheit';h[`${y}-12-25`]='1. Weihnachtsfeiertag';h[`${y}-12-26`]='2. Weihnachtsfeiertag';
  if(state.settings.freeChristmasEve)h[`${y}-12-24`]='Heiligabend (betrieblich frei)';
  if(state.settings.freeNewYearsEve)h[`${y}-12-31`]='Silvester (betrieblich frei)';
  return h;
}
function ensureHolidayYear(y){
  const holidays=hessenHolidays(y);
  Object.entries(holidays).forEach(([k,name])=>{
    const d=state.days[k];
    if(!d)state.days[k]={date:k,entries:[],pauseMinutes:0,absence:'Feiertag',note:'',holiday:name,generatedHoliday:true,archived:y<new Date().getFullYear()};
    else if(d.generatedHoliday&&!d.edited){d.absence='Feiertag';d.holiday=name}
  });
  Object.values(state.days).filter(d=>d.generatedHoliday&&!d.edited&&d.date.startsWith(`${y}-`)&&!holidays[d.date]).forEach(d=>delete state.days[d.date]);
  saveState();
}

function validateEntries(entries){
  let plausible=true,previousActual=null,previousLogged=null;
  entries.forEach((e,i)=>{
    if(e.type!==(i%2===0?'in':'out'))plausible=false;
    if(e.actual){const t=minutes(e.actual);if(previousActual!==null&&t<previousActual)plausible=false;previousActual=t}
    if(e.logged){const t=minutes(e.logged);if(previousLogged!==null&&t-previousLogged<5)plausible=false;previousLogged=t}
  });
  const complete=entries.length>0&&entries.length%2===0&&entries.every((e,i)=>e.type===(i%2===0?'in':'out'));
  return{complete,plausible};
}

function absenceCodeFromLabel(label){
  const v=String(label||'').toLowerCase();
  if(v.includes('urlaub'))return'vacation';
  if(v.includes('krank'))return'sick';
  if(v.includes('gleit')||v.includes('zeitausgleich'))return'timeOff';
  if(v.includes('feiertag'))return'holiday';
  if(v.includes('frei'))return'free';
  return label?'other':null;
}
function absenceLabel(code){return({vacation:'Urlaub',sick:'Krankheit',timeOff:'Zeitausgleich',other:'Sonstige Abwesenheit',holiday:'Feiertag',free:'Frei'})[code]||'Sonstige Abwesenheit'}
function absenceDuration(d){return d?.absenceDuration==='half'||d?.absence==='Halber Urlaub'?'half':'full'}
function absenceFraction(d){return absenceDuration(d)==='half'?0.5:1}
function targetMinutesForDate(k){const wd=parseDateKey(k).getDay();return wd>=1&&wd<=5?Number(state.settings.targetMinutes)||480:0}
function absenceCreditMinutes(d,target=targetMinutesForDate(d?.date||todayKey())){
  if(!d?.absence)return 0;
  if(Number.isFinite(Number(d.absenceMinutes)))return Math.max(0,Number(d.absenceMinutes));
  return absenceDuration(d)==='half'?Math.round(target/2):target;
}
function absenceSummaryText(d){
  if(!d?.absence)return'Keine Abwesenheit eingetragen';
  const extent=absenceDuration(d)==='half'?'Halber Tag':'Ganzer Tag';
  return `${d.absence} · ${extent} · ${formatDuration(absenceCreditMinutes(d),{signed:false})} angerechnet`;
}
function absenceGroupDays(groupId){return groupId?Object.values(state.days).filter(d=>d.absenceGroupId===groupId).sort((a,b)=>a.date.localeCompare(b.date)):[]}
function hasFullAbsence(d){return !!(d?.absence&&absenceDuration(d)==='full')}
function clearAbsenceFields(d){
  d.absence=null;d.absenceCode=null;d.absenceDuration=null;d.absenceMinutes=0;d.absenceNote='';d.absenceGroupId=null;d.absenceCreatedAt=null;d.absenceUpdatedAt=null;
}
function dateRange(from,to){const a=parseDateKey(from),b=parseDateKey(to),r=[];for(let d=new Date(a);d<=b;d.setDate(d.getDate()+1))r.push(dateKey(d));return r}
function holidayNameForDate(k){const d=state.days[k];if(d?.holiday||d?.generatedHoliday||d?.absenceCode==='holiday')return d.holiday||'Feiertag';return hessenHolidays(Number(k.slice(0,4)))[k]||null}
function isAbsenceWorkday(k){const wd=parseDateKey(k).getDay();return wd>=1&&wd<=5&&!holidayNameForDate(k)}
function newAbsenceGroupId(){return `absence-${Date.now()}-${Math.random().toString(36).slice(2,8)}`}
function formatDayCount(v){return Number.isInteger(v)?String(v):String(v).replace('.',',')}

function calculateDay(d){
  if(!d)return{gross:0,net:0,target:0,diff:0,complete:true,plausible:true};
  if(d.sourceYear&&!isProtectedLocalDay(d)&&d.date<=CHECKPOINT_DATE&&Number.isFinite(d.excelDiffMinutes)){
    const net=Number(d.excelNetMinutes)||0,target=Number(d.excelTargetMinutes)||0;
    return{gross:Math.max(0,net+(Number(d.pauseMinutes)||0)),net,target,diff:Number(d.excelDiffMinutes)||0,complete:true,plausible:true};
  }
  const target=targetMinutesForDate(d.date);
  if(d.date>CHECKPOINT_DATE&&!hasMeaningfulData(d))return{gross:0,net:0,target,diff:0,complete:true,plausible:true};
  const entries=d.entries||[],validation=validateEntries(entries);
  let gross=0;
  for(let i=0;i+1<entries.length;i+=2){
    const start=entries[i],end=entries[i+1];
    if(start.type!=='in'||end.type!=='out')continue;
    const from=minutes(start.logged||start.actual),to=minutes(end.logged||end.actual);
    if(to>=from)gross+=to-from;
  }
  const workedNet=Math.max(0,gross-(Number(d.pauseMinutes)||0));
  const credited=absenceCreditMinutes(d,target);
  const net=workedNet+credited;
  return{gross,net,target,diff:net-target,complete:validation.complete,plausible:validation.plausible,workedNet,absenceMinutes:credited};
}
function isCountable(d,cutoff=todayKey()){
  if(!d||d.date>cutoff)return false;
  if(d.date<=CHECKPOINT_DATE&&d.sourceYear&&!isProtectedLocalDay(d))return d.excelIncludedInSummary!==false;
  if(d.absence)return true;
  if(!(d.entries||[]).length)return false;
  const c=calculateDay(d);
  return c.complete&&c.plausible;
}
function metricForDay(d,cutoff=todayKey()){
  if(!isCountable(d,cutoff))return{net:0,target:0,pause:0,diff:0,vacation:0,sick:0,timeOff:0,other:0,incomplete:0};
  const c=calculateDay(d),fraction=absenceFraction(d);
  return{net:c.net,target:c.target,pause:Number(d.pauseMinutes)||0,diff:c.diff,
    vacation:d.absenceCode==='vacation'||d.absence==='Urlaub'?fraction:0,
    sick:d.absenceCode==='sick'||d.absence==='Krankheit'?fraction:0,
    timeOff:d.absenceCode==='timeOff'||d.absence==='Zeitausgleich'||d.absence==='Gleittag'?fraction:0,
    other:d.absence&& !['vacation','sick','timeOff','holiday'].includes(d.absenceCode||absenceCodeFromLabel(d.absence))?fraction:0,
    incomplete:(d.entries||[]).length&&(!c.complete||!c.plausible)?1:0};
}
function originalMetric(k){
  const d=IMPORTED_BY_DATE[k];
  if(!d||d.excelIncludedInSummary===false)return{net:0,target:0,pause:0,diff:0,vacation:0,sick:0,timeOff:0,other:0,incomplete:0};
  const code=d.absenceCode||absenceCodeFromLabel(d.absence),fraction=d.absence==='Halber Urlaub'?0.5:1;
  return{net:Number(d.excelNetMinutes)||0,target:Number(d.excelTargetMinutes)||0,pause:Number(d.pauseMinutes)||0,diff:Number(d.excelDiffMinutes)||0,
    vacation:code==='vacation'?fraction:0,sick:code==='sick'?fraction:0,timeOff:code==='timeOff'?fraction:0,
    other:d.absence&&!['vacation','sick','timeOff','holiday'].includes(code)?fraction:0,incomplete:0};
}
function metricDelta(current,original){const r={};for(const k of ['net','target','pause','diff','vacation','sick','timeOff','other','incomplete'])r[k]=(current[k]||0)-(original[k]||0);return r}
function addMetric(a,b){for(const k of ['net','target','pause','diff','vacation','sick','timeOff','other','incomplete'])a[k]=(a[k]||0)+(b[k]||0);return a}
function historicalAdjustment(start,end){
  const sum={net:0,target:0,pause:0,diff:0,vacation:0,sick:0,other:0,incomplete:0};
  Object.values(state.days).filter(d=>d.date>=start&&d.date<=end&&d.date<=CHECKPOINT_DATE&&isProtectedLocalDay(d)).forEach(d=>addMetric(sum,metricDelta(metricForDay(d,end),originalMetric(d.date))));
  return sum;
}
function postCheckpointMetric(start,end){
  const sum={net:0,target:0,pause:0,diff:0,vacation:0,sick:0,other:0,incomplete:0};
  Object.values(state.days).filter(d=>d.date>=start&&d.date<=end&&d.date>CHECKPOINT_DATE).forEach(d=>addMetric(sum,metricForDay(d,end)));
  return sum;
}
function cumulativeProtectedDiff(end){if(end<'2022-01-01')return 0;return historicalAdjustment('2022-01-01',end).diff}
function balanceBefore(k){
  if(k>CHECKPOINT_DATE){const prev=new Date(parseDateKey(k));prev.setDate(prev.getDate()-1);return balanceThrough(dateKey(prev))}
  const mk=k.slice(0,7),base=MONTHLY_BASELINES[mk];
  if(base)return Number(base.opening)||0+cumulativeProtectedDiff(`${mk}-00`);
  return 0;
}
function balanceThrough(k){
  const cp=Number(state.settings.balanceCheckpointMinutes)||CHECKPOINT_MINUTES;
  if(k>=CHECKPOINT_DATE){
    const cpAdj=historicalAdjustment('2022-01-01',CHECKPOINT_DATE).diff;
    if(k===CHECKPOINT_DATE)return cp+cpAdj;
    return cp+cpAdj+postCheckpointMetric('2026-07-23',k).diff;
  }
  const mk=k.slice(0,7),base=MONTHLY_BASELINES[mk];
  if(!base)return 0;
  const monthStart=`${mk}-01`;
  const originalDiff=Object.values(IMPORTED_BY_DATE).filter(d=>d.date>=monthStart&&d.date<=k&&d.excelIncludedInSummary!==false).reduce((a,d)=>a+(Number(d.excelDiffMinutes)||0),0);
  const prior=cumulativeProtectedDiff(`${mk}-00`),within=historicalAdjustment(monthStart,k).diff;
  const sourceAdjustment=k>=base.cutoff?(Number(base.sourceAdjustment)||0):0;
  return (Number(base.opening)||0)+prior+originalDiff+within+sourceAdjustment;
}
function dayStatus(d){
  if(d.absence)return `${d.absence}${absenceDuration(d)==='half'?' · ½ Tag':''}`;
  if(d.sourceYear&&!d.edited&&!d.capturedAfterImport&&d.date<=CHECKPOINT_DATE)return 'Importiert';
  if(!(d.entries||[]).length)return 'Noch nicht erfasst';
  const c=calculateDay(d);
  if(!c.plausible)return 'Prüfung erforderlich';
  return c.complete?'Vollständig':'Unvollständig';
}
function entrySource(d,e){if(e?.source==='capture')return 'Erfassung';if(e?.source==='manual')return 'Manuell';if(d.edited||e?.edited)return 'Nachträglich geändert';if(d.sourceYear&&!d.capturedAfterImport)return `Import ${d.sourceYear}`;return 'Erfassung'}

function showToast(msg){const t=$('toast');t.textContent=msg;t.classList.add('show');clearTimeout(showToast.timer);showToast.timer=setTimeout(()=>t.classList.remove('show'),1900)}
function showScreen(id){
  document.body.classList.toggle('today-fixed',id==='today');
  document.querySelectorAll('.screen').forEach(s=>s.classList.toggle('active',s.id===id));
  document.querySelectorAll('.tabbar button').forEach(b=>b.classList.toggle('active',b.dataset.screen===id));
  if(id==='today')renderToday();
  if(id==='times'){
    currentView='day';monthDrill=null;cursorDate=parseDateKey(state.settings.lastEditedDay||todayKey());
    document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view==='day'));
    renderTimes();
  }
  if(id==='reports')renderReports();
  if(id==='settings')renderSettings();
  document.querySelector('.app').scrollTo(0,0);window.scrollTo(0,0);
}

function nextActionForDay(d){const last=(d.entries||[]).at(-1);return !last||last.type==='out'?'in':'out'}
function rawRoundedMinutes(t,type){const m=minutes(t);return type==='in'?Math.ceil(m/5)*5:Math.floor(m/5)*5}
function punchAvailability(d,type,actual=hm()){
  const entries=d.entries||[],expected=nextActionForDay(d),last=entries.at(-1),loggedMinutes=rawRoundedMinutes(actual,type);
  if(type!==expected)return{allowed:false,expected,loggedMinutes,loggedText:clockFromMinutes(loggedMinutes),availableAt:null,reason:'sequence'};
  if(loggedMinutes>=1440)return{allowed:false,expected,loggedMinutes,loggedText:'00:00',availableAt:'morgen',reason:'day-boundary'};
  if(!last)return{allowed:true,expected,loggedMinutes,loggedText:clockFromMinutes(loggedMinutes),availableAt:null,reason:null};
  const previous=minutes(last.logged||roundLogged(last.actual,last.type)),minimum=previous+5;
  if(minimum>=1440)return{allowed:false,expected,loggedMinutes,loggedText:clockFromMinutes(loggedMinutes),availableAt:'morgen',reason:'day-boundary'};
  const allowed=loggedMinutes>=minimum;
  const actualThreshold=type==='in'?Math.max(0,minimum-4):minimum;
  return{allowed,expected,loggedMinutes,loggedText:clockFromMinutes(loggedMinutes),minimum,availableAt:clockFromMinutes(actualThreshold),reason:allowed?null:'minimum-gap'};
}
function resetPunchClass(button){button.classList.remove('active','waiting','booked','blocked')}
function applyPunchVisual(button,statusEl,clockEl,{kind,status,clock,disabled}){
  resetPunchClass(button);button.classList.add(kind);button.disabled=disabled;statusEl.textContent=status;clockEl.textContent=clock;
}
function updateTodayPunchState(){
  const d=dayObject(todayKey()),type=nextActionForDay(d),availability=punchAvailability(d,type,hm());
  const button=$('punchAction'),label=$('punchActionLabel'),status=$('punchActionStatus'),clock=$('punchActionClock');
  button.dataset.punch=type;button.classList.toggle('punch-in',type==='in');button.classList.toggle('punch-out',type==='out');
  label.textContent=type==='in'?'Kommen':'Gehen';
  button.querySelector('.punch-icon-box').innerHTML=type==='in'
    ?'<svg class="icon" viewBox="0 0 32 32"><path class="door" d="M11 5.5h12v21H11"/><path d="M4.5 16h16M15.5 10.5 21 16l-5.5 5.5"/></svg>'
    :'<svg class="icon" viewBox="0 0 32 32"><path class="door" d="M21 5.5H9v21h12"/><path d="M27.5 16h-16M16.5 10.5 11 16l5.5 5.5"/></svg>';
  if(hasFullAbsence(d)){applyPunchVisual(button,status,clock,{kind:'blocked',status:'Abwesenheit eingetragen',clock:'–',disabled:true});return}
  applyPunchVisual(button,status,clock,{kind:availability.allowed?'active':'waiting',status:availability.allowed?'Jetzt möglich':availability.availableAt==='morgen'?'Erst morgen wieder möglich':`möglich ab ${availability.availableAt}`,clock:availability.loggedText,disabled:!availability.allowed});
}
function minimumBreakMinutes(workMinutes){
  const work=Math.max(0,Number(workMinutes)||0);
  if(work>540)return 45;
  if(work>360)return 30;
  return 0;
}
function liveGrossMinutes(d,now=new Date()){
  const entries=d?.entries||[];
  let gross=0;
  for(let i=0;i+1<entries.length;i+=2){
    const start=entries[i],end=entries[i+1];
    if(start?.type!=='in'||end?.type!=='out')continue;
    const from=minutes(start.logged||start.actual),to=minutes(end.logged||end.actual);
    if(to>=from)gross+=to-from;
  }
  const last=entries.at(-1);
  if(last?.type==='in'){
    const from=minutes(last.logged||last.actual),to=now.getHours()*60+now.getMinutes();
    if(to>=from)gross+=to-from;
  }
  return Math.max(0,gross);
}
function countdownSnapshot(d,now=new Date()){
  const target=targetMinutesForDate(d?.date||todayKey());
  const absenceCredit=absenceCreditMinutes(d,target);
  const requiredWork=Math.max(0,target-absenceCredit);
  const gross=liveGrossMinutes(d,now);
  const manualPause=Math.max(0,Number(d?.pauseMinutes)||0);
  const workedNet=Math.max(0,gross-manualPause);
  const breakBasis=Math.max(requiredWork,workedNet);
  const requiredBreak=minimumBreakMinutes(breakBasis);
  const pauseRemaining=Math.max(0,requiredBreak-manualPause);
  const remainingWork=Math.max(0,requiredWork-workedNet);
  const achieved=requiredWork>0&&remainingWork===0&&pauseRemaining===0;
  const entries=d?.entries||[],active=entries.at(-1)?.type==='in';
  return{target,requiredWork,gross,workedNet,manualPause,requiredBreak,pauseRemaining,remainingWork,achieved,active,hasEntries:entries.length>0,progress:requiredWork?Math.min(1,workedNet/requiredWork):0,overtime:Math.max(0,workedNet-requiredWork),now};
}
function stopConfetti(){
  clearTimeout(confettiTimer);confettiTimer=null;
  const layer=$('confettiLayer');if(layer){layer.classList.remove('active');layer.replaceChildren()}
}
function triggerGoalConfetti(){
  const layer=$('confettiLayer');if(!layer)return;
  stopConfetti();layer.classList.add('active');
  const banner=document.createElement('div');banner.className='goal-celebration';banner.textContent='Tagesziel erreicht!';layer.appendChild(banner);
  if(!window.matchMedia('(prefers-reduced-motion: reduce)').matches){
    const colors=['#20a553','#1475ff','#f4b400','#d64b4b','#a94bc2'];
    for(let i=0;i<72;i++){
      const piece=document.createElement('i'),shape=i%5===0?'round':i%4===0?'strip':'';
      piece.className=`confetti-piece ${shape}`.trim();
      piece.style.setProperty('--x',`${Math.random()*100}%`);
      piece.style.setProperty('--w',`${5+Math.random()*7}px`);
      piece.style.setProperty('--h',`${shape==='strip'?3:7+Math.random()*8}px`);
      piece.style.setProperty('--c',colors[i%colors.length]);
      piece.style.setProperty('--drift',`${-90+Math.random()*180}px`);
      piece.style.setProperty('--rotation',`${360+Math.random()*900}deg`);
      piece.style.setProperty('--delay',`${Math.random()*.28}s`);
      piece.style.setProperty('--duration',`${1.55+Math.random()*.4}s`);
      layer.appendChild(piece);
    }
  }
  confettiTimer=setTimeout(stopConfetti,2050);
}
function maybeCelebrateCountdown(snapshot){
  if(!state.settings.countdownEnabled||!snapshot?.achieved||state.settings.countdownCelebratedDate===todayKey())return;
  state.settings.countdownCelebratedDate=todayKey();saveState();triggerGoalConfetti();
}
function updateCountdown({allowCelebrate=true}={}){
  const card=$('workCountdown');if(!card)return;
  if(!state.settings.countdownEnabled){card.hidden=true;stopConfetti();return}
  const d=dayObject(todayKey()),target=targetMinutesForDate(todayKey());
  if(target<=0||hasFullAbsence(d)){card.hidden=true;return}
  const snap=countdownSnapshot(d),headline=$('countdownHeadline'),end=$('countdownEnd'),pause=$('countdownPause'),ring=$('countdownRing');
  if(!snap.achieved&&$('confettiLayer')?.classList.contains('active'))stopConfetti();
  card.hidden=false;card.classList.toggle('goal',snap.achieved);card.classList.toggle('pause-open',snap.remainingWork===0&&snap.pauseRemaining>0);
  ring.style.setProperty('--progress',String(snap.progress));
  if(snap.achieved){
    headline.textContent='Tagesziel erreicht!';
    end.textContent=snap.overtime>0?`Aktuelles Zeitguthaben ${formatDuration(snap.overtime)} Std.`:'Die notwendige Arbeitszeit und Pause sind erfüllt.';
  }else if(snap.remainingWork===0&&snap.pauseRemaining>0){
    headline.textContent='Arbeitszeit erreicht';
    end.textContent=`Noch ${snap.pauseRemaining} Min. Mindestpause offen`;
  }else if(!snap.hasEntries){
    headline.textContent='Countdown startet nach dem Kommen';
    end.textContent=`Heutiges Arbeitsziel: ${formatDuration(snap.requiredWork,{signed:false})} Std.`;
  }else{
    headline.textContent=`Noch ${formatDuration(snap.remainingWork,{signed:false})} Std. arbeiten`;
    const projected=new Date(snap.now.getTime()+(snap.remainingWork+snap.pauseRemaining)*60000),time=new Intl.DateTimeFormat('de-DE',{hour:'2-digit',minute:'2-digit'}).format(projected);
    end.textContent=snap.active?`Ende voraussichtlich ${time} Uhr`:`Bei sofortigem Weiterarbeiten: ${time} Uhr`;
  }
  if(snap.requiredBreak===0)pause.textContent='Keine Mindestpause erforderlich.';
  else if(snap.manualPause>=snap.requiredBreak)pause.textContent=`Pause: ${snap.manualPause} Min. erfasst · Mindestpause erfüllt`;
  else pause.textContent=`Pause: ${snap.manualPause} von ${snap.requiredBreak} Min. erfüllt`;
  if(allowCelebrate)maybeCelebrateCountdown(snap);
}
function updateClock(){
  const dateEl=$('todayDateShort');if(dateEl)dateEl.textContent=new Intl.DateTimeFormat('de-DE',{weekday:'long',day:'2-digit',month:'long',year:'numeric'}).format(new Date());
  if(document.body.classList.contains('today-fixed')){updateTodayPunchState();updateCountdown()}
}
function renderToday(){
  ensureHolidayYear(new Date().getFullYear());const d=dayObject(todayKey()),pause=Number(d.pauseMinutes)||0;
  document.title=`Arbeitszeit PWA · Version ${APP_VERSION}`;
  updateClock();
  $('pauseButtonLabel').textContent='Manuelle Pause';$('pauseButtonSub').textContent=pause?`${pause} Minuten eingetragen · ändern`:'Pause eintragen';
  const banner=$('todayAbsenceBanner'),full=hasFullAbsence(d),half=d.absence&&absenceDuration(d)==='half';
  banner.hidden=!d.absence;document.querySelector('.punch-grid').classList.toggle('absence-full',full);
  if(d.absence){
    $('todayAbsenceTitle').textContent=half?`Heute: ${d.absence} (halber Tag)`:`Heute ist ${d.absence} eingetragen`;
    $('todayAbsenceText').textContent=half?`${formatDuration(absenceCreditMinutes(d),{signed:false})} Stunden werden angerechnet; Arbeitszeitbuchungen bleiben möglich.`:`${formatDuration(absenceCreditMinutes(d),{signed:false})} Stunden werden als Sollzeit berücksichtigt.`;
  }
  renderTodayCapture(d);
  updateCountdown();
}
function liveTodayBalanceMinutes(d,now=new Date()){
  const target=targetMinutesForDate(d?.date||todayKey());
  const credit=absenceCreditMinutes(d,target);
  const worked=Math.max(0,liveGrossMinutes(d,now)-(Number(d?.pauseMinutes)||0));
  return worked+credit-target;
}
function renderTodayCapture(d){
  const entries=d.entries||[],blocks=[];
  for(let i=0;i<entries.length;i+=2){const come=entries[i]?.type==='in'?entries[i]:null,go=entries[i+1]?.type==='out'?entries[i+1]:null;if(come)blocks.push({come,go})}
  const count=blocks.length;$('todayBookingCount').textContent=`${count} ${count===1?'Buchung':'Buchungen'}`;
  const rows=blocks.map((b,i)=>{const no=i+1,come=b.come.logged||roundLogged(b.come.actual,'in'),go=b.go?(b.go.logged||roundLogged(b.go.actual,'out')):'läuft';return `<button type="button" class="block-row" onclick="openTodayInTimes()" aria-label="Arbeitsblock ${no} unter Zeiten öffnen"><span class="block-no">${no}</span><span class="block-time in"><i class="block-dot"></i>${esc(come)}</span><span class="block-time out ${b.go?'':'open'}"><i class="block-dot"></i>${esc(go)}</span><svg class="block-chev icon" viewBox="0 0 24 24"><path d="m9 6 6 6-6 6"/></svg></button>`}).join('');
  const empty=!blocks.length?`<div class="capture-empty"><div><b>Noch keine Buchungen</b>${esc(hasFullAbsence(d)?'Für die ganztägige Abwesenheit sind keine Arbeitszeitbuchungen erforderlich.':'Starte den Tag mit „Kommen“.')}</div></div>`:'';
  const balance=liveTodayBalanceMinutes(d),balanceClass=balance>0?'positive':balance<0?'negative':'neutral';
  const saldo=`<div class="today-balance-row ${balanceClass}" aria-live="polite"><span>Tagessaldo heute</span><b>${formatDuration(balance)} Std.</b></div>`;
  $('todayCaptureList').innerHTML=empty+rows+saldo;
}
function openTodayInTimes(){state.settings.lastEditedDay=todayKey();saveState();showScreen('times')}
function performPunch(type){
  const k=todayKey(),d=dayObject(k,true),availability=punchAvailability(d,type,hm());
  if(type!==availability.expected||!availability.allowed){renderToday();showToast(availability.availableAt&&availability.availableAt!=='morgen'?`${type==='in'?'Kommen':'Gehen'} möglich ab ${availability.availableAt}`:'Nächste Buchung erst morgen möglich');return}
  const actual=hm(),logged=availability.loggedText;
  d.entries.push({type,actual,logged,source:'capture',createdAt:new Date().toISOString()});d.capturedAfterImport=true;d.modifiedAt=new Date().toISOString();d.archived=false;state.days[k]=d;touchDay(k);renderToday();
  try{navigator.vibrate?.(28)}catch(e){}
  showToast(`${type==='in'?'Kommen':'Gehen'} gebucht · ${logged}`);
}
function bindPunchButton(button){
  let pointer=null,startX=0,startY=0,cancelled=false;
  const reset=()=>{button.classList.remove('pressed');pointer=null;cancelled=false};
  button.addEventListener('pointerdown',e=>{
    if(button.disabled||(e.pointerType==='mouse'&&e.button!==0))return;
    pointer=e.pointerId;startX=e.clientX;startY=e.clientY;cancelled=false;button.classList.add('pressed');
    try{button.setPointerCapture(e.pointerId)}catch(err){}
    e.preventDefault();
  });
  button.addEventListener('pointermove',e=>{
    if(e.pointerId!==pointer)return;
    const r=button.getBoundingClientRect(),inside=e.clientX>=r.left&&e.clientX<=r.right&&e.clientY>=r.top&&e.clientY<=r.bottom;
    button.classList.toggle('pressed',inside);
  });
  button.addEventListener('pointerup',e=>{
    if(e.pointerId!==pointer)return;
    const r=button.getBoundingClientRect(),inside=e.clientX>=r.left&&e.clientX<=r.right&&e.clientY>=r.top&&e.clientY<=r.bottom;
    const valid=inside&&!button.disabled;reset();if(valid)performPunch(button.dataset.punch);
  });
  button.addEventListener('pointercancel',reset);button.addEventListener('lostpointercapture',()=>{if(pointer!==null)reset()});
}

function setTimesView(v){currentView=v;monthDrill=null;document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===v));renderTimes()}
function renderTimes(){const times=$('times');times?.classList.toggle('day-compact',currentView==='day');if(currentView==='day')renderDayView(dateKey(cursorDate));else if(currentView==='month')renderMonthOverview();else renderYearOverview()}
function renderDayView(k){
  cursorDate=parseDateKey(k);const d=dayObject(k),c=calculateDay(d),status=dayStatus(d),entries=d.entries||[];
  const statusClass=status==='Vollständig'||d.absence?'success':status==='Prüfung erforderlich'?'review':status==='Unvollständig'?'warning':'';
  const source=d.edited?'Nachträglich geändert':d.capturedAfterImport?'Lokale Erfassung':d.sourceYear?`Importierte Daten aus ${d.sourceYear}`:'Lokale Erfassung';
  const rows=entries.length?entries.map((e,i)=>`<tr><td>${i+1}</td><td>${e.type==='in'?'Kommen':'Gehen'}</td><td class="num">${esc(e.actual||'–')}</td><td class="num">${esc(e.logged||'–')}</td><td><span class="booking-source">${esc(entrySource(d,e))}</span></td></tr>`).join(''):`<tr><td colspan="5" class="empty">Keine Buchungen vorhanden</td></tr>`;
  let inNo=0,outNo=0;
  const mobileRows=entries.length?entries.map(e=>{const no=e.type==='in'?++inNo:++outNo,label=e.type==='in'?`Kommen ${no}`:`Gehen ${no}`;return `<article class="booking-mobile-item ${e.type}"><div class="booking-mobile-head"><span class="booking-type-icon">${e.type==='in'?SVG.in:SVG.out}</span><div><b class="booking-mobile-title">${label}</b><span class="booking-mobile-source">${esc(entrySource(d,e))}</span></div><button type="button" class="edit-icon-btn" onclick="openDayEditor('${k}')" aria-label="${label} bearbeiten">${SVG.edit}</button></div><div class="booking-mobile-times"><div class="booking-mobile-time"><span>Tatsächlich</span><b>${esc(e.actual||'–')}</b></div><div class="booking-mobile-time"><span>Dokumentiert</span><b>${esc(e.logged||'–')}</b></div></div></article>`}).join(''):`<div class="empty compact-empty">Keine Buchungen vorhanden</div>`;
  const groupCount=d.absenceGroupId?absenceGroupDays(d.absenceGroupId).length:1;
  const absenceCard=d.absence?`<div class="card detail-list absence-detail-card"><div class="detail-row"><span>Abwesenheit</span><b>${esc(d.absence)}</b></div><div class="detail-row"><span>Umfang</span><b>${absenceDuration(d)==='half'?'Halber Tag':'Ganzer Tag'}</b></div><div class="detail-row"><span>Angerechnete Zeit</span><b class="absence-credit">${formatDuration(absenceCreditMinutes(d),{signed:false})}</b></div><div class="detail-row"><span>Notiz</span><div class="value">${esc(d.absenceNote||'–')}</div></div><div class="absence-actions-inline"><button type="button" onclick="openAbsenceEditorForDay('${k}','day')">Diesen Tag bearbeiten</button>${groupCount>1?`<button type="button" onclick="openAbsenceEditorForDay('${k}','group')">Zeitraum bearbeiten</button>`:''}<button type="button" class="danger" onclick="deleteAbsenceForDay('${k}','day')">Diesen Tag löschen</button>${groupCount>1?`<button type="button" class="danger" onclick="deleteAbsenceForDay('${k}','group')">Zeitraum löschen</button>`:''}</div></div>`:'';
  const diffClass=c.diff<0?'red':c.diff>0?'green':'neutral';
  const balance=balanceThrough(k),balanceClass=balance<0?'red':balance>0?'green':'neutral';
  $('timesContent').innerHTML=`
    <div class="date-nav date-nav-prominent"><button type="button" onclick="changeDay(-1)" aria-label="Vorheriger Tag">‹</button><input type="date" id="dayPicker" value="${k}" aria-label="Datum auswählen"><button type="button" onclick="changeDay(1)" aria-label="Nächster Tag">›</button></div>
    <div class="card day-summary compact-day-summary">
      <div class="day-summary-top"><div class="day-meta">${esc(source)}</div><span class="badge ${statusClass}">${esc(status)}</span></div>
      <div class="balance-hero"><span>Tagessaldo heute</span><strong class="${diffClass}">${formatDuration(c.diff)}</strong></div>
      <div class="metric-grid"><div class="metric"><span>Brutto</span><b>${formatDuration(c.gross,{signed:false})}</b></div><div class="metric"><span>Netto</span><b>${formatDuration(c.net,{signed:false})}</b></div><div class="metric"><span>Soll</span><b>${formatDuration(c.target,{signed:false})}</b></div><div class="metric metric-balance"><span>Zeitkonto</span><b class="${balanceClass}">${formatDuration(balance)}</b></div></div>
    </div>
    ${absenceCard}
    <div class="card booking-card compact-booking-card"><h3 class="booking-section-title">Buchungen</h3><div class="booking-table-wrap table-scroll"><table class="booking-table"><thead><tr><th>Nr.</th><th>Art</th><th class="num">Tatsächlich</th><th class="num">Dokumentiert</th><th>Herkunft</th></tr></thead><tbody>${rows}</tbody></table></div><div class="booking-mobile-list">${mobileRows}</div></div>
    <div class="card day-additional" role="button" tabindex="0" onclick="openDayEditor('${k}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openDayEditor('${k}')}" aria-label="Zusätzliche Angaben bearbeiten">
      <h3>Zusätzliche Angaben</h3>
      <div class="additional-row"><span class="additional-icon pause">${SVG.pause}</span><div><b>Manuelle Pause</b><span>${Number(d.pauseMinutes)||0} Min.</span></div></div>
      <div class="additional-row"><span class="additional-icon note">${SVG.note||SVG.edit}</span><div><b>Kommentar</b><span>${esc(d.note||'Kein Kommentar eingetragen')}</span></div></div>
    </div>`;
  $('dayPicker').addEventListener('change',e=>{cursorDate=parseDateKey(e.target.value);renderDayView(e.target.value)});
}

function changeDay(n){cursorDate.setDate(cursorDate.getDate()+n);renderDayView(dateKey(cursorDate))}
function periodDays(start,end){return Object.values(state.days).filter(d=>d.date>=start&&d.date<=end&&isCountable(d,Math.min(todayKey(),end))).sort((a,b)=>a.date.localeCompare(b.date))}
function monthSummary(y,m){
  const key=`${y}-${pad(m+1)}`,start=`${key}-01`,calendarEnd=dateKey(new Date(y,m+1,0,12)),today=todayKey();
  const base=MONTHLY_BASELINES[key];
  let cutoff=endMin(calendarEnd,today);
  if(base)cutoff=base.cutoff;
  const sum={net:0,target:0,pause:0,diff:0,vacation:0,sick:0,other:0,incomplete:0};
  if(base){for(const k of Object.keys(sum))sum[k]=Number(base[k])||0;addMetric(sum,historicalAdjustment(start,base.cutoff));}
  if(base&&today>base.cutoff&&today.slice(0,7)===key)addMetric(sum,postCheckpointMetric(addDays(parseDateKey(base.cutoff),1),endMin(calendarEnd,today)));
  if(!base){cutoff=endMin(calendarEnd,today);addMetric(sum,postCheckpointMetric(start,cutoff));}
  sum.days=Object.values(state.days).filter(d=>d.date>=start&&d.date<=cutoff&&(hasMeaningfulData(d)||isCountable(d,cutoff))).sort((a,b)=>a.date.localeCompare(b.date));
  sum.opening=base?(Number(base.opening)||0)+cumulativeProtectedDiff(`${key}-00`):balanceBefore(start);
  sum.closing=sum.opening+sum.diff;sum.cutoff=cutoff;sum.calendarEnd=calendarEnd;return sum;
}
function endMin(a,b){return a<b?a:b}
function yearSummary(y){
  const sum={net:0,target:0,pause:0,diff:0,vacation:0,sick:0,other:0,incomplete:0,days:[]};
  const maxMonth=y===Number(todayKey().slice(0,4))?Number(todayKey().slice(5,7))-1:11;
  const monthly=[];for(let m=0;m<=maxMonth;m++){const ms=monthSummary(y,m);monthly.push(ms);addMetric(sum,ms);sum.days.push(...ms.days)}
  const base=YEAR_BASELINES[String(y)];sum.opening=base?(Number(base.opening)||0)+cumulativeProtectedDiff(`${y}-00-00`):balanceBefore(`${y}-01-01`);
  sum.closing=sum.opening+sum.diff;sum.cutoff=monthly.at(-1)?.cutoff||`${y}-01-01`;sum.months=monthly;return sum;
}
function periodSummary(start,end){
  if(/^\d{4}-\d{2}-01$/.test(start)&&end===dateKey(new Date(Number(start.slice(0,4)),Number(start.slice(5,7)),0,12)))return monthSummary(Number(start.slice(0,4)),Number(start.slice(5,7))-1);
  if(start.endsWith('-01-01')&&end.endsWith('-12-31')&&start.slice(0,4)===end.slice(0,4))return yearSummary(Number(start.slice(0,4)));
  const cutoff=endMin(end,todayKey()),days=periodDays(start,cutoff),sum={net:0,target:0,pause:0,diff:0,vacation:0,sick:0,other:0,incomplete:0};
  days.forEach(d=>addMetric(sum,metricForDay(d,cutoff)));sum.days=days;sum.opening=balanceBefore(start);sum.closing=balanceThrough(cutoff);sum.cutoff=cutoff;return sum;
}
function earliestYear(){return Math.min(...Object.keys(state.days).map(k=>Number(k.slice(0,4))),new Date().getFullYear())}
function renderMonthOverview(){
  const now=new Date(),items=[];
  for(let y=now.getFullYear();y>=earliestYear();y--){const maxM=y===now.getFullYear()?now.getMonth():11;for(let m=maxM;m>=0;m--)items.push({y,m})}
  $('timesContent').innerHTML=`<div class="period-list">${items.map(({y,m})=>{const s=monthSummary(y,m),name=new Intl.DateTimeFormat('de-DE',{month:'long',year:'numeric'}).format(new Date(y,m,1)),running=s.cutoff<s.calendarEnd;return `<article class="period-card"><button type="button" onclick="openMonthDetail(${y},${m})"><div class="period-top"><div><h3>${esc(name)}</h3><div class="muted" style="font-size:12px;margin-top:3px">${running?'Stichtag '+formatDate(s.cutoff,{day:'2-digit',month:'2-digit',year:'numeric'}):'Abgeschlossener Monat'}</div></div><div class="period-balance"><span>Monatsdifferenz</span><strong class="${s.diff<0?'red':'green'}">${formatDuration(s.diff)}</strong></div></div><div class="metric-lines"><div class="metric-line"><span>Übertrag aus Vormonat</span><b>${formatDuration(s.opening)}</b></div><div class="metric-line"><span>${running?'Zeitkonto zum Stichtag':'Zeitkonto Monatsende'}</span><b class="${s.closing<0?'red':'green'}">${formatDuration(s.closing)}</b></div><div class="metric-line"><span>Soll / Netto / Pause</span><b>${formatDuration(s.target,{signed:false})} / ${formatDuration(s.net,{signed:false})} / ${formatDuration(s.pause,{signed:false})}</b></div><div class="metric-line"><span>Urlaub / Krankheit / Zeitausgleich / Sonstige</span><b>${formatDayCount(s.vacation)} / ${formatDayCount(s.sick)} / ${formatDayCount(s.timeOff||0)} / ${formatDayCount(s.other)}</b></div><div class="metric-line"><span>Unvollständige Tage</span><b>${s.incomplete}</b></div></div></button></article>`}).join('')}</div>`;
}
function openMonthDetail(y,m){currentView='month';document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view==='month'));monthDrill={y,m};const start=`${y}-${pad(m+1)}-01`,end=dateKey(new Date(y,m+1,0,12)),s=monthSummary(y,m),name=new Intl.DateTimeFormat('de-DE',{month:'long',year:'numeric'}).format(new Date(y,m,1)),running=s.cutoff<s.calendarEnd;
  const rows=s.days.length?s.days.map(d=>{const c=calculateDay(d),first=(d.entries||[]).find(e=>e.type==='in'),last=[...(d.entries||[])].reverse().find(e=>e.type==='out');return `<tr><td class="date-cell">${formatDate(d.date,{day:'2-digit',month:'2-digit',year:'numeric'})}</td><td>${esc(dayStatus(d))}</td><td class="num">${esc(first?.logged||'–')}</td><td class="num">${esc(last?.logged||'–')}</td><td class="num">${Number(d.pauseMinutes)||0}</td><td class="num">${formatDuration(c.net,{signed:false})}</td><td class="num ${c.diff<0?'red':'green'}">${formatDuration(c.diff)}</td><td class="num">${formatDuration(balanceThrough(d.date))}</td><td class="action-cell"><button type="button" class="edit-icon-btn" onclick="openDayEditor('${d.date}')" aria-label="${d.date} bearbeiten">${SVG.edit}</button></td></tr>`}).join(''):`<tr><td colspan="9" class="empty">Keine relevanten Tagesdaten</td></tr>`;
  $('timesContent').innerHTML=`<div class="back-row"><button type="button" onclick="renderMonthOverview()">‹ Alle Monate</button><b>${esc(name)}</b></div><div class="month-detail-summary"><div class="card balance-hero"><span>Monatsdifferenz</span><strong class="${s.diff<0?'red':'green'}">${formatDuration(s.diff)}</strong></div><div class="card balance-hero"><span>${running?'Zeitkonto zum Stichtag':'Zeitkonto Monatsende'}</span><strong class="${s.closing<0?'red':'green'}">${formatDuration(s.closing)}</strong></div></div><div class="table-scroll"><table class="mobile-table"><thead><tr><th class="date-cell">Datum</th><th>Status</th><th class="num">Kommen</th><th class="num">Gehen</th><th class="num">Pause</th><th class="num">Netto</th><th class="num">Diff.</th><th class="num">Zeitkonto</th><th class="action-cell">Aktion</th></tr></thead><tbody>${rows}</tbody></table></div><button type="button" class="secondary-btn" onclick="monthReport(${y},${m})">Monatsbericht öffnen</button>`;
}
function renderYearOverview(){
  const now=new Date(),years=[];for(let y=now.getFullYear();y>=earliestYear();y--)years.push(y);
  $('timesContent').innerHTML=`<div class="period-list">${years.map(y=>{const s=yearSummary(y),imported=y<=2025?'Geprüftes / archiviertes Jahr':'Aktueller Stand';return `<article class="period-card"><button type="button" onclick="openYearDetail(${y})"><div class="period-top"><div><h3>${y}</h3><div class="muted" style="font-size:12px;margin-top:3px">${imported}</div></div><div class="period-balance"><span>Jahresveränderung</span><strong class="${s.diff<0?'red':'green'}">${formatDuration(s.diff)}</strong></div></div><div class="metric-lines"><div class="metric-line"><span>Übertrag aus dem Vorjahr</span><b>${formatDuration(s.opening)}</b></div><div class="metric-line"><span>Zeitkonto ${y===now.getFullYear()?'zum Stichtag':'Jahresende'}</span><b class="${s.closing<0?'red':'green'}">${formatDuration(s.closing)}</b></div><div class="metric-line"><span>Soll / Netto / Pause</span><b>${formatDuration(s.target,{signed:false})} / ${formatDuration(s.net,{signed:false})} / ${formatDuration(s.pause,{signed:false})}</b></div><div class="metric-line"><span>Urlaub / Krankheit / Zeitausgleich / Sonstige</span><b>${formatDayCount(s.vacation)} / ${formatDayCount(s.sick)} / ${formatDayCount(s.timeOff||0)} / ${formatDayCount(s.other)}</b></div></div></button></article>`}).join('')}</div>`;
}
function openYearDetail(y){
  const cards=[];for(let m=11;m>=0;m--){if(y===new Date().getFullYear()&&m>new Date().getMonth())continue;const s=monthSummary(y,m),running=s.cutoff<s.calendarEnd;cards.push(`<article class="period-card"><button type="button" onclick="openMonthDetail(${y},${m})"><div class="period-top"><h3>${new Intl.DateTimeFormat('de-DE',{month:'long'}).format(new Date(y,m,1))}</h3><div class="period-balance"><span>Monatsdifferenz</span><strong class="${s.diff<0?'red':'green'}">${formatDuration(s.diff)}</strong></div></div><div class="metric-lines"><div class="metric-line"><span>${running?'Zeitkonto zum Stichtag':'Zeitkonto Monatsende'}</span><b>${formatDuration(s.closing)}</b></div><div class="metric-line"><span>Netto / Soll</span><b>${formatDuration(s.net,{signed:false})} / ${formatDuration(s.target,{signed:false})}</b></div></div></button></article>`)}
  $('timesContent').innerHTML=`<div class="back-row"><button type="button" onclick="renderYearOverview()">‹ Alle Jahre</button><b>${y}</b></div><div class="period-list">${cards.join('')}</div><button type="button" class="secondary-btn" onclick="yearReport(${y})">Jahresbericht öffnen</button>`;
}
function openDayEditor(k){
  const d=dayObject(k);editingEntries=clone(d.entries||[]);$('editDate').value=k;$('editPause').value=Number(d.pauseMinutes)||0;$('editNote').value=d.note||'';$('dayAbsenceEditorSummary').textContent=absenceSummaryText(d);$('restoreImportBtn').hidden=!IMPORTED_BY_DATE[k];$('deleteDayBtn').disabled=!(d.entries||[]).length&&!Number(d.pauseMinutes);renderEntryEditors();openModal('dayModal')
}
function renderEntryEditors(){
  $('entryEditors').innerHTML=editingEntries.length?`<div class="entry-editor"><div class="entry-editor-head"><span>Art</span><span>Tatsächlich</span><span>Dokumentiert</span><span></span></div>${editingEntries.map((e,i)=>`<div class="entry-edit-row"><select data-entry-type="${i}"><option value="in" ${e.type==='in'?'selected':''}>Kommen</option><option value="out" ${e.type==='out'?'selected':''}>Gehen</option></select><input data-entry-actual="${i}" type="time" value="${esc(e.actual||'')}"><input data-entry-logged="${i}" type="time" value="${esc(e.logged||'')}"><button type="button" class="remove-entry" data-remove-entry="${i}" aria-label="Buchung löschen">×</button></div>`).join('')}</div>`:'<div class="empty">Noch keine Buchungen</div>';
  document.querySelectorAll('[data-entry-type]').forEach(el=>el.addEventListener('change',e=>{editingEntries[Number(e.target.dataset.entryType)].type=e.target.value}));
  document.querySelectorAll('[data-entry-actual]').forEach(el=>el.addEventListener('change',e=>{const i=Number(e.target.dataset.entryActual),entry=editingEntries[i];entry.actual=e.target.value;entry.logged=roundLogged(entry.actual,entry.type);renderEntryEditors()}));
  document.querySelectorAll('[data-entry-logged]').forEach(el=>el.addEventListener('change',e=>{editingEntries[Number(e.target.dataset.entryLogged)].logged=e.target.value}));
  document.querySelectorAll('[data-remove-entry]').forEach(el=>el.addEventListener('click',e=>{editingEntries.splice(Number(e.currentTarget.dataset.removeEntry),1);renderEntryEditors()}));
}
function addEditingEntry(){const type=!editingEntries.length||editingEntries.at(-1).type==='out'?'in':'out',actual=hm();editingEntries.push({type,actual,logged:roundLogged(actual,type),source:'manual',edited:true});renderEntryEditors()}
function saveEditedDay(){
  const oldKey=$('dayModal').dataset.originalDate||$('editDate').value,newKey=$('editDate').value;if(!newKey)return;
  const existing=dayObject(oldKey),d=clone(existing);d.date=newKey;d.entries=editingEntries.map(e=>({...e,source:'manual',edited:true}));d.pauseMinutes=Math.max(0,Number($('editPause').value)||0);d.note=$('editNote').value.trim();d.edited=true;d.modifiedAt=new Date().toISOString();d.archived=Number(newKey.slice(0,4))<new Date().getFullYear();
  const validation=validateEntries(d.entries);if(d.entries.length&&!validation.plausible){alert('Die Buchungen können nicht gespeichert werden. Kommen und Gehen müssen sich abwechseln; jede dokumentierte Uhrzeit muss mindestens fünf Minuten nach der vorherigen liegen.');return}
  if(oldKey!==newKey)delete state.days[oldKey];state.days[newKey]=d;touchDay(newKey);cursorDate=parseDateKey(newKey);closeModal('dayModal');refreshAllDerivedViews();showToast('Tag gespeichert');
}
function deleteEditedDay(){
  const k=$('editDate').value,d=clone(dayObject(k,true));if(!confirm('Alle Kommen-, Gehen- und Pausenbuchungen dieses Tages dauerhaft löschen? Eine vorhandene Abwesenheit und Tagesnotiz bleiben erhalten.'))return;
  d.entries=[];d.pauseMinutes=0;d.edited=true;d.importCleared=!!IMPORTED_BY_DATE[k];d.modifiedAt=new Date().toISOString();state.days[k]=d;touchDay(k);closeModal('dayModal');refreshAllDerivedViews();showToast('Alle Buchungen gelöscht');
}
function openModal(id){
  const modal=$(id);lastModalFocus=document.activeElement;modal.classList.add('open');document.body.classList.add('modal-open');if(id==='dayModal')$('dayModal').dataset.originalDate=$('editDate').value;setTimeout(()=>modal.querySelector('input,select,textarea,button')?.focus(),60)
}
function closeModal(id){
  const modal=$(id);modal.classList.remove('open');if(!document.querySelector('.modal.open'))document.body.classList.remove('modal-open');if(lastModalFocus&&document.contains(lastModalFocus))lastModalFocus.focus({preventScroll:true})
}
function openPauseModal(){$('quickPause').value=Number(dayObject(todayKey()).pauseMinutes)||0;openModal('pauseModal');setTimeout(()=>$('quickPause').focus(),80)}
function saveQuickPause(){const k=todayKey(),d=dayObject(k,true);d.pauseMinutes=Math.max(0,Number($('quickPause').value)||0);d.edited=true;d.modifiedAt=new Date().toISOString();state.days[k]=d;touchDay(k);closeModal('pauseModal');renderToday();showToast('Pause gespeichert')}

let chartMode='month',chartSelection=null;
function renderReports(){
  const t=todayKey(),bal=balanceThrough(t);$('reportBalance').textContent=formatDuration(bal);$('reportBalance').className=bal<0?'red':'green';$('reportDay').value=t;$('reportMonth').value=t.slice(0,7);
  const years=[];for(let y=new Date().getFullYear();y>=earliestYear();y--)years.push(`<option value="${y}">${y}</option>`);$('reportYear').innerHTML=years.join('');$('chartYear').innerHTML=years.join('');$('chartYear').value=String(new Date().getFullYear());renderOvertimeChart();
}
function chartSelect(kind,key){chartSelection={kind,key};renderOvertimeChart()}
function renderOvertimeChart(){
  const host=$('overtimeChart'),detail=$('chartDetail');if(!host||!detail)return;
  $('chartMonthMode').classList.toggle('active',chartMode==='month');$('chartYearMode').classList.toggle('active',chartMode==='year');$('chartYear').disabled=chartMode==='year';
  const items=chartMode==='month'?Array.from({length:12},(_,m)=>{const y=Number($('chartYear').value)||new Date().getFullYear(),s=monthSummary(y,m);return{key:`${y}-${pad(m+1)}`,label:['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'][m],name:new Intl.DateTimeFormat('de-DE',{month:'long',year:'numeric'}).format(new Date(y,m,1)),value:s.diff,summary:s,available:!!MONTHLY_BASELINES[`${y}-${pad(m+1)}`]||s.days.length>0}}):Object.keys(YEAR_BASELINES).map(Number).sort((a,b)=>a-b).map(y=>{const s=yearSummary(y);return{key:String(y),label:String(y),name:`Jahr ${y}`,value:s.diff,summary:s,available:true}});
  const available=items.filter(i=>i.available),max=Math.max(60,...available.map(i=>Math.abs(i.value))),w=360,h=210,padX=25,zero=96,plotH=76,step=(w-padX*2)/Math.max(items.length,1),bar=Math.max(10,Math.min(22,step*.58));
  const ticks=[max,Math.round(max/2),0,-Math.round(max/2),-max];
  let svg=`<svg viewBox="0 0 ${w} ${h}" aria-hidden="true" focusable="false"><g class="chart-grid">${ticks.map((v,i)=>{const y=zero-(v/max)*plotH;return `<line x1="${padX}" x2="${w-padX}" y1="${y}" y2="${y}"/><text x="${padX-5}" y="${y+3}" text-anchor="end">${i===2?'0':Math.round(Math.abs(v)/60)+'h'}</text>`}).join('')}</g><line class="zero-line" x1="${padX}" x2="${w-padX}" y1="${zero}" y2="${zero}"/>`;
  items.forEach((it,i)=>{const x=padX+i*step+(step-bar)/2,val=it.available?it.value:0,bh=Math.abs(val)/max*plotH,y=val>=0?zero-bh:zero,selected=chartSelection?.key===it.key,current=it.key===todayKey().slice(0,chartMode==='month'?7:4);svg+=`<g class="chart-item ${selected?'selected':''} ${current?'current':''} ${it.available?'':'unavailable'}" role="button" tabindex="0" data-chart-key="${it.key}" aria-label="${esc(it.name)} ${formatDuration(val)}"><rect class="chart-hit" x="${padX+i*step}" y="12" width="${step}" height="${h-25}"/><rect class="chart-bar ${val<0?'negative':'positive'}" x="${x}" y="${y}" width="${bar}" height="${Math.max(it.available?2:0,bh)}" rx="4"/><text class="chart-label" x="${x+bar/2}" y="${h-12}" text-anchor="middle">${it.label}</text></g>`});
  host.innerHTML=svg+'</svg>';
  host.querySelectorAll('[data-chart-key]').forEach(el=>{const act=()=>chartSelect(chartMode,el.dataset.chartKey);el.addEventListener('click',act);el.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();act()}})});
  let picked=items.find(i=>i.key===chartSelection?.key&&chartSelection.kind===chartMode)||available.at(-1);if(!picked){detail.innerHTML='<span>Für diese Auswahl liegen noch keine Werte vor.</span>';return}chartSelection={kind:chartMode,key:picked.key};
  const s=picked.summary;detail.innerHTML=`<b>${esc(picked.name)}</b><div><span>${chartMode==='month'?'Monatsdifferenz':'Jahresveränderung'}</span><strong class="${s.diff<0?'red':'green'}">${formatDuration(s.diff)}</strong></div><div><span>Zeitkonto ${s.cutoff<`${picked.key}-99`?'zum Stichtag':'am Ende'}</span><strong>${formatDuration(s.closing)}</strong></div><div><span>Netto / Soll</span><strong>${formatDuration(s.net,{signed:false})} / ${formatDuration(s.target,{signed:false})}</strong></div>`;
}

function refreshAllDerivedViews(){
  renderToday();
  if($('times').classList.contains('active'))renderTimes();
  if($('reports').classList.contains('active'))renderReports();
  if($('settings').classList.contains('active'))renderSettings();
}
function restoreImportedDay(){
  const k=$('editDate').value,original=IMPORTED_BY_DATE[k];if(!original)return;
  if(!confirm('Lokale Änderungen dieses Tages verwerfen und die ursprünglichen Importdaten vollständig wiederherstellen?'))return;
  state.days[k]=clone(original);touchDay(k);closeModal('dayModal');refreshAllDerivedViews();showToast('Importdaten wiederhergestellt');
}
function openQuickAdd(){openModal('quickAddModal')}
function openManualTimeQuick(){closeModal('quickAddModal');showScreen('times');cursorDate=parseDateKey(todayKey());renderDayView(todayKey());openDayEditor(todayKey())}
function setAbsenceType(code){$('absenceType').value=code||'vacation'}
function openNewAbsence(code='vacation',date=todayKey()){
  closeModal('quickAddModal');absenceEditorContext={mode:'new',scope:'range',originalGroupId:null,sourceDate:date};
  $('absenceModalTitle').textContent='Abwesenheit eintragen';setAbsenceType(code);$('absenceFrom').value=date;$('absenceTo').value=date;$('absenceExtent').value='full';$('absenceNote').value='';$('absenceConflictPolicy').value='abort';$('absenceDeleteActions').hidden=true;updateAbsenceSummary();openModal('absenceModal');
}
function openAbsenceEditorForDay(k,scope='day'){
  const d=dayObject(k);if(!d.absence){openNewAbsence('vacation',k);return}
  const group=scope==='group'&&d.absenceGroupId?absenceGroupDays(d.absenceGroupId):[d],from=group[0]?.date||k,to=group.at(-1)?.date||k;
  absenceEditorContext={mode:'edit',scope,originalGroupId:d.absenceGroupId||null,sourceDate:k,originalDates:group.map(x=>x.date)};
  $('absenceModalTitle').textContent=scope==='group'?'Abwesenheitszeitraum bearbeiten':'Abwesenheitstag bearbeiten';setAbsenceType(d.absenceCode||absenceCodeFromLabel(d.absence));$('absenceFrom').value=from;$('absenceTo').value=to;$('absenceExtent').value=absenceDuration(d);$('absenceNote').value=d.absenceNote||'';$('absenceConflictPolicy').value='abort';$('absenceDeleteActions').hidden=false;$('deleteAbsenceGroupBtn').hidden=!(d.absenceGroupId&&absenceGroupDays(d.absenceGroupId).length>1);updateAbsenceSummary();openModal('absenceModal');
}
function absenceConflict(k,excludeGroupId){
  const d=state.days[k];if(!d)return false;
  const otherAbsence=d.absence&&(!excludeGroupId||d.absenceGroupId!==excludeGroupId);
  return !!((d.entries||[]).length||Number(d.pauseMinutes)||otherAbsence);
}
function absencePlan(){
  const from=$('absenceFrom').value,to=$('absenceTo').value,extent=$('absenceExtent').value;if(!from||!to||from>to)return{error:'Das Von-Datum darf nicht nach dem Bis-Datum liegen.'};
  const range=dateRange(from,to),workdays=range.filter(isAbsenceWorkday),exclude=absenceEditorContext?.originalGroupId||null,conflicts=workdays.filter(k=>absenceConflict(k,exclude)),factor=extent==='half'?.5:1,total=workdays.reduce((n,k)=>n+Math.round(targetMinutesForDate(k)*factor),0);
  return{from,to,range,workdays,conflicts,factor,total};
}
function updateAbsenceSummary(){
  const box=$('absenceSummary'),plan=absencePlan();if(plan.error){box.innerHTML=`<b>Eingaben prüfen</b>${esc(plan.error)}`;return}
  const type=absenceLabel($('absenceType').value),extent=$('absenceExtent').value==='half'?'Halber Tag':'Ganzer Tag',weekendCount=plan.range.length-plan.workdays.length;
  box.innerHTML=`<b>${esc(type)} · ${extent}</b><div class="summary-line"><span>Kalenderzeitraum</span><strong>${formatDate(plan.from,{day:'2-digit',month:'2-digit',year:'numeric'})} – ${formatDate(plan.to,{day:'2-digit',month:'2-digit',year:'numeric'})}</strong></div><div class="summary-line"><span>Berücksichtigte Arbeitstage</span><strong>${plan.workdays.length}</strong></div><div class="summary-line"><span>Angerechnete Gesamtzeit</span><strong>${formatDuration(plan.total,{signed:false})}</strong></div>${weekendCount?`<div class="summary-line"><span>Ausgelassene Wochenend-/Feiertage</span><strong>${weekendCount}</strong></div>`:''}${plan.conflicts.length?`<div class="conflict">Konflikte an ${plan.conflicts.length} Tag(en): ${plan.conflicts.slice(0,4).map(k=>formatDate(k,{day:'2-digit',month:'2-digit'})).join(', ')}${plan.conflicts.length>4?' …':''}</div>`:'<div class="summary-line"><span>Konflikte</span><strong>Keine</strong></div>'}`;
}
function saveAbsence(){
  const plan=absencePlan();if(plan.error){alert(plan.error);return}if(!plan.workdays.length){alert('Im ausgewählten Zeitraum liegt kein berücksichtigter Arbeitstag. Wochenenden und Feiertage werden ausgelassen.');return}
  const policy=$('absenceConflictPolicy').value;if(plan.conflicts.length&&policy==='abort'){alert('Es bestehen Konflikte mit vorhandenen Buchungen oder einer anderen Abwesenheit. Wähle „überspringen“ oder „ersetzen“, oder passe den Zeitraum an.');return}
  if(plan.conflicts.length&&policy==='replace'&&!confirm(`${plan.conflicts.length} betroffene Tag(e) enthalten vorhandene Buchungen oder Abwesenheiten. Diese Einträge wirklich ersetzen?`))return;
  const context=absenceEditorContext||{mode:'new'},oldGroup=context.originalGroupId,groupId=context.scope==='group'&&oldGroup?oldGroup:newAbsenceGroupId(),code=$('absenceType').value,label=absenceLabel(code),extent=$('absenceExtent').value,note=$('absenceNote').value.trim(),nowIso=new Date().toISOString();
  const selected=policy==='skip'?plan.workdays.filter(k=>!plan.conflicts.includes(k)):plan.workdays;
  if(!selected.length){alert('Alle berücksichtigten Tage wurden wegen vorhandener Konflikte übersprungen.');return}
  if(context.mode==='edit'){
    const oldDates=context.scope==='group'&&oldGroup?absenceGroupDays(oldGroup).map(d=>d.date):[context.sourceDate];
    oldDates.forEach(k=>{const d=state.days[k];if(d){clearAbsenceFields(d);d.edited=true;d.modifiedAt=nowIso;state.days[k]=d}});
  }
  selected.forEach(k=>{
    const d=clone(dayObject(k,true));
    if(policy==='replace'&&plan.conflicts.includes(k)){d.entries=[];d.pauseMinutes=0;if(IMPORTED_BY_DATE[k])d.importCleared=true;clearAbsenceFields(d)}
    d.absence=label;d.absenceCode=code;d.absenceDuration=extent;d.absenceMinutes=Math.round(targetMinutesForDate(k)*(extent==='half'?.5:1));d.absenceNote=note;d.absenceGroupId=groupId;d.absenceCreatedAt=d.absenceCreatedAt||nowIso;d.absenceUpdatedAt=nowIso;d.edited=true;d.modifiedAt=nowIso;d.archived=Number(k.slice(0,4))<new Date().getFullYear();state.days[k]=d;
  });
  state.settings.lastEditedDay=selected[0];state.settings.lastActivityAt=nowIso;saveState();cursorDate=parseDateKey(selected[0]);closeModal('absenceModal');refreshAllDerivedViews();showToast(`${label} für ${selected.length} Arbeitstag(e) gespeichert`);
}
function deleteAbsenceForDay(k,scope='day'){
  const d=state.days[k];if(!d?.absence)return;const dates=scope==='group'&&d.absenceGroupId?absenceGroupDays(d.absenceGroupId).map(x=>x.date):[k],what=dates.length>1?`den gesamten Abwesenheitszeitraum mit ${dates.length} Arbeitstagen`:'die Abwesenheit dieses Tages';
  if(!confirm(`${what} löschen? Vorhandene Arbeitszeitbuchungen bleiben erhalten.`))return;
  const nowIso=new Date().toISOString();dates.forEach(date=>{const day=state.days[date];if(!day)return;clearAbsenceFields(day);day.edited=true;day.modifiedAt=nowIso;if(IMPORTED_BY_DATE[date])day.importCleared=true;state.days[date]=day});state.settings.lastEditedDay=k;saveState();closeModal('absenceModal');refreshAllDerivedViews();showToast(dates.length>1?'Abwesenheitszeitraum gelöscht':'Abwesenheit gelöscht');
}
function deleteAbsenceFromModal(scope){const k=absenceEditorContext?.sourceDate||$('absenceFrom').value;deleteAbsenceForDay(k,scope)}

function renderSettings(){
  $('employeeName').value=state.settings.employeeName||'';$('targetHours').value=clockFromMinutes(state.settings.targetMinutes||480);$('checkpointBalance').value=formatDuration(state.settings.balanceCheckpointMinutes||CHECKPOINT_MINUTES);$('freeChristmasEve').checked=state.settings.freeChristmasEve!==false;$('freeNewYearsEve').checked=state.settings.freeNewYearsEve!==false;$('countdownEnabled').checked=state.settings.countdownEnabled!==false;$('reportSignature').checked=state.settings.reportSignature!==false;$('appVersion').textContent=`Arbeitszeit PWA · Version ${APP_VERSION}`;
}
function saveSettings(){
  const cp=parseSignedTime($('checkpointBalance').value);if(cp===null){showToast('Zeitkonto als +HH:MM eingeben');$('checkpointBalance').value=formatDuration(state.settings.balanceCheckpointMinutes||CHECKPOINT_MINUTES);return}
  state.settings.employeeName=$('employeeName').value.trim();state.settings.targetMinutes=minutes($('targetHours').value)||480;state.settings.balanceCheckpointMinutes=cp;state.settings.balanceCheckpointDate=CHECKPOINT_DATE;state.settings.balanceCheckpointVersion=IMPORT_DATA_VERSION;state.settings.freeChristmasEve=$('freeChristmasEve').checked;state.settings.freeNewYearsEve=$('freeNewYearsEve').checked;state.settings.countdownEnabled=$('countdownEnabled').checked;state.settings.reportSignature=$('reportSignature').checked;ensureHolidayYear(new Date().getFullYear());saveState();if(!state.settings.countdownEnabled)stopConfetti();showToast('Einstellungen gespeichert')
}
function downloadFile(name,text,type){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type}));a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
function exportJSON(){const backup={format:BACKUP_FORMAT,version:1,appVersion:APP_VERSION,exportedAt:new Date().toISOString(),state};downloadFile(`Arbeitszeit_Backup_${todayKey()}.json`,JSON.stringify(backup,null,2),'application/json')}
function restoreJSON(file){if(!file)return;const r=new FileReader();r.onload=()=>{try{const parsed=validateStateShape(JSON.parse(r.result));const restored=parsed.compact===true?expandCompact(parsed):(parsed.format===BACKUP_FORMAT?parsed.state:parsed);const previous=localStorage.getItem(STORAGE_KEY);if(previous)localStorage.setItem(STORAGE_BACKUP_KEY,previous);state=migrateState(restored);if(!saveState())throw new Error('Speichern fehlgeschlagen');renderToday();showToast('Backup geprüft und wiederhergestellt');setTimeout(()=>location.reload(),500)}catch(e){alert(`Backup konnte nicht wiederhergestellt werden: ${e.message||'ungültige Datei'}`)}};r.readAsText(file)}
function exportCSV(){
  const rows=[['Datum','Status','Buchungen tatsächlich','Buchungen dokumentiert','Pause Min.','Brutto Min.','Netto Min.','Soll Min.','Differenz Min.','Zeitkonto Min.','Abwesenheit','Umfang','Angerechnet Min.','Abwesenheits-Vorgang','Abwesenheitsnotiz','Kommentar','Herkunft','Nachträglich geändert']];
  Object.values(state.days).sort((a,b)=>a.date.localeCompare(b.date)).forEach(d=>{if(!isCountable(d,todayKey()))return;const c=calculateDay(d),actual=(d.entries||[]).map(e=>`${e.type==='in'?'Kommen':'Gehen'} ${e.actual||''}`).join(' | '),logged=(d.entries||[]).map(e=>`${e.type==='in'?'Kommen':'Gehen'} ${e.logged||''}`).join(' | ');rows.push([d.date,dayStatus(d),actual,logged,d.pauseMinutes||0,c.gross,c.net,c.target,c.diff,balanceThrough(d.date),d.absence||'',d.absence?absenceDuration(d):'',d.absence?absenceCreditMinutes(d):0,d.absenceGroupId||'',d.absenceNote||'',d.note||'',d.sourceYear?`Import ${d.sourceYear}`:'Lokal',d.edited?'Ja':'Nein'])});
  const csv='\ufeff'+rows.map(r=>r.map(v=>`"${String(v??'').replaceAll('"','""')}"`).join(';')).join('\n');downloadFile(`Arbeitszeit_${todayKey()}.csv`,csv,'text/csv;charset=utf-8')
}

let printReturnScreen='reports';
function reportShell(title,subtitle,summary,table,type='day'){
  const name=state.settings.employeeName||'Arbeitszeitnachweis',created=new Intl.DateTimeFormat('de-DE',{dateStyle:'medium',timeStyle:'short'}).format(new Date()),signature=state.settings.reportSignature===false?'':`<div class="signatures"><div>Datum / Unterschrift Mitarbeiter</div><div>Datum / Bestätigung</div></div>`;
  printReturnScreen=document.querySelector('.screen.active')?.id||'reports';
  const report=$('printReport');
  report.className=`print-report report-${type}`;
  report.innerHTML=`<header><h1>${esc(name)}</h1><h2>${esc(title)}</h2><div class="meta"><span>${esc(subtitle)}</span><span>Erstellt: ${esc(created)}</span></div></header>${summary}${table}${signature}`;
  let pageStyle=$('dynamicPrintPage');
  if(!pageStyle){pageStyle=document.createElement('style');pageStyle.id='dynamicPrintPage';document.head.appendChild(pageStyle)}
  pageStyle.textContent=type==='day'?'@media print{@page{size:A4 portrait;margin:13mm}}':'@media print{@page{size:A4 landscape;margin:8mm}}';
  $('printPreview').classList.add('open');$('printPreview').setAttribute('aria-hidden','false');document.body.classList.add('preview-open');$('printPreview').scrollTop=0;
}
function closePrintPreview(){$('printPreview').classList.remove('open');$('printPreview').setAttribute('aria-hidden','true');document.body.classList.remove('preview-open')}
function printCurrentReport(){window.print()}
function dayReport(k){
  const d=dayObject(k),c=calculateDay(d),entries=d.entries||[],source=d.edited?'Nachträglich geändert':d.sourceYear?`Import ${d.sourceYear}`:'Lokale Erfassung';
  const summary=`<div class="hero"><span>Zeitkontostand nach diesem Tag</span><strong>${formatDuration(balanceThrough(k))}</strong></div><div class="summary"><div><span>Tagesstatus</span><b>${esc(dayStatus(d))}</b></div><div><span>Bruttoarbeitszeit</span><b>${formatDuration(c.gross,{signed:false})}</b></div><div><span>Nettoarbeitszeit</span><b>${formatDuration(c.net,{signed:false})}</b></div><div><span>Sollzeit</span><b>${formatDuration(c.target,{signed:false})}</b></div><div><span>Tagesdifferenz</span><b>${formatDuration(c.diff)}</b></div><div><span>Pause</span><b>${Number(d.pauseMinutes)||0} Min.</b></div><div><span>Abwesenheit</span><b>${esc(d.absence?`${d.absence} · ${absenceDuration(d)==='half'?'Halber Tag':'Ganzer Tag'}`:'–')}</b></div><div><span>Angerechnete Abwesenheitszeit</span><b>${d.absence?formatDuration(absenceCreditMinutes(d),{signed:false}):'–'}</b></div><div><span>Abwesenheitsnotiz</span><b class="wrap">${esc(d.absenceNote||'–')}</b></div><div><span>Herkunft / Änderung</span><b>${esc(source)}</b></div><div><span>Kommentar</span><b class="wrap">${esc(d.note||'–')}</b></div></div>`;
  const body=entries.length?entries.map((e,i)=>`<tr><td>${i+1}</td><td>${e.type==='in'?'Kommen':'Gehen'}</td><td class="num">${esc(e.actual||'–')}</td><td class="num">${esc(e.logged||'–')}</td><td>${esc(entrySource(d,e))}</td></tr>`).join(''):'<tr><td colspan="5">Keine Buchungen</td></tr>';
  reportShell(`Tagesbericht ${formatDate(k,{day:'2-digit',month:'2-digit',year:'numeric'})}`,formatDate(k),summary,`<table><thead><tr><th>Nr.</th><th>Art</th><th class="num">Tatsächlich</th><th class="num">Dokumentiert</th><th>Herkunft</th></tr></thead><tbody>${body}</tbody></table>`,'day')
}
function monthReport(y,m){
  const start=`${y}-${pad(m+1)}-01`,end=dateKey(new Date(y,m+1,0,12)),s=periodSummary(start,end),title=new Intl.DateTimeFormat('de-DE',{month:'long',year:'numeric'}).format(new Date(y,m,1));
  const summary=`<div class="hero"><span>Zeitkonto Monatsende / Stichtag</span><strong>${formatDuration(s.closing)}</strong></div><div class="summary"><div><span>Übertrag Vormonat</span><b>${formatDuration(s.opening)}</b></div><div><span>Monatsdifferenz</span><b>${formatDuration(s.diff)}</b></div><div><span>Sollzeit</span><b>${formatDuration(s.target,{signed:false})}</b></div><div><span>Nettozeit</span><b>${formatDuration(s.net,{signed:false})}</b></div><div><span>Pausenzeit</span><b>${formatDuration(s.pause,{signed:false})}</b></div><div><span>Urlaubstage</span><b>${formatDayCount(s.vacation)}</b></div><div><span>Krankheitstage</span><b>${formatDayCount(s.sick)}</b></div><div><span>Zeitausgleichstage</span><b>${formatDayCount(s.timeOff||0)}</b></div><div><span>Sonstige Abwesenheiten</span><b>${formatDayCount(s.other)}</b></div><div><span>Unvollständige Tage</span><b>${s.incomplete}</b></div></div>`;
  const body=s.days.map(d=>{const c=calculateDay(d),ins=(d.entries||[]).filter(e=>e.type==='in').map(e=>e.logged).join(', ')||'–',outs=(d.entries||[]).filter(e=>e.type==='out').map(e=>e.logged).join(', ')||'–',absence=d.absence?`${d.absence} (${absenceDuration(d)==='half'?'½ Tag':'ganzer Tag'}, ${formatDuration(absenceCreditMinutes(d),{signed:false})})`:'–';return `<tr><td>${formatDate(d.date,{day:'2-digit',month:'2-digit',year:'numeric'})}</td><td>${esc(dayStatus(d))}</td><td>${esc(absence)}</td><td class="num">${esc(ins)}</td><td class="num">${esc(outs)}</td><td class="num">${Number(d.pauseMinutes)||0}</td><td class="num">${formatDuration(c.net,{signed:false})}</td><td class="num">${formatDuration(c.target,{signed:false})}</td><td class="num">${formatDuration(c.diff)}</td><td class="num">${formatDuration(balanceThrough(d.date))}</td><td class="wrap">${esc(d.absenceNote||d.note||'')}</td></tr>`}).join('');
  reportShell(`Monatsbericht ${title}`,`Zeitraum: ${formatDate(start,{day:'2-digit',month:'2-digit',year:'numeric'})} bis ${formatDate(s.cutoff,{day:'2-digit',month:'2-digit',year:'numeric'})}`,summary,`<table><colgroup><col style="width:9%"><col style="width:8%"><col style="width:15%"><col style="width:7%"><col style="width:7%"><col style="width:6%"><col style="width:7%"><col style="width:7%"><col style="width:7%"><col style="width:9%"><col style="width:18%"></colgroup><thead><tr><th>Datum</th><th>Status</th><th>Abwesenheit</th><th class="num">Kommen</th><th class="num">Gehen</th><th class="num">Pause</th><th class="num">Netto</th><th class="num">Soll</th><th class="num">Diff.</th><th class="num">Zeitkonto</th><th>Notiz</th></tr></thead><tbody>${body}</tbody></table>`,'month')
}
function yearReport(y){
  const s=periodSummary(`${y}-01-01`,`${y}-12-31`),rows=[];for(let m=0;m<12;m++){if(y===new Date().getFullYear()&&m>new Date().getMonth())continue;const ms=periodSummary(`${y}-${pad(m+1)}-01`,dateKey(new Date(y,m+1,0,12)));rows.push({m,s:ms})}
  const summary=`<div class="hero"><span>Zeitkonto Jahresende / aktueller Stichtag</span><strong>${formatDuration(s.closing)}</strong></div><div class="summary"><div><span>Übertrag Vorjahr</span><b>${formatDuration(s.opening)}</b></div><div><span>Jahresveränderung</span><b>${formatDuration(s.diff)}</b></div><div><span>Sollzeit</span><b>${formatDuration(s.target,{signed:false})}</b></div><div><span>Nettozeit</span><b>${formatDuration(s.net,{signed:false})}</b></div><div><span>Pausenzeit</span><b>${formatDuration(s.pause,{signed:false})}</b></div><div><span>Urlaubstage</span><b>${formatDayCount(s.vacation)}</b></div><div><span>Krankheitstage</span><b>${formatDayCount(s.sick)}</b></div><div><span>Zeitausgleichstage</span><b>${formatDayCount(s.timeOff||0)}</b></div><div><span>Sonstige Abwesenheiten</span><b>${formatDayCount(s.other)}</b></div></div>`;
  const body=rows.map(r=>`<tr><td>${new Intl.DateTimeFormat('de-DE',{month:'long'}).format(new Date(y,r.m,1))}</td><td class="num">${formatDuration(r.s.target,{signed:false})}</td><td class="num">${formatDuration(r.s.net,{signed:false})}</td><td class="num">${formatDuration(r.s.pause,{signed:false})}</td><td class="num">${formatDuration(r.s.diff)}</td><td class="num">${formatDuration(r.s.closing)}</td><td class="num">${formatDayCount(r.s.vacation)}</td><td class="num">${formatDayCount(r.s.sick)}</td><td class="num">${formatDayCount(r.s.timeOff||0)}</td></tr>`).join('');
  reportShell(`Jahresbericht ${y}`,`Jahr ${y}`,summary,`<table><colgroup><col style="width:18%"><col style="width:10%"><col style="width:10%"><col style="width:9%"><col style="width:12%"><col style="width:12%"><col style="width:9%"><col style="width:9%"><col style="width:11%"></colgroup><thead><tr><th>Monat</th><th class="num">Soll</th><th class="num">Netto</th><th class="num">Pause</th><th class="num">Veränderung</th><th class="num">Zeitkonto</th><th class="num">Urlaub</th><th class="num">Krank</th><th class="num">Zeitausgleich</th></tr></thead><tbody>${body}</tbody></table>`,'year')
}

function init(){
  document.title=`Arbeitszeit PWA · Version ${APP_VERSION}`;
  ensureHolidayYear(new Date().getFullYear());saveState();
  document.querySelectorAll('.tabbar button').forEach(b=>b.addEventListener('click',()=>showScreen(b.dataset.screen)));
  document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>setTimesView(b.dataset.view)));
  document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>closeModal(b.dataset.close)));
  document.querySelectorAll('.modal').forEach(m=>m.addEventListener('click',e=>{if(e.target===m)closeModal(m.id)}));
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){const open=[...document.querySelectorAll('.modal.open')].at(-1);if(open)closeModal(open.id)}});
  bindPunchButton($('punchAction'));
  $('todayAbsenceEdit').addEventListener('click',()=>openAbsenceEditorForDay(todayKey(),'day'));
  $('pauseToday').addEventListener('click',openPauseModal);$('savePauseBtn').addEventListener('click',saveQuickPause);$('quickAddBtn').addEventListener('click',openQuickAdd);
  document.querySelectorAll('[data-quick-absence]').forEach(b=>b.addEventListener('click',()=>openNewAbsence(b.dataset.quickAbsence,todayKey())));$('manualTimeQuick').addEventListener('click',openManualTimeQuick);
  ['absenceType','absenceFrom','absenceTo','absenceExtent','absenceConflictPolicy'].forEach(id=>$(id).addEventListener('change',updateAbsenceSummary));$('absenceNote').addEventListener('input',updateAbsenceSummary);$('saveAbsenceBtn').addEventListener('click',saveAbsence);$('deleteAbsenceDayBtn').addEventListener('click',()=>deleteAbsenceFromModal('day'));$('deleteAbsenceGroupBtn').addEventListener('click',()=>deleteAbsenceFromModal('group'));
  $('addEntryBtn').addEventListener('click',addEditingEntry);$('saveDayBtn').addEventListener('click',saveEditedDay);$('deleteDayBtn').addEventListener('click',deleteEditedDay);$('restoreImportBtn').addEventListener('click',restoreImportedDay);$('manageAbsenceFromDay').addEventListener('click',()=>{const k=$('editDate').value,d=dayObject(k);closeModal('dayModal');d.absence?openAbsenceEditorForDay(k,d.absenceGroupId&&absenceGroupDays(d.absenceGroupId).length>1?'group':'day'):openNewAbsence('vacation',k)});
  $('dayReportBtn').addEventListener('click',()=>dayReport($('reportDay').value||todayKey()));
  $('monthReportBtn').addEventListener('click',()=>{const [y,m]=($('reportMonth').value||todayKey().slice(0,7)).split('-').map(Number);monthReport(y,m-1)});
  $('yearReportBtn').addEventListener('click',()=>yearReport(Number($('reportYear').value)||new Date().getFullYear()));
  $('chartMonthMode').addEventListener('click',()=>{chartMode='month';chartSelection=null;renderOvertimeChart()});$('chartYearMode').addEventListener('click',()=>{chartMode='year';chartSelection=null;renderOvertimeChart()});$('chartYear').addEventListener('change',()=>{chartSelection=null;renderOvertimeChart()});
  $('closePrintPreview').addEventListener('click',closePrintPreview);$('printReportBtn').addEventListener('click',printCurrentReport);
  $('csvExportBtn').addEventListener('click',exportCSV);$('jsonExportBtn').addEventListener('click',exportJSON);$('jsonRestoreBtn').addEventListener('click',()=>$('restoreFile').click());$('restoreFile').addEventListener('change',e=>restoreJSON(e.target.files[0]));
  ['employeeName','targetHours','checkpointBalance','freeChristmasEve','freeNewYearsEve','countdownEnabled','reportSignature'].forEach(id=>$(id).addEventListener('change',saveSettings));
  updateClock();setInterval(updateClock,1000);window.addEventListener('resize',()=>{if(document.body.classList.contains('today-fixed')){renderTodayCapture(dayObject(todayKey()));updateCountdown({allowCelebrate:false})}});document.addEventListener('visibilitychange',()=>{if(!document.hidden&&document.body.classList.contains('today-fixed')){updateClock();updateCountdown()}});renderToday();
  if('serviceWorker'in navigator&&location.protocol!=='file:')navigator.serviceWorker.register('./sw.js').catch(()=>{});
}
document.addEventListener('DOMContentLoaded',init);

document.addEventListener('DOMContentLoaded',()=>{if(storageNotice)setTimeout(()=>showToast(storageNotice),250)});
