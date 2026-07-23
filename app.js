const STORAGE_KEY='arbeitszeit-pwa-v1';
const STORAGE_BACKUP_KEY=STORAGE_KEY+'-backup';
const STORAGE_CORRUPT_KEY=STORAGE_KEY+'-corrupt';
const BACKUP_FORMAT='arbeitszeit-pwa-backup';
let storageNotice='';
const CHECKPOINT_DATE='2026-07-22';
const CHECKPOINT_MINUTES=11631;
const APP_VERSION='5.13';
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
  const mobileRows=entries.length?`<div class="booking-compact-head"><span></span><span>Tatsächlich</span><span>Dokumentiert</span><span></span></div>${entries.map(e=>{const no=e.type==='in'?++inNo:++outNo,label=e.type==='in'?`Kommen ${no}`:`Gehen ${no}`;return `<div class="booking-compact-row ${e.type}"><div class="booking-compact-label"><span class="booking-type-icon">${e.type==='in'?SVG.in:SVG.out}</span><span><b>${label}</b><small>${esc(entrySource(d,e))}</small></span></div><b class="booking-compact-time">${esc(e.actual||'–')}</b><b class="booking-compact-time">${esc(e.logged||'–')}</b><button type="button" class="edit-icon-btn" onclick="openDayEditor('${k}')" aria-label="${label} bearbeiten">${SVG.edit}</button></div>`}).join('')}`:`<div class="empty compact-empty">Keine Buchungen vorhanden</div>`;
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
      <div class="additional-row"><span class="additional-icon pause">${SVG.pause}</span><b>Manuelle Pause</b><span class="additional-value">${Number(d.pauseMinutes)||0} Min.</span></div>
      <div class="additional-row"><span class="additional-icon note">${SVG.note||SVG.edit}</span><b>Kommentar</b><span class="additional-value comment">${esc(d.note||'Kein Kommentar')}</span></div>
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

let chartMode=['month','year','history'].includes(state.settings.chartMode)?state.settings.chartMode:'month',chartSelection=null;
function renderReports(){
  const t=todayKey(),bal=balanceThrough(t);$('reportBalance').textContent=formatDuration(bal);$('reportBalance').className=bal<0?'red':'green';$('reportDay').value=t;$('reportMonth').value=t.slice(0,7);
  const years=[];for(let y=new Date().getFullYear();y>=earliestYear();y--)years.push(`<option value="${y}">${y}</option>`);$('reportYear').innerHTML=years.join('');$('chartYear').innerHTML=years.join('');if(!$('chartYear').value)$('chartYear').value=String(new Date().getFullYear());renderOvertimeChart();
}
function setChartMode(mode){chartMode=mode;chartSelection=null;state.settings.chartMode=mode;saveState();renderOvertimeChart()}
function chartSelect(kind,key){chartSelection={kind,key};renderOvertimeChart()}
function chartHistoryItems(){
  const first=earliestYear(),now=new Date(),items=[];
  for(let y=first;y<=now.getFullYear();y++)for(let m=0;m<12;m++){
    if(y===now.getFullYear()&&m>now.getMonth())break;
    const key=`${y}-${pad(m+1)}`,summary=monthSummary(y,m),available=!!MONTHLY_BASELINES[key]||summary.days.length>0;
    if(available)items.push({key,label:key,name:new Intl.DateTimeFormat('de-DE',{month:'long',year:'numeric'}).format(new Date(y,m,1)),value:summary.closing,summary,available:true});
  }
  if(!items.length){const key=todayKey().slice(0,7),summary=monthSummary(Number(key.slice(0,4)),Number(key.slice(5,7))-1);items.push({key,label:key,name:key,value:balanceThrough(todayKey()),summary,available:true})}
  const current=balanceThrough(todayKey()),last=items.at(-1);if(last)last.value=current;
  return items;
}
function renderHistoryChart(host,detail,items){
  const w=360,h=235,left=48,right=10,top=24,bottom=38,plotW=w-left-right,plotH=h-top-bottom;
  const vals=items.map(i=>i.value),min=Math.min(0,...vals),max=Math.max(0,...vals),range=Math.max(60,max-min),y=v=>top+(max-v)/range*plotH,x=i=>left+(items.length===1?plotW:plotW*i/(items.length-1));
  const tickVals=Array.from({length:5},(_,i)=>max-range*i/4),zeroY=y(0),points=items.map((it,i)=>`${x(i).toFixed(1)},${y(it.value).toFixed(1)}`).join(' ');
  let area='';if(items.length>1)area=`<path class="history-area" d="M ${x(0)} ${zeroY} L ${points.replaceAll(' ',' L ')} L ${x(items.length-1)} ${zeroY} Z"/>`;
  const years=[...new Set(items.map(i=>i.key.slice(0,4)))];
  let svg=`<svg viewBox="0 0 ${w} ${h}" aria-hidden="true"><g class="chart-grid">${tickVals.map(v=>`<line x1="${left}" x2="${w-right}" y1="${y(v)}" y2="${y(v)}"/><text x="${left-6}" y="${y(v)+3}" text-anchor="end">${v===0?'0h':`${v>0?'+':''}${Math.round(v/60)}h`}</text>`).join('')}</g><line class="zero-line" x1="${left}" x2="${w-right}" y1="${zeroY}" y2="${zeroY}"/>${area}<polyline class="history-line" points="${points}"/>`;
  items.forEach((it,i)=>{const showLabel=i===0||i===items.length-1||items[i-1].key.slice(0,4)!==it.key.slice(0,4),selected=chartSelection?.key===it.key;svg+=`<g class="history-point ${selected?'selected':''}" data-chart-key="${it.key}" role="button" tabindex="0" aria-label="${esc(it.name)} ${formatDuration(it.value)}"><rect class="chart-hit" x="${Math.max(left,x(i)-10)}" y="${top}" width="20" height="${plotH}"/><circle cx="${x(i)}" cy="${y(it.value)}" r="${selected?4.5:2.2}"/>${showLabel?`<text class="chart-label" x="${x(i)}" y="${h-14}" text-anchor="middle">${it.key.slice(0,4)}</text>`:''}</g>`});
  host.innerHTML=svg+'</svg>';
  host.querySelectorAll('[data-chart-key]').forEach(el=>{const act=()=>chartSelect('history',el.dataset.chartKey);el.addEventListener('click',act);el.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();act()}})});
  const picked=items.find(i=>i.key===chartSelection?.key)||items.at(-1);chartSelection={kind:'history',key:picked.key};
  detail.innerHTML=`<b>${esc(picked.name)}</b><div><span>Kumulierter Zeitkontostand</span><strong class="${picked.value<0?'red':'green'}">${formatDuration(picked.value)}</strong></div><div><span>Ausgewählter Zeitraum</span><strong>${items[0].key.slice(0,4)} – ${items.at(-1).key.slice(0,4)}</strong></div>`;
}
function renderOvertimeChart(){
  const host=$('overtimeChart'),detail=$('chartDetail');if(!host||!detail)return;
  $('chartMonthMode').classList.toggle('active',chartMode==='month');$('chartYearMode').classList.toggle('active',chartMode==='year');$('chartHistoryMode').classList.toggle('active',chartMode==='history');$('chartYear').disabled=chartMode==='year';
  $('chartSubtitle').textContent='Verlauf des gesamten Zeitkontostands';
  const chartFilter=document.querySelector('.chart-filter');chartFilter.style.visibility=chartMode==='year'?'hidden':'visible';chartFilter.setAttribute('aria-hidden',chartMode==='year'?'true':'false');chartFilter.querySelector('label').textContent=chartMode==='history'?'Zeitraum':'Jahr';
  if(chartMode==='history'){
    const items=chartHistoryItems(),first=items[0].key.slice(0,4),last=items.at(-1).key.slice(0,4);$('chartYear').innerHTML=`<option>${first} – ${last}</option>`;renderHistoryChart(host,detail,items);return;
  }
  const years=[];for(let y=new Date().getFullYear();y>=earliestYear();y--)years.push(`<option value="${y}">${y}</option>`);const selectedYear=$('chartYear').value;if(chartMode==='month'){$('chartYear').innerHTML=years.join('');$('chartYear').value=years.some(o=>o.includes(`value="${selectedYear}"`))?selectedYear:String(new Date().getFullYear())}
  const items=chartMode==='month'?Array.from({length:12},(_,m)=>{const y=Number($('chartYear').value)||new Date().getFullYear(),s=monthSummary(y,m);return{key:`${y}-${pad(m+1)}`,label:['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'][m],name:new Intl.DateTimeFormat('de-DE',{month:'long',year:'numeric'}).format(new Date(y,m,1)),value:s.diff,summary:s,available:!!MONTHLY_BASELINES[`${y}-${pad(m+1)}`]||s.days.length>0}}):Object.keys(YEAR_BASELINES).map(Number).sort((a,b)=>a-b).map(y=>{const s=yearSummary(y);return{key:String(y),label:String(y),name:`Jahr ${y}`,value:s.diff,summary:s,available:true}});
  const available=items.filter(i=>i.available),max=Math.max(60,...available.map(i=>Math.abs(i.value))),w=360,h=235,padX=48,right=10,zero=107.5,plotH=78,step=(w-padX-right)/Math.max(items.length,1),bar=Math.max(10,Math.min(22,step*.58));
  const ticks=[max,Math.round(max/2),0,-Math.round(max/2),-max];
  let svg=`<svg viewBox="0 0 ${w} ${h}" aria-hidden="true" focusable="false"><g class="chart-grid">${ticks.map((v,i)=>{const yy=zero-(v/max)*plotH;return `<line x1="${padX}" x2="${w-right}" y1="${yy}" y2="${yy}"/><text x="${padX-5}" y="${yy+3}" text-anchor="end">${i===2?'0':Math.round(Math.abs(v)/60)+'h'}</text>`}).join('')}</g><line class="zero-line" x1="${padX}" x2="${w-right}" y1="${zero}" y2="${zero}"/>`;
  items.forEach((it,i)=>{const xx=padX+i*step+(step-bar)/2,val=it.available?it.value:0,bh=Math.abs(val)/max*plotH,yy=val>=0?zero-bh:zero,selected=chartSelection?.key===it.key,current=it.key===todayKey().slice(0,chartMode==='month'?7:4);svg+=`<g class="chart-item ${selected?'selected':''} ${current?'current':''} ${it.available?'':'unavailable'}" role="button" tabindex="0" data-chart-key="${it.key}" aria-label="${esc(it.name)} ${formatDuration(val)}"><rect class="chart-hit" x="${padX+i*step}" y="12" width="${step}" height="${h-35}"/><rect class="chart-bar ${val<0?'negative':'positive'}" x="${xx}" y="${yy}" width="${bar}" height="${Math.max(it.available?2:0,bh)}" rx="4"/><text class="chart-label" x="${xx+bar/2}" y="${h-14}" text-anchor="middle">${it.label}</text></g>`});
  host.innerHTML=svg+'</svg>';host.querySelectorAll('[data-chart-key]').forEach(el=>{const act=()=>chartSelect(chartMode,el.dataset.chartKey);el.addEventListener('click',act);el.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();act()}})});
  let picked=items.find(i=>i.key===chartSelection?.key&&chartSelection.kind===chartMode)||available.at(-1);if(!picked){detail.innerHTML='<span>Für diese Auswahl liegen noch keine Werte vor.</span>';return}chartSelection={kind:chartMode,key:picked.key};
  const sm=picked.summary;detail.innerHTML=`<b>${esc(picked.name)}</b><div><span>${chartMode==='month'?'Monatsdifferenz':'Jahresveränderung'}</span><strong class="${sm.diff<0?'red':'green'}">${formatDuration(sm.diff)}</strong></div><div><span>Zeitkonto zum Stichtag</span><strong>${formatDuration(sm.closing)}</strong></div><div><span>Netto / Soll</span><strong>${formatDuration(sm.net,{signed:false})} / ${formatDuration(sm.target,{signed:false})}</strong></div>`;
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
function downloadBlob(name,blob){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),2500)}
function downloadFile(name,text,type){downloadBlob(name,new Blob([text],{type}))}
function createBackupPayload(){return{format:BACKUP_FORMAT,version:2,appVersion:APP_VERSION,exportedAt:new Date().toISOString(),schemaVersion:CURRENT_SCHEMA,recordCount:Object.values(state.days||{}).reduce((n,d)=>n+(d.entries?.length||0),0),dayCount:Object.keys(state.days||{}).length,state:clone(state)}}
function createBackupFile(){const payload=createBackupPayload();return new File([JSON.stringify(payload,null,2)],`Arbeitszeit_Backup_${todayKey()}.json`,{type:'application/json'})}
function exportJSON(){const file=createBackupFile();downloadBlob(file.name,file);showToast('Sicherung erstellt')}
function validateBackupEnvelope(raw){
  if(!raw||typeof raw!=='object'||raw.format!==BACKUP_FORMAT)throw new Error('Die Datei gehört nicht zu dieser Arbeitszeit-App.');
  if(!raw.state||typeof raw.state!=='object')throw new Error('Die Sicherung enthält keinen vollständigen App-Zustand.');
  const checked=validateStateShape(raw.state),expanded=checked.compact===true?expandCompact(checked):checked;
  const days=Object.values(expanded.days||{}),entries=days.reduce((n,d)=>n+(d.entries?.length||0),0);
  return{state:expanded,meta:{exportedAt:raw.exportedAt||raw.savedAt||null,appVersion:raw.appVersion||'unbekannt',days:days.length,entries}};
}
function restoreJSON(file){if(!file)return;const r=new FileReader();r.onload=()=>{try{
  const result=validateBackupEnvelope(JSON.parse(r.result));
  const stamp=result.meta.exportedAt?new Intl.DateTimeFormat('de-DE',{dateStyle:'medium',timeStyle:'short'}).format(new Date(result.meta.exportedAt)):'unbekannt';
  const info=`Sicherungsdatum: ${stamp}\nApp-Version: ${result.meta.appVersion}\nKalendertage: ${result.meta.days}\nBuchungen: ${result.meta.entries}`;
  if(!confirm(`${info}\n\nDie aktuellen Daten werden vor dem Überschreiben gesichert. Wiederherstellung fortsetzen?`))return;
  const safety=createBackupFile();downloadBlob(safety.name.replace('.json','_vor_Wiederherstellung.json'),safety);
  const previous=localStorage.getItem(STORAGE_KEY);if(previous)localStorage.setItem(STORAGE_BACKUP_KEY,previous);
  state=migrateState(result.state);if(!saveState())throw new Error('Speichern fehlgeschlagen');
  refreshAllDerivedViews();showToast('Sicherung wiederhergestellt');setTimeout(()=>location.reload(),500);
}catch(e){alert(`Sicherung konnte nicht wiederhergestellt werden: ${e.message||'ungültige Datei'}`)}finally{$('restoreFile').value=''}};r.onerror=()=>alert('Die Datei konnte nicht gelesen werden.');r.readAsText(file)}

const CRC_TABLE=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=(c&1)?0xedb88320^(c>>>1):c>>>1;t[n]=c>>>0}return t})();
function crc32(data){let c=0xffffffff;for(const b of data)c=CRC_TABLE[(c^b)&255]^(c>>>8);return(c^0xffffffff)>>>0}
function u16(n){return new Uint8Array([n&255,(n>>>8)&255])}function u32(n){return new Uint8Array([n&255,(n>>>8)&255,(n>>>16)&255,(n>>>24)&255])}
function concatBytes(parts){const len=parts.reduce((n,p)=>n+p.length,0),out=new Uint8Array(len);let o=0;for(const p of parts){out.set(p,o);o+=p.length}return out}
function zipStore(files){const enc=new TextEncoder(),locals=[],centrals=[];let offset=0;for(const f of files){const name=enc.encode(f.name),data=f.data instanceof Uint8Array?f.data:enc.encode(String(f.data)),crc=crc32(data);const local=concatBytes([u32(0x04034b50),u16(20),u16(0x0800),u16(0),u16(0),u16(0),u32(crc),u32(data.length),u32(data.length),u16(name.length),u16(0),name,data]);locals.push(local);const central=concatBytes([u32(0x02014b50),u16(20),u16(20),u16(0x0800),u16(0),u16(0),u16(0),u32(crc),u32(data.length),u32(data.length),u16(name.length),u16(0),u16(0),u16(0),u16(0),u32(0),u32(offset),name]);centrals.push(central);offset+=local.length}const cd=concatBytes(centrals),body=concatBytes(locals);return concatBytes([body,cd,u32(0x06054b50),u16(0),u16(0),u16(files.length),u16(files.length),u32(cd.length),u32(body.length),u16(0)])}
function xml(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]))}
function excelSerial(k){return(Date.UTC(...k.split('-').map((v,i)=>Number(v)-(i===1?1:0)))-Date.UTC(1899,11,30))/86400000}
function colName(n){let s='';while(n){n--;s=String.fromCharCode(65+n%26)+s;n=Math.floor(n/26)}return s}
function cellXml(v,r,c,style=0,type=null){const ref=`${colName(c)}${r}`;if(v==null||v==='')return`<c r="${ref}" s="${style}"/>`;if(type==='n'||typeof v==='number')return`<c r="${ref}" s="${style}"><v>${Number(v)}</v></c>`;return`<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xml(v)}</t></is></c>`}
function sheetXml(rows,widths,{filter=true,freeze=true}={}){const maxCols=Math.max(1,...rows.map(r=>r.length)),data=rows.map((row,ri)=>`<row r="${ri+1}">${row.map((x,ci)=>cellXml(x.v,ri+1,ci+1,x.s||0,x.t)).join('')}</row>`).join('');const cols=widths.map((w,i)=>`<col min="${i+1}" max="${i+1}" width="${w}" customWidth="1"/>`).join('');const pane=freeze?'<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>':'<sheetViews><sheetView workbookViewId="0"/></sheetViews>';const af=filter&&rows.length?`<autoFilter ref="A1:${colName(maxCols)}${rows.length}"/>`:'';return`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${pane}<cols>${cols}</cols><sheetData>${data}</sheetData>${af}</worksheet>`}
function H(v){return{v,s:1}}function T(v){return{v,s:0}}function D(k){return{v:excelSerial(k),s:2,t:'n'}}function TM(v){return v?{v:minutes(v)/1440,s:3,t:'n'}:T('')}function DUR(v,diff=false){return{v:Number(v||0)/1440,s:diff?(v<0?6:v>0?5:4):4,t:'n'}}
function exportDays(){return Object.values(state.days||{}).filter(d=>hasMeaningfulData(d)||isCountable(d,todayKey())).sort((a,b)=>a.date.localeCompare(b.date))}
function makeWorkbook(){
 const days=exportDays(),countable=days.filter(d=>isCountable(d,todayKey())),first=countable[0]?.date||days[0]?.date||'',last=countable.at(-1)?.date||days.at(-1)?.date||'';
 const totals=countable.reduce((a,d)=>{const c=calculateDay(d);a.net+=c.net;a.target+=c.target;a.pause+=Number(d.pauseMinutes)||0;a.diff+=c.diff;a.entries+=(d.entries||[]).length;return a},{net:0,target:0,pause:0,diff:0,entries:0});
 const overview=[[H('Kennzahl'),H('Wert')],[T('Sicherungsdatum'),T(new Date().toLocaleString('de-DE'))],[T('Datenzeitraum'),T(first&&last?`${first} bis ${last}`:'Keine Daten')],[T('App-Version'),T(APP_VERSION)],[T('Aktueller Zeitkontostand'),DUR(balanceThrough(todayKey()),true)],[T('Gesamte Nettoarbeitszeit'),DUR(totals.net)],[T('Gesamte Sollzeit'),DUR(totals.target)],[T('Gesamte Pausenzeit'),DUR(totals.pause)],[T('Gesamte Differenz'),DUR(totals.diff,true)],[T('Anzahl erfasster Arbeitstage'),{v:countable.length,t:'n'}],[T('Anzahl einzelner Buchungen'),{v:totals.entries,t:'n'}]];
 const daily=[[H('Datum'),H('Wochentag'),H('Erster Arbeitsbeginn'),H('Letztes Arbeitsende'),H('Bruttozeit'),H('Automatische Pause'),H('Manuelle Pause'),H('Gesamte Pause'),H('Nettozeit'),H('Sollzeit'),H('Tagesdifferenz'),H('Zeitkontostand nach diesem Tag'),H('Status'),H('Kommentar')]];
 for(const d of days){const c=calculateDay(d),ins=(d.entries||[]).filter(e=>e.type==='in'),outs=(d.entries||[]).filter(e=>e.type==='out');daily.push([D(d.date),T(formatDate(d.date,{weekday:'long'})),TM(ins[0]?.logged||ins[0]?.actual),TM(outs.at(-1)?.logged||outs.at(-1)?.actual),DUR(c.gross),DUR(0),DUR(Number(d.pauseMinutes)||0),DUR(Number(d.pauseMinutes)||0),DUR(c.net),DUR(c.target),DUR(c.diff,true),DUR(balanceThrough(d.date),true),T(dayStatus(d)),T(d.note||d.absenceNote||'')])}
 const bookings=[[H('Datum'),H('Typ'),H('Tatsächliche Uhrzeit'),H('Dokumentierte Uhrzeit'),H('Herkunft'),H('Manuell geändert'),H('Änderungszeitpunkt')]];
 for(const d of days)for(const e of d.entries||[])bookings.push([D(d.date),T(e.type==='in'?'Kommen':'Gehen'),TM(e.actual),TM(e.logged),T(entrySource(d,e)),T(e.edited||d.edited?'Ja':'Nein'),T((e.editedAt||d.modifiedAt||'').replace('T',' ').slice(0,19))]);
 const months=[[H('Monat'),H('Nettozeit'),H('Sollzeit'),H('Pausenzeit'),H('Monatsdifferenz'),H('Zeitkontostand am Monatsende'),H('Anzahl Arbeitstage')]],years=[[H('Jahr'),H('Nettozeit'),H('Sollzeit'),H('Pausenzeit'),H('Jahresdifferenz'),H('Zeitkontostand am Jahresende'),H('Anzahl Arbeitstage')]];
 const monthKeys=[...new Set(countable.map(d=>d.date.slice(0,7)))].sort();for(const mk of monthKeys){const [y,m]=mk.split('-').map(Number),ss=monthSummary(y,m-1);months.push([T(new Intl.DateTimeFormat('de-DE',{month:'long',year:'numeric'}).format(new Date(y,m-1,1))),DUR(ss.net),DUR(ss.target),DUR(ss.pause),DUR(ss.diff,true),DUR(ss.closing,true),{v:ss.days.filter(d=>isCountable(d,ss.cutoff)).length,t:'n'}])}
 const yearKeys=[...new Set(countable.map(d=>Number(d.date.slice(0,4))))].sort();for(const y of yearKeys){const ss=yearSummary(y);years.push([{v:y,t:'n'},DUR(ss.net),DUR(ss.target),DUR(ss.pause),DUR(ss.diff,true),DUR(ss.closing,true),{v:ss.months.reduce((n,m)=>n+m.days.filter(d=>isCountable(d,m.cutoff)).length,0),t:'n'}])}
 const settings=[[H('Einstellung'),H('Wert')],[T('Name im Bericht'),T(state.settings.employeeName||'')],[T('Tägliche Sollzeit'),DUR(state.settings.targetMinutes||480)],[T(`Zeitkonto am ${CHECKPOINT_DATE}`),DUR(state.settings.balanceCheckpointMinutes||CHECKPOINT_MINUTES,true)],[T('Heiligabend frei'),T(state.settings.freeChristmasEve!==false?'Ja':'Nein')],[T('Silvester frei'),T(state.settings.freeNewYearsEve!==false?'Ja':'Nein')],[T('Countdown aktiviert'),T(state.settings.countdownEnabled!==false?'Ja':'Nein')],[T('Unterschriftsbereich'),T(state.settings.reportSignature!==false?'Ja':'Nein')],[T('Datenschema'),{v:CURRENT_SCHEMA,t:'n'}],[T('App-Version'),T(APP_VERSION)]];
 const sheets=[['Übersicht',overview,[32,28],false],['Tagesübersicht',daily,[12,14,18,18,14,18,16,15,14,14,16,24,22,34],true],['Buchungen',bookings,[12,12,18,20,24,18,24],true],['Monatsübersicht',months,[22,16,16,16,18,28,18],true],['Jahresübersicht',years,[12,16,16,16,18,28,18],true],['Einstellungen',settings,[30,28],false]];
 const files=[];files.push({name:'[Content_Types].xml',data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_,i)=>`<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`});
 files.push({name:'_rels/.rels',data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`});
 files.push({name:'xl/workbook.xml',data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((sh,i)=>`<sheet name="${xml(sh[0])}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join('')}</sheets></workbook>`});
 files.push({name:'xl/_rels/workbook.xml.rels',data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_,i)=>`<Relationship Id="rId${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`});
 files.push({name:'xl/styles.xml',data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="3"><numFmt numFmtId="164" formatCode="dd.mm.yyyy"/><numFmt numFmtId="165" formatCode="hh:mm"/><numFmt numFmtId="166" formatCode="[h]:mm;-[h]:mm"/></numFmts><fonts count="4"><font><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/></font><font><color rgb="FF008000"/><sz val="11"/><name val="Calibri"/></font><font><color rgb="FFC00000"/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF315B7D"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="7"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="166" fontId="2" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/><xf numFmtId="166" fontId="3" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`});
 sheets.forEach((sh,i)=>files.push({name:`xl/worksheets/sheet${i+1}.xml`,data:sheetXml(sh[1],sh[2],{filter:sh[3],freeze:true})}));return new Blob([zipStore(files)],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'})
}
function createExcelFile(){return new File([makeWorkbook()],`Arbeitszeit_Auswertung_${todayKey()}.xlsx`,{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'})}
function exportXLSX(){try{const file=createExcelFile();downloadBlob(file.name,file);showToast('Excel-Auswertung erstellt')}catch(e){console.error(e);alert(`Excel-Datei konnte nicht erstellt werden: ${e.message}`)}}
async function createPackage(){const backup=createBackupFile(),xlsx=createExcelFile(),note=`Arbeitszeit-Sicherung\n\nSicherungsdatum: ${new Date().toLocaleString('de-DE')}\nApp-Version: ${APP_VERSION}\n\nDie JSON-Datei dient zur vollständigen Wiederherstellung in der App.\nDie Excel-Datei dient ausschließlich zur Ansicht und Auswertung.\n`;const files=[{name:backup.name,data:new Uint8Array(await backup.arrayBuffer())},{name:xlsx.name,data:new Uint8Array(await xlsx.arrayBuffer())},{name:'Hinweise.txt',data:note}];return new File([zipStore(files)],`Arbeitszeit_Sicherung_${todayKey()}.zip`,{type:'application/zip'})}
async function sharePackage(){try{const zip=await createPackage();if(navigator.share&&navigator.canShare?.({files:[zip]})){await navigator.share({title:'Arbeitszeit-Sicherung',text:'JSON-Backup und Excel-Auswertung',files:[zip]});showToast('Teilen-Menü geöffnet')}else{downloadBlob(zip.name,zip);alert('Das Teilen von Dateien wird hier nicht unterstützt. Das ZIP-Paket wurde stattdessen heruntergeladen.')}}catch(e){if(e?.name!=='AbortError'){console.error(e);alert(`Sicherung konnte nicht geteilt werden: ${e.message}`)}}}


function pdfWinAnsiByte(ch){
  const code=ch.charCodeAt(0),map={0x20ac:128,0x201a:130,0x0192:131,0x201e:132,0x2026:133,0x2020:134,0x2021:135,0x02c6:136,0x2030:137,0x0160:138,0x2039:139,0x0152:140,0x017d:142,0x2018:145,0x2019:146,0x201c:147,0x201d:148,0x2022:149,0x2013:150,0x2014:151,0x02dc:152,0x2122:153,0x0161:154,0x203a:155,0x0153:156,0x017e:158,0x0178:159};
  if(code<=255)return code;return map[code]||63
}
function pdfBytes(text){const out=new Uint8Array(String(text).length);for(let i=0;i<out.length;i++)out[i]=pdfWinAnsiByte(String(text)[i]);return out}
function pdfEscape(value){let out='';for(const ch of String(value??'').replace(/[\r\n\t]+/g,' ')){const b=pdfWinAnsiByte(ch);if(b===40||b===41||b===92)out+='\\'+String.fromCharCode(b);else if(b<32)out+=' ';else out+=String.fromCharCode(b)}return out}
function pdfTextWidth(text,size){let units=0;for(const ch of String(text??'')){if(' .,:;!|ijlI1'.includes(ch))units+=.28;else if('MW@%ÄÖÜ'.includes(ch))units+=.82;else units+=.53}return units*size}
function pdfFitText(text,width,size){let value=String(text??'');if(pdfTextWidth(value,size)<=width)return value;while(value.length>1&&pdfTextWidth(value+'…',size)>width)value=value.slice(0,-1);return value+'…'}
function pdfText(cmd,text,x,y,size=9,bold=false,align='left',maxWidth=null){let value=String(text??'');if(maxWidth)value=pdfFitText(value,maxWidth,size);let tx=x;if(align==='right')tx=x-pdfTextWidth(value,size);else if(align==='center')tx=x-pdfTextWidth(value,size)/2;cmd.push(`BT /${bold?'F2':'F1'} ${size} Tf 0 g 1 0 0 1 ${tx.toFixed(2)} ${y.toFixed(2)} Tm (${pdfEscape(value)}) Tj ET`)}
function pdfLine(cmd,x1,y1,x2,y2,gray=.78,width=.6){cmd.push(`${gray} G ${width} w ${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`)}
function pdfFillRect(cmd,x,y,w,h,gray=.94){cmd.push(`${gray} g ${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f 0 g`)}
function pdfBuildDocument(streams){
  const objects=[null,'<< /Type /Catalog /Pages 2 0 R >>',null,'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'];
  const kids=[];let next=5;
  for(const stream of streams){const pageId=next++,contentId=next++;kids.push(`${pageId} 0 R`);const length=pdfBytes(stream).length;objects[pageId]=`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 841.89 595.28] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`;objects[contentId]=`<< /Length ${length} >>\nstream\n${stream}\nendstream`}
  objects[2]=`<< /Type /Pages /Count ${streams.length} /Kids [${kids.join(' ')}] >>`;
  const parts=[pdfBytes('%PDF-1.4\n%âãÏÓ\n')],offsets=[0];let offset=parts[0].length;
  for(let i=1;i<objects.length;i++){offsets[i]=offset;const bytes=pdfBytes(`${i} 0 obj\n${objects[i]}\nendobj\n`);parts.push(bytes);offset+=bytes.length}
  const xrefOffset=offset;let xref=`xref\n0 ${objects.length}\n0000000000 65535 f \n`;for(let i=1;i<objects.length;i++)xref+=`${String(offsets[i]).padStart(10,'0')} 00000 n \n`;xref+=`trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  parts.push(pdfBytes(xref));return new Blob(parts,{type:'application/pdf'})
}
function pdfReportPages({title,subtitle,closingLabel,closingValue,metrics,columns,rows,signature}){
  const pageW=841.89,pageH=595.28,margin=30,tableW=pageW-margin*2,rowH=17,headerH=21,created=new Intl.DateTimeFormat('de-DE',{dateStyle:'medium',timeStyle:'short'}).format(new Date()),name=state.settings.employeeName||'Arbeitszeitnachweis',streams=[];
  const firstRows=16,nextRows=25;let cursor=0,pageNo=0;
  while(cursor<rows.length||pageNo===0){const cmd=[],first=pageNo===0;pdfText(cmd,name,margin,pageH-34,15,true);pdfText(cmd,title,margin,pageH-54,12,true);pdfText(cmd,subtitle,margin,pageH-70,8.5,false);pdfText(cmd,`Erstellt: ${created}`,pageW-margin,pageH-34,8,false,'right');pdfText(cmd,`Seite ${pageNo+1}`,pageW-margin,pageH-50,8,false,'right');pdfLine(cmd,margin,pageH-79,pageW-margin,pageH-79,.25,1.2);
    let tableTop;
    if(first){pdfFillRect(cmd,margin,pageH-135,tableW,42,.965);pdfText(cmd,closingLabel,margin+12,pageH-111,9,false);pdfText(cmd,closingValue,pageW-margin-12,pageH-113,20,true,'right');let my=pageH-160;for(let i=0;i<metrics.length;i++){const col=i%2,row=Math.floor(i/2),x=margin+col*(tableW/2),y=my-row*20;pdfText(cmd,metrics[i][0],x,y,8.2,false,'left',tableW/2-100);pdfText(cmd,metrics[i][1],x+tableW/2-12,y,8.5,true,'right');pdfLine(cmd,x,y-5,x+tableW/2-12,y-5,.88,.45)}tableTop=pageH-160-Math.ceil(metrics.length/2)*20-18}else tableTop=pageH-98;
    let x=margin;pdfFillRect(cmd,margin,tableTop-headerH,tableW,headerH,.91);for(const col of columns){pdfText(cmd,col.label,col.align==='right'?x+col.width-5:x+5,tableTop-14,7.2,true,col.align==='right'?'right':'left',col.width-10);pdfLine(cmd,x,tableTop,x,tableTop-headerH,.8,.45);x+=col.width}pdfLine(cmd,x,tableTop,x,tableTop-headerH,.8,.45);pdfLine(cmd,margin,tableTop,pageW-margin,tableTop,.65,.6);pdfLine(cmd,margin,tableTop-headerH,pageW-margin,tableTop-headerH,.65,.6);
    const maxRows=first?firstRows:nextRows,chunk=rows.slice(cursor,cursor+maxRows);let y=tableTop-headerH;for(const row of chunk){let cx=margin;y-=rowH;for(let i=0;i<columns.length;i++){const col=columns[i],value=row[i]??'';pdfText(cmd,value,col.align==='right'?cx+col.width-5:cx+5,y+5.5,6.8,false,col.align==='right'?'right':'left',col.width-10);pdfLine(cmd,cx,y+rowH,cx,y,.88,.35);cx+=col.width}pdfLine(cmd,cx,y+rowH,cx,y,.88,.35);pdfLine(cmd,margin,y,pageW-margin,y,.88,.35)}
    cursor+=chunk.length;if(cursor>=rows.length&&signature){const sy=Math.max(42,y-34);pdfLine(cmd,margin,sy,margin+220,sy,.35,.7);pdfLine(cmd,pageW-margin-220,sy,pageW-margin,sy,.35,.7);pdfText(cmd,'Datum / Unterschrift Mitarbeiter',margin,sy-13,7.5);pdfText(cmd,'Datum / Bestätigung',pageW-margin-220,sy-13,7.5)}streams.push(cmd.join('\n'));pageNo++}
  return streams
}
function createReportPdfFile(type,y,m){
  if(type==='month'){
    const start=`${y}-${pad(m+1)}-01`,end=dateKey(new Date(y,m+1,0,12)),s=periodSummary(start,end),title=new Intl.DateTimeFormat('de-DE',{month:'long',year:'numeric'}).format(new Date(y,m,1));
    const metrics=[['Übertrag Vormonat',formatDuration(s.opening)],['Monatsdifferenz',formatDuration(s.diff)],['Sollzeit',formatDuration(s.target,{signed:false})],['Nettozeit',formatDuration(s.net,{signed:false})],['Pausenzeit',formatDuration(s.pause,{signed:false})],['Urlaubstage',formatDayCount(s.vacation)],['Krankheitstage',formatDayCount(s.sick)],['Unvollständige Tage',String(s.incomplete)]];
    const columns=[{label:'Datum',width:58},{label:'Status / Abwesenheit',width:132},{label:'Kommen',width:62,align:'right'},{label:'Gehen',width:62,align:'right'},{label:'Pause',width:49,align:'right'},{label:'Netto',width:58,align:'right'},{label:'Soll',width:58,align:'right'},{label:'Diff.',width:58,align:'right'},{label:'Zeitkonto',width:70,align:'right'},{label:'Notiz',width:175}];
    const rows=s.days.map(d=>{const c=calculateDay(d),ins=(d.entries||[]).filter(e=>e.type==='in').map(e=>e.logged).join(', ')||'–',outs=(d.entries||[]).filter(e=>e.type==='out').map(e=>e.logged).join(', ')||'–',status=d.absence?`${dayStatus(d)} / ${d.absence}`:dayStatus(d);return[formatDate(d.date,{day:'2-digit',month:'2-digit',year:'numeric'}),status,ins,outs,String(Number(d.pauseMinutes)||0),formatDuration(c.net,{signed:false}),formatDuration(c.target,{signed:false}),formatDuration(c.diff),formatDuration(balanceThrough(d.date)),d.absenceNote||d.note||'']});
    const blob=pdfBuildDocument(pdfReportPages({title:`Monatsbericht ${title}`,subtitle:`Zeitraum: ${formatDate(start,{day:'2-digit',month:'2-digit',year:'numeric'})} bis ${formatDate(s.cutoff,{day:'2-digit',month:'2-digit',year:'numeric'})}`,closingLabel:'Zeitkonto Monatsende / Stichtag',closingValue:formatDuration(s.closing),metrics,columns,rows,signature:state.settings.reportSignature!==false}));return new File([blob],`Arbeitszeit_Monat_${pad(m+1)}-${y}.pdf`,{type:'application/pdf'})
  }
  const s=periodSummary(`${y}-01-01`,`${y}-12-31`),metrics=[['Übertrag Vorjahr',formatDuration(s.opening)],['Jahresveränderung',formatDuration(s.diff)],['Sollzeit',formatDuration(s.target,{signed:false})],['Nettozeit',formatDuration(s.net,{signed:false})],['Pausenzeit',formatDuration(s.pause,{signed:false})],['Urlaubstage',formatDayCount(s.vacation)],['Krankheitstage',formatDayCount(s.sick)],['Zeitausgleichstage',formatDayCount(s.timeOff||0)]],columns=[{label:'Monat',width:180},{label:'Soll',width:78,align:'right'},{label:'Netto',width:78,align:'right'},{label:'Pause',width:78,align:'right'},{label:'Veränderung',width:98,align:'right'},{label:'Zeitkonto',width:98,align:'right'},{label:'Urlaub',width:85,align:'right'},{label:'Krank',width:85,align:'right'}],rows=[];
  for(let month=0;month<12;month++){if(y===new Date().getFullYear()&&month>new Date().getMonth())continue;const ms=periodSummary(`${y}-${pad(month+1)}-01`,dateKey(new Date(y,month+1,0,12)));rows.push([new Intl.DateTimeFormat('de-DE',{month:'long'}).format(new Date(y,month,1)),formatDuration(ms.target,{signed:false}),formatDuration(ms.net,{signed:false}),formatDuration(ms.pause,{signed:false}),formatDuration(ms.diff),formatDuration(ms.closing),formatDayCount(ms.vacation),formatDayCount(ms.sick)])}
  const blob=pdfBuildDocument(pdfReportPages({title:`Jahresbericht ${y}`,subtitle:`Jahr ${y}`,closingLabel:'Zeitkonto Jahresende / aktueller Stichtag',closingValue:formatDuration(s.closing),metrics,columns,rows,signature:state.settings.reportSignature!==false}));return new File([blob],`Arbeitszeit_Jahr_${y}.pdf`,{type:'application/pdf'})
}
async function shareMobileReportPdf(){
  const file=createReportPdfFile(mobileReportType,mobileReportYear,mobileReportMonth),payload={title:mobileReportType==='month'?'Arbeitszeit-Monatsbericht':'Arbeitszeit-Jahresbericht',text:'Arbeitszeitbericht als PDF',files:[file]};
  try{if(navigator.share&&(!navigator.canShare||navigator.canShare({files:[file]}))){await navigator.share(payload);showToast('PDF-Teilen geöffnet');return}downloadBlob(file.name,file);alert('Die direkte Dateifreigabe wird auf diesem Gerät nicht unterstützt. Das PDF wurde stattdessen gespeichert.')}catch(e){if(e?.name==='AbortError')return;console.error(e);downloadBlob(file.name,file);alert('Das native Teilen-Menü konnte nicht geöffnet werden. Das PDF wurde stattdessen gespeichert.')}
}

let mobileReportType=null,mobileReportYear=new Date().getFullYear(),mobileReportMonth=new Date().getMonth();
function reportDiffClass(v){return v<0?'red':v>0?'green':''}
function openMobileReport(type){
  mobileReportType=type;const now=new Date();if(type==='month'){const v=$('reportMonth').value||todayKey().slice(0,7);mobileReportYear=Number(v.slice(0,4));mobileReportMonth=Number(v.slice(5,7))-1}else mobileReportYear=Number($('reportYear').value)||now.getFullYear();
  $('mobileReport').classList.add('open');$('mobileReport').setAttribute('aria-hidden','false');document.body.classList.add('preview-open');renderMobileReport();
}
function closeMobileReport(){$('mobileReport').classList.remove('open');$('mobileReport').setAttribute('aria-hidden','true');document.body.classList.remove('preview-open')}
function shiftMobileReport(delta){if(mobileReportType==='month'){const d=new Date(mobileReportYear,mobileReportMonth+delta,1);if(d>new Date())return;mobileReportYear=d.getFullYear();mobileReportMonth=d.getMonth();$('reportMonth').value=`${mobileReportYear}-${pad(mobileReportMonth+1)}`}else{const y=mobileReportYear+delta;if(y>new Date().getFullYear()||y<earliestYear())return;mobileReportYear=y;$('reportYear').value=String(y)}renderMobileReport()}
function renderMobileReport(){
  const month=mobileReportType==='month',s=month?monthSummary(mobileReportYear,mobileReportMonth):yearSummary(mobileReportYear),title=month?'Monatsbericht':'Jahresbericht';$('mobileReportTitle').textContent=title;
  $('mobileReportPeriod').textContent=month?new Intl.DateTimeFormat('de-DE',{month:'long',year:'numeric'}).format(new Date(mobileReportYear,mobileReportMonth,1)):String(mobileReportYear);
  $('mobileReportPrev').disabled=month?(mobileReportYear===earliestYear()&&mobileReportMonth===0):mobileReportYear<=earliestYear();$('mobileReportNext').disabled=month?(mobileReportYear===new Date().getFullYear()&&mobileReportMonth===new Date().getMonth()):mobileReportYear>=new Date().getFullYear();
  const metrics=month?[['Zeitkontostand zu Monatsbeginn',s.opening],['Nettozeit (Ist)',s.net,false],['Sollzeit',s.target,false],['Monatsdifferenz',s.diff,true],['Pausenzeit',s.pause,false],['Arbeitstage',s.days.filter(d=>calculateDay(d).net>0||d.absence).length,'number'],['Zeitkontostand zum Stichtag',s.closing,true]]:[['Zeitkontostand zu Jahresbeginn',s.opening],['Nettozeit (Ist)',s.net,false],['Sollzeit',s.target,false],['Jahresveränderung',s.diff,true],['Pausenzeit',s.pause,false],['Arbeitstage',s.days.filter(d=>calculateDay(d).net>0||d.absence).length,'number'],['Zeitkontostand zum Stichtag',s.closing,true]];
  const metricHtml=`<div class="mobile-report-metrics">${metrics.map(([label,val,signed])=>`<div><span>${label}</span><b class="${signed===true?reportDiffClass(val):''}">${signed==='number'?val:formatDuration(val,{signed:signed!==false})}</b></div>`).join('')}</div>`;
  let rows='';if(month){rows=s.days.map(d=>{const c=calculateDay(d);return `<tr><td>${new Intl.DateTimeFormat('de-DE',{weekday:'short'}).format(parseDateKey(d.date))}<br><b>${formatDate(d.date,{day:'2-digit',month:'2-digit'})}</b></td><td class="num">${formatDuration(c.net,{signed:false})}</td><td class="num">${formatDuration(c.target,{signed:false})}</td><td class="num ${reportDiffClass(c.diff)}">${formatDuration(c.diff)}</td></tr>`}).join('')||'<tr><td colspan="4" class="empty">Keine Daten vorhanden</td></tr>'}else{rows=s.months.map((ms,m)=>`<tr><td>${new Intl.DateTimeFormat('de-DE',{month:'short'}).format(new Date(mobileReportYear,m,1))} ${mobileReportYear}</td><td class="num">${formatDuration(ms.net,{signed:false})}</td><td class="num">${formatDuration(ms.target,{signed:false})}</td><td class="num ${reportDiffClass(ms.diff)}">${formatDuration(ms.diff)}</td></tr>`).join('')}
  $('mobileReportContent').innerHTML=`${metricHtml}<h2 class="mobile-report-section">${month?'Tagesübersicht':'Monatsübersicht'}</h2><div class="mobile-report-table"><table><thead><tr><th>${month?'Tag':'Monat'}</th><th class="num">Ist (Netto)</th><th class="num">Soll</th><th class="num">Diff.</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}
function printMobileReport(){if(mobileReportType==='month')monthReport(mobileReportYear,mobileReportMonth);else yearReport(mobileReportYear)}

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
  $('monthReportBtn').addEventListener('click',()=>openMobileReport('month'));
  $('yearReportBtn').addEventListener('click',()=>openMobileReport('year'));
  $('chartMonthMode').addEventListener('click',()=>setChartMode('month'));$('chartYearMode').addEventListener('click',()=>setChartMode('year'));$('chartHistoryMode').addEventListener('click',()=>setChartMode('history'));$('chartYear').addEventListener('change',()=>{chartSelection=null;renderOvertimeChart()});
  $('closeMobileReport').addEventListener('click',closeMobileReport);$('mobileReportPrev').addEventListener('click',()=>shiftMobileReport(-1));$('mobileReportNext').addEventListener('click',()=>shiftMobileReport(1));$('mobileReportPrint').addEventListener('click',printMobileReport);$('mobileReportShare').addEventListener('click',shareMobileReportPdf);$('closePrintPreview').addEventListener('click',closePrintPreview);$('printReportBtn').addEventListener('click',printCurrentReport);
  $('shareBackupBtn').addEventListener('click',sharePackage);$('jsonRestoreBtn').addEventListener('click',()=>$('restoreFile').click());$('restoreFile').addEventListener('change',e=>restoreJSON(e.target.files[0]));
  ['employeeName','targetHours','checkpointBalance','freeChristmasEve','freeNewYearsEve','countdownEnabled','reportSignature'].forEach(id=>$(id).addEventListener('change',saveSettings));
  updateClock();setInterval(updateClock,1000);window.addEventListener('resize',()=>{if(document.body.classList.contains('today-fixed')){renderTodayCapture(dayObject(todayKey()));updateCountdown({allowCelebrate:false})}});document.addEventListener('visibilitychange',()=>{if(!document.hidden&&document.body.classList.contains('today-fixed')){updateClock();updateCountdown()}});renderToday();
  if('serviceWorker'in navigator&&location.protocol!=='file:')navigator.serviceWorker.register('./sw.js').catch(()=>{});
}
document.addEventListener('DOMContentLoaded',init);

document.addEventListener('DOMContentLoaded',()=>{if(storageNotice)setTimeout(()=>showToast(storageNotice),250)});
