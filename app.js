const STORAGE_KEY='arbeitszeit-pwa-v1';
const STORAGE_BACKUP_KEY=STORAGE_KEY+'-backup';
const STORAGE_BACKUP_KEYS=[1,2,3].map(n=>`${STORAGE_KEY}-backup-${n}`);
const STORAGE_CORRUPT_KEY=STORAGE_KEY+'-corrupt';
const BACKUP_FORMAT='arbeitszeit-pwa-backup';
const TRACKING_START_DATE='2022-11-01';
const APP_VERSION='5.34';
const CURRENT_SCHEMA=12;
const IMPORT_DATA_VERSION=4;
const CALCULATION_VERSION=2;
const HOLIDAY_REGIONS=Object.freeze({BW:'Baden-Württemberg',BY:'Bayern',BE:'Berlin',BB:'Brandenburg',HB:'Bremen',HH:'Hamburg',HE:'Hessen',MV:'Mecklenburg-Vorpommern',NI:'Niedersachsen',NW:'Nordrhein-Westfalen',RP:'Rheinland-Pfalz',SL:'Saarland',SN:'Sachsen',ST:'Sachsen-Anhalt',SH:'Schleswig-Holstein',TH:'Thüringen'});
let storageNotice='';
let lastSavedFingerprint=null;
let calculationCache=null;
let calculationRevision=0;
let state=loadState();
let currentView='day';
let cursorDate=parseDateKey(state.settings.lastEditedDay||todayKey());
let monthDrill=null;
let editingEntries=[];
let expandedDayEntryIndex=-1;
let absenceEditorContext=null;
const modalFocusOrigins=new Map();
let confettiTimer=null;
let manualQuickType='in';
let quickContextDate=todayKey(),manualQuickDate=todayKey(),quickAbsenceCode='vacation';
let commentEditorContext=null;
let pendingShareFiles=null;
let fallbackShareCompleted={json:false,excel:false};
let pendingDiscardModalId=null,pendingDiscardAction=null,pendingUndo=null;
const modalBaselines=new Map();
const guardedModalIds=new Set(['dayModal','entryModal','pauseModal','manualQuickModal','quickAbsenceModal','absenceModal']);
const $=id=>document.getElementById(id);
const SVG={
in:`<svg class="icon" viewBox="0 0 32 32"><path d="M11 5.5h12v21H11"/><path d="M4.5 16h16M15.5 10.5 21 16l-5.5 5.5"/></svg>`,
out:`<svg class="icon" viewBox="0 0 32 32"><path class="door" d="M9 5.5h10v21H9"/><path d="M13 16h14M21.5 10.5 27 16l-5.5 5.5"/></svg>`,
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
function parseSignedTime(v){const m=String(v||'').trim().replace(',',':').match(/^([+-])?(\d{1,4})(?::([0-5]\d))?$/);if(!m)return null;const n=Number(m[2])*60+Number(m[3]||0);return m[1]==='-'?-n:n}
function formatDate(k,opts={weekday:'long',day:'2-digit',month:'long',year:'numeric'}){return new Intl.DateTimeFormat('de-DE',opts).format(parseDateKey(k))}
function normalizeNoteText(value){return String(value??'').replace(/\s+/g,' ').trim()}
function notePreview(value,max=96){const text=normalizeNoteText(value);return text.length>max?`${text.slice(0,Math.max(1,max-1)).trimEnd()}…`:text}
function hasMeaningfulData(d){return !!(d&&((d.entries&&d.entries.length)||(Number(d.pauseMinutes)||0)||d.absence||d.note||d.edited||d.capturedAfterImport))}
function clone(v){return JSON.parse(JSON.stringify(v))}
function isProtectedLocalDay(d){
if(!d)return false;
if(normalizeNoteText(d.note))return true;
if(d.edited||d.capturedAfterImport||d.modifiedAt||d.importCleared)return true;
if(!d.sourceYear&&hasMeaningfulData(d))return true;
return (d.entries||[]).some(e=>e&&(['capture','manual'].includes(e.source)||e.edited));
}

function normalizeTargetRules(raw){
const map=new Map();for(const rule of Array.isArray(raw)?raw:[]){const from=String(rule?.from||''),value=Number(rule?.minutes);if(isDateKey(from)&&from>=TRACKING_START_DATE&&Number.isFinite(value)&&value>0&&value<=1440)map.set(from,{from,minutes:Math.round(value)})}
map.set(TRACKING_START_DATE,{from:TRACKING_START_DATE,minutes:480});return[...map.values()].sort((a,b)=>a.from.localeCompare(b.from))
}
function normalizeHolidayRegionRules(raw){
const map=new Map();for(const rule of Array.isArray(raw)?raw:[]){const from=String(rule?.from||''),region=String(rule?.region||'').toUpperCase();if(isDateKey(from)&&from>=TRACKING_START_DATE&&HOLIDAY_REGIONS[region])map.set(from,{from,region})}
if(!map.has(TRACKING_START_DATE))map.set(TRACKING_START_DATE,{from:TRACKING_START_DATE,region:'HE'});return[...map.values()].sort((a,b)=>a.from.localeCompare(b.from))
}
function effectiveRule(rules,date){let picked=null;for(const rule of rules||[]){if(rule.from<=date)picked=rule;else break}return picked}
function targetMinutesFromSettings(date,settings){return Number(effectiveRule(normalizeTargetRules(settings?.targetRules),date)?.minutes)||480}
function holidayRegionFromSettings(date,settings){return effectiveRule(normalizeHolidayRegionRules(settings?.holidayRegionRules),date)?.region||'HE'}
function upsertEffectiveRule(rules,rule,key){const map=new Map((rules||[]).map(item=>[item.from,item]));map.set(rule.from,rule);return[...map.values()].sort((a,b)=>a.from.localeCompare(b.from))}
function localStateFingerprint(raw){try{const parsed=typeof raw==='string'?JSON.parse(raw):clone(raw);delete parsed.savedAt;return JSON.stringify(parsed)}catch(_e){return null}}
function rotateLocalBackups(previous){if(!previous)return;const chain=[previous,...STORAGE_BACKUP_KEYS.slice(0,-1).map(key=>localStorage.getItem(key)).filter(Boolean)];for(let i=0;i<STORAGE_BACKUP_KEYS.length;i++){const value=chain[i];if(value)localStorage.setItem(STORAGE_BACKUP_KEYS[i],value);else localStorage.removeItem(STORAGE_BACKUP_KEYS[i])}localStorage.setItem(STORAGE_BACKUP_KEY,previous)}
function migrateState(raw){
const migrated=raw&&typeof raw==='object'?raw:{days:{},settings:clone(typeof IMPORTED_SETTINGS==='object'?IMPORTED_SETTINGS:{})};
migrated.days=migrated.days&&typeof migrated.days==='object'?migrated.days:{};
migrated.settings={...(typeof IMPORTED_SETTINGS==='object'?clone(IMPORTED_SETTINGS):{}),...(migrated.settings&&typeof migrated.settings==='object'?migrated.settings:{})};
for(const original of IMPORTED){const existing=migrated.days[original.date];if(!existing||!isProtectedLocalDay(existing))migrated.days[original.date]=clone(original)}
Object.keys(migrated.days).filter(k=>k<TRACKING_START_DATE).forEach(k=>delete migrated.days[k]);
const s=migrated.settings;
s.targetRules=normalizeTargetRules(s.targetRules);s.holidayRegionRules=normalizeHolidayRegionRules(s.holidayRegionRules);s.targetMinutes=targetMinutesFromSettings(todayKey(),s);s.holidayRegion=holidayRegionFromSettings(todayKey(),s);
for(const d of Object.values(migrated.days)){const generatedName=computedHolidayNameForSettings(d.date,s);if(generatedName&&d.sourceYear&&dayAbsenceCode(d)==='holiday'&&!d.edited){d.generatedHoliday=true;d.absence='Feiertag';d.absenceCode='holiday';d.absenceDuration='full';d.holiday=generatedName}}
if(typeof s.lastExternalBackupAt!=='string')s.lastExternalBackupAt='';if(typeof s.employeeName!=='string')s.employeeName='';if(typeof s.freeChristmasEve!=='boolean')s.freeChristmasEve=true;if(typeof s.freeNewYearsEve!=='boolean')s.freeNewYearsEve=true;if(typeof s.reportSignature!=='boolean')s.reportSignature=true;if(typeof s.countdownEnabled!=='boolean')s.countdownEnabled=true;if(typeof s.bookingSoundEnabled!=='boolean')s.bookingSoundEnabled=false;if(typeof s.countdownCelebratedDate!=='string')s.countdownCelebratedDate=null;if(typeof s.showWeekends!=='boolean')s.showWeekends=false;
if(!s.legacyBalanceCheckpoint&&Number.isFinite(Number(s.balanceCheckpointMinutes)))s.legacyBalanceCheckpoint={date:s.balanceCheckpointDate||'2026-07-22',minutes:Number(s.balanceCheckpointMinutes),version:s.balanceCheckpointVersion||2};
s.startBalanceMinutes=0;s.trackingStartDate=TRACKING_START_DATE;s.calculationVersion=CALCULATION_VERSION;s.importDataVersion=IMPORT_DATA_VERSION;s.schemaVersion=CURRENT_SCHEMA;
delete s.balanceCheckpointDate;delete s.balanceCheckpointMinutes;delete s.balanceCheckpointVersion;delete s.correction20260727Applied;
const mixed=new Set(['2025-03-18','2025-03-19','2025-03-20','2025-03-21','2025-04-22','2025-04-23','2025-04-24','2025-04-25']);
Object.values(migrated.days).forEach(d=>{if(!Array.isArray(d.entries))d.entries=[];d.entries=d.entries.map(e=>({type:e.type==='out'?'out':'in',actual:e.actual||'',logged:e.logged||roundLogged(e.actual||'00:00',e.type==='out'?'out':'in'),source:e.source||((d.sourceYear&&!d.edited)?'excel':'manual'),createdAt:e.createdAt||null,edited:!!e.edited,...(e.editedAt?{editedAt:e.editedAt}:{})}));if(!Number.isFinite(Number(d.pauseMinutes)))d.pauseMinutes=0;if(d.absence==='Halber Urlaub'){d.absence='Urlaub';d.absenceCode='vacation';d.absenceDuration='half'}if(d.absence==='Gleittag'){d.absence='Zeitausgleich';d.absenceCode='timeOff'}const rawCode=String(d.absenceCode||'').toLowerCase(),label=String(d.absence||'').toLowerCase();if(rawCode==='u'||rawCode==='vacation'||label.includes('urlaub'))d.absenceCode='vacation';else if(rawCode==='k'||rawCode==='sick'||label.includes('krank'))d.absenceCode='sick';else if(rawCode==='timeoff'||rawCode==='time_off'||label.includes('gleit')||label.includes('zeitausgleich'))d.absenceCode='timeOff';else if(rawCode==='holiday'||d.holiday||label.includes('feiertag'))d.absenceCode='holiday';else if(rawCode==='free'||label.includes('frei'))d.absenceCode='free';else if(d.absence)d.absenceCode='other';else d.absenceCode=null;if(d.absence&&!d.absenceDuration)d.absenceDuration='full';if(d.absenceNote==null)d.absenceNote='';if(!d.entries.length&&!d.absence&&Number(d.pauseMinutes)>0){d.legacyOrphanPauseMinutes=Number(d.pauseMinutes);d.pauseMinutes=0;d.dataCorrection=d.dataCorrection||'Pause ohne Arbeitszeitbuchung entfernt; Tag bleibt offen.'}if(mixed.has(d.date)&&d.absence==='Urlaub'&&!d.edited){d.legacyImportAbsence={label:d.absence,code:d.absenceCode,duration:d.absenceDuration};clearAbsenceFields(d);d.dataCorrection='Urlaubkennzeichen entfernt; Buchungen gelten als regulärer Arbeitstag.'}if(d.date==='2025-12-15'&&d.absence==='Urlaub'&&d.entries.length===1&&(d.entries[0].logged||d.entries[0].actual)==='00:00'){d.legacyImportEntries=clone(d.entries);d.entries=[];d.dataCorrection='Fehlerhafte Einzelbuchung 00:00 entfernt; Urlaub bleibt bestehen.'}if(['2023-09-18','2024-01-25','2024-01-26','2024-09-30'].includes(d.date)&&!d.entries.length&&!d.edited){d.absence='Zeitausgleich';d.absenceCode='timeOff';d.absenceDuration='full';d.absenceNote='';d.dataCorrection='Als bestätigter Gleittag gekennzeichnet.'}delete d.absenceMinutes;d.importDataVersion=IMPORT_DATA_VERSION});
if(!s.lastEditedDay||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(s.lastEditedDay)||s.lastEditedDay<TRACKING_START_DATE)s.lastEditedDay=findLatestRelevantDay(migrated.days);calculationCache=null;calculationRevision++;return migrated
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
function compactState(full){const overrides={};Object.entries(full.days||{}).forEach(([k,d])=>{const original=IMPORTED_BY_DATE[k];if(!original||isProtectedLocalDay(d)||JSON.stringify(d)!==JSON.stringify(original))overrides[k]=d});return{compact:true,schemaVersion:CURRENT_SCHEMA,appVersion:APP_VERSION,settings:full.settings,overrides}}
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
const primary=localStorage.getItem(STORAGE_KEY);if(primary){try{const loaded=migrateState(parseStored(primary));lastSavedFingerprint=localStateFingerprint(primary);return loaded}catch(e){try{localStorage.setItem(STORAGE_CORRUPT_KEY,primary)}catch(_e){}for(const key of [...STORAGE_BACKUP_KEYS,STORAGE_BACKUP_KEY]){const backup=localStorage.getItem(key);if(!backup)continue;try{storageNotice='Der Hauptspeicher war beschädigt. Eine interne Sicherung wurde geladen.';lastSavedFingerprint=localStateFingerprint(backup);localStorage.removeItem(STORAGE_KEY);return migrateState(parseStored(backup))}catch(_e){}}storageNotice='Gespeicherte Daten konnten nicht gelesen werden. Der beschädigte Stand wurde separat erhalten.'}}
return migrateState(null)
}
function saveState({force=false}={}){
calculationCache=null;calculationRevision++;try{const compact=compactState(state),fingerprint=JSON.stringify(compact);if(!force&&fingerprint===lastSavedFingerprint)return true;const payload=JSON.stringify({...compact,savedAt:new Date().toISOString()}),previous=localStorage.getItem(STORAGE_KEY);if(previous&&localStateFingerprint(previous)!==fingerprint)rotateLocalBackups(previous);localStorage.setItem(STORAGE_KEY,payload);lastSavedFingerprint=fingerprint;return true}catch(e){storageNotice='Speichern fehlgeschlagen. Bitte ein JSON-Backup exportieren und freien Gerätespeicher prüfen.';if(typeof showToast==='function')showToast(storageNotice);console.error('Arbeitszeit: Speichern fehlgeschlagen',e);return false}
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

function repentanceDay(y){const d=new Date(y,10,22,12);while(d.getDay()!==3)d.setDate(d.getDate()-1);return dateKey(d)}
function publicHolidaysForRegion(y,region){
const e=easterSunday(y),h={};h[`${y}-01-01`]='Neujahr';h[addDays(e,-2)]='Karfreitag';h[addDays(e,1)]='Ostermontag';h[`${y}-05-01`]='Tag der Arbeit';h[addDays(e,39)]='Christi Himmelfahrt';h[addDays(e,50)]='Pfingstmontag';h[`${y}-10-03`]='Tag der Deutschen Einheit';h[`${y}-12-25`]='1. Weihnachtsfeiertag';h[`${y}-12-26`]='2. Weihnachtsfeiertag';
if(['BW','BY','ST'].includes(region))h[`${y}-01-06`]='Heilige Drei Könige';if(region==='BE'||(region==='MV'&&y>=2023))h[`${y}-03-08`]='Internationaler Frauentag';if(region==='BB'){h[addDays(e,0)]='Ostersonntag';h[addDays(e,49)]='Pfingstsonntag'}if(['BW','BY','HE','NW','RP','SL'].includes(region))h[addDays(e,60)]='Fronleichnam';if(region==='SL')h[`${y}-08-15`]='Mariä Himmelfahrt';if(region==='TH')h[`${y}-09-20`]='Weltkindertag';if(['BB','HB','HH','MV','NI','SN','ST','SH','TH'].includes(region))h[`${y}-10-31`]='Reformationstag';if(['BW','BY','NW','RP','SL'].includes(region))h[`${y}-11-01`]='Allerheiligen';if(region==='SN')h[repentanceDay(y)]='Buß- und Bettag';return h
}
function computedHolidayNameForSettings(k,settings){const y=Number(k.slice(0,4)),region=holidayRegionFromSettings(k,settings),name=publicHolidaysForRegion(y,region)[k];if(name)return name;if(k.endsWith('-12-24')&&settings?.freeChristmasEve!==false)return'Heiligabend (betrieblich frei)';if(k.endsWith('-12-31')&&settings?.freeNewYearsEve!==false)return'Silvester (betrieblich frei)';return null}
function computedHolidayName(k){return computedHolidayNameForSettings(k,state.settings)}
function hessenHolidays(y){return publicHolidaysForRegion(y,'HE')}
function ensureHolidayYear(y){
let changed=false;const holidays={};for(const k of dateRange(`${y}-01-01`,`${y}-12-31`)){const name=computedHolidayName(k);if(name)holidays[k]=name}
for(const [k,name] of Object.entries(holidays)){const current=state.days[k],canGenerate=!current||current.generatedHoliday&&!current.edited||(!hasMeaningfulData(current)&&!current.sourceYear);if(!canGenerate)continue;const d=current||{date:k,entries:[],pauseMinutes:0,note:'',sourceYear:null};if(d.absence!=='Feiertag'||d.absenceCode!=='holiday'||d.holiday!==name||!d.generatedHoliday){d.absence='Feiertag';d.absenceCode='holiday';d.absenceDuration='full';d.absenceNote='';d.holiday=name;d.generatedHoliday=true;d.archived=y<new Date().getFullYear();state.days[k]=d;changed=true}}
Object.values(state.days).filter(d=>d.generatedHoliday&&!d.edited&&d.date.startsWith(`${y}-`)&&!holidays[d.date]).forEach(d=>{if((d.entries||[]).length||Number(d.pauseMinutes)||normalizeNoteText(d.note)){clearAbsenceFields(d);delete d.holiday;delete d.generatedHoliday}else delete state.days[d.date];changed=true});return changed
}
function ensureHolidayYears(fromYear=Number(TRACKING_START_DATE.slice(0,4)),toYear=new Date().getFullYear()+1){let changed=false;for(let y=fromYear;y<=toYear;y++)changed=ensureHolidayYear(y)||changed;return changed}
function absenceCodeFromLabel(label){
const v=String(label||'').toLowerCase();
if(v.includes('urlaub'))return'vacation';
if(v.includes('krank'))return'sick';
if(v.includes('gleit')||v.includes('zeitausgleich'))return'timeOff';
if(v.includes('feiertag'))return'holiday';
if(v.includes('frei'))return'free';
return label?'other':null;
}
function dayAbsenceCode(d){
if(!d)return null;const raw=String(d.absenceCode||'').toLowerCase(),label=String(d.absence||'').toLowerCase();
if(raw==='u'||raw==='vacation'||label.includes('urlaub'))return'vacation';
if(raw==='k'||raw==='sick'||label.includes('krank'))return'sick';
if(raw==='timeoff'||raw==='time_off'||label.includes('gleit')||label.includes('zeitausgleich'))return'timeOff';
if(raw==='holiday'||d.holiday||label.includes('feiertag'))return'holiday';
if(raw==='free'||label.includes('frei'))return'free';
return d.absence?'other':null;
}
function absenceLabel(code){return({vacation:'Urlaub',sick:'Krankheit',timeOff:'Zeitausgleich',other:'Sonstige Abwesenheit',holiday:'Feiertag',free:'Frei'})[code]||'Sonstige Abwesenheit'}
function absenceDuration(d){return d?.absenceDuration==='half'||d?.absence==='Halber Urlaub'?'half':'full'}
function absenceFraction(d){return absenceDuration(d)==='half'?0.5:1}
function absenceGroupDays(groupId){return groupId?Object.values(state.days).filter(d=>d.absenceGroupId===groupId).sort((a,b)=>a.date.localeCompare(b.date)):[]}
function hasFullAbsence(d){return !!(d?.absence&&absenceDuration(d)==='full')}
function clearAbsenceFields(d){
d.absence=null;d.absenceCode=null;d.absenceDuration=null;d.absenceMinutes=0;d.absenceNote='';d.absenceGroupId=null;d.absenceCreatedAt=null;d.absenceUpdatedAt=null;
}
function dateRange(from,to){const a=parseDateKey(from),b=parseDateKey(to),r=[];for(let d=new Date(a);d<=b;d.setDate(d.getDate()+1))r.push(dateKey(d));return r}
function holidayNameForDate(k){const d=state.days[k];if(d?.holiday&&!d.generatedHoliday)return d.holiday;return computedHolidayName(k)||d?.holiday||null}
function scheduledTargetMinutes(k){if(k<TRACKING_START_DATE)return 0;const wd=parseDateKey(k).getDay();return wd>=1&&wd<=5&&!holidayNameForDate(k)?targetMinutesFromSettings(k,state.settings):0}
function targetMinutesForDate(k,d=state.days[k]||null){
const base=scheduledTargetMinutes(k),code=dayAbsenceCode(d);if(!code)return base;
if(code==='timeOff')return base;
if(['vacation','sick','holiday','free','other'].includes(code))return absenceDuration(d)==='half'?Math.round(base/2):0;
return base;
}
function absenceCreditMinutes(d){if(!d?.absence)return 0;return Math.max(0,scheduledTargetMinutes(d.date)-targetMinutesForDate(d.date,d))}
function absenceSummaryText(d){if(!d?.absence)return'Keine Abwesenheit eingetragen';const extent=absenceDuration(d)==='half'?'Halber Tag':'Ganzer Tag';return `${d.absence} · ${extent} · Sollzeit ${formatDuration(targetMinutesForDate(d.date,d),{signed:false})}`}
function isAbsenceWorkday(k){return scheduledTargetMinutes(k)>0}
function newAbsenceGroupId(){return `absence-${Date.now()}-${Math.random().toString(36).slice(2,8)}`}
function formatDayCount(v){return Number.isInteger(v)?String(v):String(v).replace('.',',')}
function normalizedEntryTimeline(entries,field='logged'){
let previous=null;const values=[];
for(const entry of entries||[]){
const value=entry?.[field]||entry?.actual||entry?.logged;if(!isClock(value))return null;
const clock=minutes(value);let current=clock;
if(previous!==null){
const dayOffset=Math.floor(previous/1440),previousClock=previous%1440;current=clock+dayOffset*1440;
if(current<previous){
// Ein Tageswechsel ist nur bei einem deutlichen Sprung über Mitternacht plausibel.
// Kleine Rücksprünge sind Überschneidungen und dürfen nicht als Folgetag interpretiert werden.
if(previousClock-clock<360)return null;
current+=1440;
}
}
values.push(current);previous=current;
}
return values;
}
function validateEntries(entries){
entries=entries||[];let plausible=true;
entries.forEach((e,i)=>{if(e.type!==(i%2===0?'in':'out')||!isClock(e.actual)||!isClock(e.logged))plausible=false});
const actual=normalizedEntryTimeline(entries,'actual'),logged=normalizedEntryTimeline(entries,'logged');
if(entries.length&&(!actual||!logged))plausible=false;
if(actual)for(let i=1;i<actual.length;i++)if(actual[i]<actual[i-1])plausible=false;
if(logged)for(let i=1;i<logged.length;i++)if(logged[i]-logged[i-1]<5)plausible=false;
const complete=entries.length>0&&entries.length%2===0&&entries.every((e,i)=>e.type===(i%2===0?'in':'out'))&&!!actual&&!!logged;
return{complete,plausible,actual,logged};
}
function calculateDay(d,cutoff=todayKey()){
const k=d?.date||cutoff,target=targetMinutesForDate(k,d),entries=d?.entries||[],validation=validateEntries(entries),enteredPause=Math.max(0,Number(d?.pauseMinutes)||0),beforeStart=k<TRACKING_START_DATE,future=k>cutoff,today=k===cutoff;
if(beforeStart||future)return{gross:0,net:0,target:beforeStart?0:target,diff:0,complete:true,plausible:true,workedNet:0,appliedPause:0,enteredPause,counted:false,missing:false,incomplete:false};
let gross=0;
if(validation.complete&&validation.plausible)for(let i=0;i<entries.length;i+=2)gross+=validation.logged[i+1]-validation.logged[i];
const pausePlausible=enteredPause<=gross,valid=validation.complete&&validation.plausible&&pausePlausible,net=valid?Math.max(0,gross-enteredPause):0,code=dayAbsenceCode(d),hasAbsence=!!code;
let counted=false;if(!today)counted=target>0||entries.length>0||hasAbsence||!!holidayNameForDate(k);else counted=valid||hasAbsence;
const missing=!today&&target>0&&!entries.length&&!hasAbsence,incomplete=entries.length>0&&!valid;
return{gross,net,target,diff:counted?net-target:0,complete:validation.complete&&pausePlausible,plausible:validation.plausible&&pausePlausible,workedNet:net,appliedPause:valid?enteredPause:0,enteredPause,counted,missing,incomplete};
}
const METRIC_KEYS=['net','target','pause','diff','vacation','sick','timeOff','other','incomplete','missing'];
function emptyMetric(){return{net:0,target:0,pause:0,diff:0,vacation:0,sick:0,timeOff:0,other:0,incomplete:0,missing:0}}
function metricForDay(d,cutoff=todayKey()){
const c=calculateDay(d,cutoff);if(!c.counted)return emptyMetric();const code=dayAbsenceCode(d),fraction=absenceFraction(d);
return{net:c.net,target:c.target,pause:c.appliedPause,diff:c.diff,vacation:code==='vacation'?fraction:0,sick:code==='sick'?fraction:0,timeOff:code==='timeOff'?fraction:0,other:d?.absence&&!['vacation','sick','timeOff','holiday','free'].includes(code)?fraction:0,incomplete:c.incomplete?1:0,missing:c.missing?1:0};
}
function metricDelta(current,original){const r={};for(const k of METRIC_KEYS)r[k]=(current[k]||0)-(original[k]||0);return r}
function addMetric(a,b){for(const k of METRIC_KEYS)a[k]=(a[k]||0)+(b[k]||0);return a}
function isCountable(d,cutoff=todayKey()){return calculateDay(d,cutoff).counted}
function calendarRecords(start,end){const rows=[];if(end<start)return rows;for(const k of dateRange(start,end)){const d=dayObject(k),c=calculateDay(d,todayKey());if(c.counted||hasMeaningfulData(d)||holidayNameForDate(k)||k===todayKey())rows.push(d)}return rows}
function ledger(){
const cutoff=todayKey(),signature=`${calculationRevision}|${cutoff}|${JSON.stringify(state.settings.targetRules)}|${JSON.stringify(state.settings.holidayRegionRules)}|${state.settings.startBalanceMinutes}|${state.settings.freeChristmasEve}|${state.settings.freeNewYearsEve}`;
if(calculationCache?.signature===signature)return calculationCache;
let balance=Number(state.settings.startBalanceMinutes)||0;const balances={},metrics={};
for(const k of dateRange(TRACKING_START_DATE,cutoff)){const d=dayObject(k),m=metricForDay(d,cutoff);balance+=m.diff;balances[k]=balance;metrics[k]=m}
calculationCache={signature,cutoff,balances,metrics,closing:balance};return calculationCache;
}
function balanceThrough(k){const start=Number(state.settings.startBalanceMinutes)||0;if(k<TRACKING_START_DATE)return start;const l=ledger();if(k>=l.cutoff)return l.closing;return Object.prototype.hasOwnProperty.call(l.balances,k)?l.balances[k]:start}
function balanceBefore(k){const d=parseDateKey(k);d.setDate(d.getDate()-1);return balanceThrough(dateKey(d))}
function dayStatus(d){
const entries=d?.entries||[],code=dayAbsenceCode(d);if(code&&entries.length)return absenceDuration(d)==='half'?'Halbe Abwesenheit + Arbeitszeit':'Abwesenheit + Arbeitszeit';if(code)return'Abwesenheit erfasst';
if(!entries.length)return'Keine Buchung';if(entries[0]?.type==='out')return'Kommen fehlt';
for(let i=0;i<entries.length;i++){const expected=i%2===0?'in':'out';if(entries[i]?.type!==expected)return expected==='in'?'Kommen fehlt':'Gehen fehlt'}
const c=calculateDay(d);if(!c.plausible)return'Unvollständig';if(entries.at(-1)?.type==='in')return'Gehen fehlt';return c.complete?'Vollständig':'Unvollständig';
}
function entrySource(d,e){if(e?.source==='capture')return 'Erfassung';if(e?.source==='manual')return 'Manuell';if(d.edited||e?.edited)return 'Nachträglich geändert';if(d.sourceYear&&!d.capturedAfterImport)return `Import ${d.sourceYear}`;return 'Erfassung'}
function clearPendingUndo(){
if(!pendingUndo)return;
clearTimeout(pendingUndo.timer);pendingUndo=null;
}
function hideToast(){const t=$('toast');if(!t)return;t.classList.remove('show');t.replaceChildren()}
function showToast(msg){
clearPendingUndo();const t=$('toast');t.replaceChildren();const span=document.createElement('span');span.textContent=msg;t.appendChild(span);t.classList.add('show');clearTimeout(showToast.timer);showToast.timer=setTimeout(hideToast,2300)
}
function showUndoToast(message,undo){
clearPendingUndo();const t=$('toast');t.replaceChildren();const span=document.createElement('span');span.textContent=message;const button=document.createElement('button');button.type='button';button.textContent='Rückgängig';button.addEventListener('click',()=>{const action=pendingUndo?.undo;clearPendingUndo();hideToast();if(action)action()});t.append(span,button);t.classList.add('show');clearTimeout(showToast.timer);const timer=setTimeout(()=>{pendingUndo=null;hideToast()},5200);pendingUndo={undo,timer};
}
function updateDayQuickButton(){
const button=$('timesQuickAddBtn');if(!button)return;
const visible=$('times').classList.contains('active')&&currentView==='day'&&!document.body.classList.contains('modal-open');
button.hidden=!visible;
}
function showScreen(id){
document.body.classList.toggle('today-fixed',id==='today');
document.querySelectorAll('.screen').forEach(screen=>screen.classList.toggle('active',screen.id===id));
document.querySelectorAll('.tabbar button').forEach(button=>button.classList.toggle('active',button.dataset.screen===id));
if(id==='today')renderToday();
if(id==='times'){
currentView='day';monthDrill=null;cursorDate=parseDateKey(state.settings.lastEditedDay||todayKey());
document.querySelectorAll('[data-view]').forEach(button=>button.classList.toggle('active',button.dataset.view==='day'));
renderTimes();
}
if(id==='reports')renderReports();
if(id==='settings')renderSettings();
updateDayQuickButton();
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
:'<svg class="icon" viewBox="0 0 32 32"><path class="door" d="M9 5.5h10v21H9"/><path d="M13 16h14M21.5 10.5 27 16l-5.5 5.5"/></svg>';
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
const entries=d?.entries||[],validation=validateEntries(entries);let gross=0;
const paired=entries.length-(entries.length%2);if(validation.logged)for(let i=0;i+1<paired;i+=2)gross+=validation.logged[i+1]-validation.logged[i];
const last=entries.at(-1);if(last?.type==='in'&&isClock(last.logged||last.actual)){const from=minutes(last.logged||last.actual),to=now.getHours()*60+now.getMinutes();if(to>=from)gross+=to-from}
return Math.max(0,gross);
}
function countdownSnapshot(d,now=new Date()){
const target=targetMinutesForDate(d?.date||todayKey(),d),requiredWork=target,gross=liveGrossMinutes(d,now),manualPause=Math.max(0,Number(d?.pauseMinutes)||0),workedNet=Math.max(0,gross-manualPause),breakBasis=Math.max(requiredWork,workedNet),requiredBreak=minimumBreakMinutes(breakBasis),pauseRemaining=Math.max(0,requiredBreak-manualPause),remainingWork=Math.max(0,requiredWork-workedNet),achieved=requiredWork>0&&remainingWork===0&&pauseRemaining===0,entries=d?.entries||[],active=entries.at(-1)?.type==='in';
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
const d=dayObject(todayKey()),target=targetMinutesForDate(todayKey(),d);
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
const todayComment=$('todayCommentRow'),todayNote=normalizeNoteText(d.note);if(todayComment){todayComment.hidden=!todayNote;$('todayCommentPreview').textContent=notePreview(todayNote,112)}
banner.hidden=!d.absence;document.querySelector('.punch-grid').classList.toggle('absence-full',full);
if(d.absence){
$('todayAbsenceTitle').textContent=half?`Heute: ${d.absence} (halber Tag)`:`Heute ist ${d.absence} eingetragen`;
$('todayAbsenceText').textContent=half?`Die Sollzeit ist auf ${formatDuration(targetMinutesForDate(d.date,d),{signed:false})} Stunden reduziert; Arbeitszeitbuchungen bleiben möglich.`:`Die Sollzeit beträgt heute ${formatDuration(targetMinutesForDate(d.date,d),{signed:false})} Stunden.`;
}
renderPastWorkdayNotice();
renderTodayCapture(d);
updateCountdown();
}
function liveTodayBalanceMinutes(d,now=new Date()){const target=targetMinutesForDate(d?.date||todayKey(),d),worked=Math.max(0,liveGrossMinutes(d,now)-(Number(d?.pauseMinutes)||0));return worked-target}
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
let bookingAudioContext=null;
function playBookingSound(type){
if(!state.settings.bookingSoundEnabled)return;
try{
const AudioCtx=window.AudioContext||window.webkitAudioContext;if(!AudioCtx)return;
const c=bookingAudioContext||(bookingAudioContext=new AudioCtx());
if(c.state==='suspended')c.resume();
const now=c.currentTime;
const beep=(freq,startOffset,duration,wave='sine',volume=.12)=>{
const start=now+startOffset,osc=c.createOscillator(),gain=c.createGain();
osc.type=wave;osc.frequency.setValueAtTime(freq,start);
gain.gain.setValueAtTime(.0001,start);
gain.gain.exponentialRampToValueAtTime(volume,start+.004);
gain.gain.setValueAtTime(volume,start+duration*.42);
gain.gain.exponentialRampToValueAtTime(.0001,start+duration);
osc.connect(gain).connect(c.destination);osc.start(start);osc.stop(start+duration+.01);
};
if(type==='in'){
beep(760,0,.075,'sine',.13);beep(980,.07,.07,'sine',.11);
}else{
beep(680,0,.075,'triangle',.12);beep(500,.065,.08,'sine',.12);
}
}catch(e){console.warn('Buchungston konnte nicht wiedergegeben werden.',e)}
}
function performPunch(type){
const k=todayKey(),d=dayObject(k,true),availability=punchAvailability(d,type,hm());
if(type!==availability.expected||!availability.allowed){renderToday();showToast(availability.availableAt&&availability.availableAt!=='morgen'?`${type==='in'?'Kommen':'Gehen'} möglich ab ${availability.availableAt}`:'Nächste Buchung erst morgen möglich');return}
const actual=hm(),logged=availability.loggedText;
d.entries.push({type,actual,logged,source:'capture',createdAt:new Date().toISOString()});d.capturedAfterImport=true;d.modifiedAt=new Date().toISOString();d.archived=false;state.days[k]=d;touchDay(k);renderToday();
try{navigator.vibrate?.(28)}catch(e){}
playBookingSound(type);
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
function setTimesView(v){currentView=v;monthDrill=null;document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===v));renderTimes();updateDayQuickButton()}
function updateTimesWeekendControl(visible,disabled=false){const wrap=$('timesHeaderWeekend'),toggle=$('headerWeekendToggle');if(!wrap||!toggle)return;wrap.classList.toggle('is-hidden',!visible);toggle.checked=!!state.settings.showWeekends;toggle.disabled=!!disabled;wrap.title=disabled?'Wochenende wird angezeigt, weil dort Daten vorhanden sind.':''}
function renderTimes(){if(currentView==='day')renderDayView(dateKey(cursorDate));else if(currentView==='week')renderWeekView(dateKey(cursorDate));else if(currentView==='month'){updateTimesWeekendControl(false);renderMonthOverview()}else{updateTimesWeekendControl(false);renderYearOverview()}updateDayQuickButton()}
function renderDayView(k){
const today=todayKey();if(k>today)k=today;
cursorDate=parseDateKey(k);const d=dayObject(k),c=calculateDay(d),status=dayStatus(d),entries=d.entries||[];
const statusClass=status==='Vollständig'||status==='Abwesenheit erfasst'?'success':['Gehen fehlt','Kommen fehlt','Unvollständig'].includes(status)?'warning':'';
const source=d.edited?'Nachträglich geändert':d.capturedAfterImport?'Lokale Erfassung':d.sourceYear?`Importierte Daten aus ${d.sourceYear}`:'Lokale Erfassung';
const rows=entries.length?entries.map((entry,index)=>`<tr><td>${index+1}</td><td>${entry.type==='in'?'Kommen':'Gehen'}</td><td class="num">${esc(entry.actual||'–')}</td><td class="num">${esc(entry.logged||'–')}</td><td><span class="booking-source">${esc(entrySource(d,entry))}</span></td></tr>`).join(''):`<tr><td colspan="5" class="empty">Für diesen Tag sind noch keine Zeiten erfasst.</td></tr>`;
let inNo=0,outNo=0;
const mobileRows=entries.length?`<div class="booking-compact-head"><span></span><span>Tatsächlich</span><span>Dokumentiert</span><span></span></div>${entries.map((entry,index)=>{const no=entry.type==='in'?++inNo:++outNo,label=entry.type==='in'?`Kommen ${no}`:`Gehen ${no}`;return `<div class="booking-compact-row ${entry.type}"><div class="booking-compact-label"><span class="booking-type-icon">${entry.type==='in'?SVG.in:SVG.out}</span><span><b>${label}</b><small>${esc(entrySource(d,entry))}</small></span></div><b class="booking-compact-time">${esc(entry.actual||'–')}</b><b class="booking-compact-time">${esc(entry.logged||'–')}</b><button type="button" class="edit-icon-btn" onclick="openSingleEntryEditor('${k}',${index})" aria-label="${label} bearbeiten">${SVG.edit}</button></div>`}).join('')}`:`<div class="empty-day-state"><b>Für diesen Tag sind noch keine Zeiten erfasst.</b><span>Nutze den Plus-Button oder eine der direkten Aktionen.</span><div><button type="button" onclick="openTimeAction('${k}')">Zeit ergänzen</button><button type="button" onclick="openAbsenceTypePicker('${k}')">Abwesenheit eintragen</button></div></div>`;
const groupCount=d.absenceGroupId?absenceGroupDays(d.absenceGroupId).length:1;
const reviewIssue=workdayIssueForDate(k,{includeReviewed:true});
const reviewCard=d.workdayIssueReview&&reviewIssue?.reviewed?`<div class="card reviewed-day-card"><b>Geprüft – Minusstunden sind korrekt</b><span>Der Kontrollhinweis wurde am ${esc(new Intl.DateTimeFormat('de-DE',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(d.workdayIssueReview.reviewedAt)))} bestätigt.</span></div>`:'';
const absenceCard=d.absence?`<div class="card detail-list absence-detail-card"><div class="detail-row"><span>Abwesenheit</span><b>${esc(d.absence)}</b></div><div class="detail-row"><span>Umfang</span><b>${absenceDuration(d)==='half'?'Halber Tag':'Ganzer Tag'}</b></div><div class="detail-row"><span>Sollzeit an diesem Tag</span><b class="absence-credit">${formatDuration(targetMinutesForDate(d.date,d),{signed:false})}</b></div><div class="detail-row"><span>Notiz</span><div class="value">${esc(d.absenceNote||'–')}</div></div><div class="absence-actions-inline"><button type="button" onclick="openAbsenceEditorForDay('${k}','day')">Diesen Tag bearbeiten</button>${groupCount>1?`<button type="button" onclick="openAbsenceEditorForDay('${k}','group')">Zeitraum bearbeiten</button>`:''}<button type="button" class="danger" onclick="deleteAbsenceForDay('${k}','day')">Diesen Tag löschen</button>${groupCount>1?`<button type="button" class="danger" onclick="deleteAbsenceForDay('${k}','group')">Zeitraum löschen</button>`:''}</div></div>`:'';
const diffClass=c.diff<0?'red':c.diff>0?'green':'neutral';
const balance=balanceThrough(k),balanceClass=balance<0?'red':balance>0?'green':'neutral';
$('timesContent').innerHTML=`
<div class="date-nav date-nav-prominent day-date-nav"><button type="button" onclick="changeDay(-1)" aria-label="Vorheriger Tag">‹</button><label class="day-date-center" for="dayPicker"><span class="day-date-label">${formatDate(k,{weekday:'short',day:'2-digit',month:'2-digit',year:'numeric'})}${k===today?'<small>Heute</small>':''}</span><input type="date" id="dayPicker" value="${k}" max="${today}" aria-label="Datum auswählen"></label><button type="button" onclick="changeDay(1)" aria-label="Nächster Tag" ${k===today?'disabled':''}>›</button></div>
<div class="card day-summary compact-day-summary">
<div class="day-summary-top"><div class="day-meta">${esc(source)}</div><span class="badge ${statusClass}">${esc(status)}</span></div>
<div class="balance-hero"><span>Tagessaldo</span><strong class="${diffClass}">${formatDuration(c.diff)}</strong></div>
<div class="metric-grid"><div class="metric"><span>Brutto</span><b>${formatDuration(c.gross,{signed:false})}</b></div><div class="metric"><span>Netto</span><b>${formatDuration(c.net,{signed:false})}</b></div><div class="metric"><span>Soll</span><b>${formatDuration(c.target,{signed:false})}</b></div><div class="metric metric-balance"><span>Zeitkonto</span><b class="${balanceClass}">${formatDuration(balance)}</b></div></div>
</div>
${absenceCard}
${reviewCard}
<div class="card booking-card compact-booking-card"><h3 class="booking-section-title">Buchungen</h3><div class="booking-table-wrap table-scroll"><table class="booking-table"><thead><tr><th>Nr.</th><th>Art</th><th class="num">Tatsächlich</th><th class="num">Dokumentiert</th><th>Herkunft</th></tr></thead><tbody>${rows}</tbody></table></div><div class="booking-mobile-list">${mobileRows}</div></div>
<div class="card day-additional" role="button" tabindex="0" onclick="openDayEditor('${k}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openDayEditor('${k}')}" aria-label="Zusätzliche Angaben bearbeiten">
<h3>Zusätzliche Angaben</h3>
<div class="additional-row"><span class="additional-icon pause">${SVG.pause}</span><b>Manuelle Pause</b><span class="additional-value">${Number(d.pauseMinutes)||0} Min.</span></div>
${normalizeNoteText(d.note)?`<button type="button" class="additional-row additional-row-button" onclick="event.stopPropagation();openCommentEditor('${k}','direct')" aria-label="Kommentar anzeigen und bearbeiten"><span class="additional-icon note">${SVG.note||SVG.edit}</span><b>Kommentar</b><span class="additional-value comment">${esc(notePreview(d.note,92))}</span></button>`:''}
</div>`;
$('dayPicker').addEventListener('change',event=>{const selected=event.target.value>today?today:event.target.value;cursorDate=parseDateKey(selected);renderDayView(selected)});
updateTimesWeekendControl(true);updateDayQuickButton();
}
function goToToday(){cursorDate=parseDateKey(todayKey());currentView='day';document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view==='day'));renderDayView(todayKey())}
function changeDay(n){
const today=todayKey();if(n>0&&dateKey(cursorDate)>=today)return;
do{cursorDate.setDate(cursorDate.getDate()+n)}while(!state.settings.showWeekends&&[0,6].includes(cursorDate.getDay())&&!hasMeaningfulData(state.days[dateKey(cursorDate)]));
if(dateKey(cursorDate)>today)cursorDate=parseDateKey(today);
renderDayView(dateKey(cursorDate));
}
function weekStart(k){const d=parseDateKey(k),day=d.getDay()||7;d.setDate(d.getDate()-day+1);return d}
function weekHasWeekendData(start){for(let i=5;i<7;i++){const d=new Date(start);d.setDate(start.getDate()+i);if(hasMeaningfulData(dayObject(dateKey(d))))return true}return false}
function renderWeekView(k){
const currentStart=weekStart(todayKey());let start=weekStart(k);if(start>currentStart)start=currentStart;cursorDate=new Date(start);
const force=weekHasWeekendData(start),show=state.settings.showWeekends||force,count=show?7:5,days=[],isCurrent=dateKey(start)===dateKey(currentStart);
for(let i=0;i<count;i++){const dt=new Date(start);dt.setDate(start.getDate()+i);const key=dateKey(dt),d=dayObject(key),c=calculateDay(d),future=key>todayKey();days.push(`<button type="button" class="week-day-card${future?' future-day':''}" ${future?'disabled':''} onclick="currentView='day';document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view==='day'));renderDayView('${key}')"><span><b>${formatDate(key,{weekday:'short',day:'2-digit',month:'2-digit'})}</b><small>${future?'Noch nicht verfügbar':esc(dayStatus(d))}</small></span><strong class="${future?'neutral':c.diff<0?'red':c.diff>0?'green':'neutral'}">${future?'–':formatDuration(c.diff)}</strong></button>`)}
const end=new Date(start);end.setDate(start.getDate()+6);
$('timesContent').innerHTML=`<div class="week-toolbar"><button type="button" onclick="changeWeek(-1)" aria-label="Vorherige Woche">‹</button><b>${formatDate(dateKey(start),{day:'2-digit',month:'2-digit'})} – ${formatDate(dateKey(end),{day:'2-digit',month:'2-digit',year:'numeric'})}</b><button type="button" onclick="changeWeek(1)" aria-label="Nächste Woche" ${isCurrent?'disabled':''}>›</button></div><div class="week-options week-options-today-only">${isCurrent?'':`<button type="button" class="today-week-btn" onclick="cursorDate=parseDateKey(todayKey());renderWeekView(todayKey())">Aktuelle Woche</button>`}</div>${force?'<p class="weekend-note">Wochenende wird angezeigt, weil dort Daten vorhanden sind.</p>':''}<div class="week-list">${days.join('')}</div>`;
updateTimesWeekendControl(true,force);
}
function changeWeek(n){const currentStart=weekStart(todayKey()),base=weekStart(dateKey(cursorDate));if(n>0&&base>=currentStart)return;base.setDate(base.getDate()+n*7);if(base>currentStart)base=currentStart;cursorDate=base;renderWeekView(dateKey(base))}
function periodDays(start,end){return calendarRecords(start,end)}
function monthSummary(y,m){
const key=`${y}-${pad(m+1)}`,calendarStart=`${key}-01`,calendarEnd=dateKey(new Date(y,m+1,0,12)),today=todayKey(),cutoff=endMin(calendarEnd,today),start=calendarStart<TRACKING_START_DATE?TRACKING_START_DATE:calendarStart,sum=emptyMetric();
if(cutoff>=start)for(const k of dateRange(start,cutoff))addMetric(sum,metricForDay(dayObject(k),todayKey()));
sum.days=cutoff>=start?calendarRecords(start,cutoff):[];sum.opening=balanceBefore(calendarStart);sum.closing=sum.opening+sum.diff;sum.cutoff=cutoff;sum.calendarEnd=calendarEnd;return sum;
}
function endMin(a,b){return a<b?a:b}
function yearSummary(y){
const sum={...emptyMetric(),days:[]},monthly=[],firstMonth=y===Number(TRACKING_START_DATE.slice(0,4))?Number(TRACKING_START_DATE.slice(5,7))-1:0,maxMonth=y===Number(todayKey().slice(0,4))?Number(todayKey().slice(5,7))-1:11;
for(let m=firstMonth;m<=maxMonth;m++){const ms=monthSummary(y,m);monthly.push(ms);addMetric(sum,ms);sum.days.push(...ms.days)}
sum.opening=balanceBefore(`${y}-01-01`);sum.closing=sum.opening+sum.diff;sum.cutoff=monthly.at(-1)?.cutoff||`${y}-01-01`;sum.months=monthly;return sum;
}
function periodSummary(start,end){
if(/^\d{4}-\d{2}-01$/.test(start)&&end===dateKey(new Date(Number(start.slice(0,4)),Number(start.slice(5,7)),0,12)))return monthSummary(Number(start.slice(0,4)),Number(start.slice(5,7))-1);
if(start.endsWith('-01-01')&&end.endsWith('-12-31')&&start.slice(0,4)===end.slice(0,4))return yearSummary(Number(start.slice(0,4)));
const cutoff=endMin(end,todayKey()),actualStart=start<TRACKING_START_DATE?TRACKING_START_DATE:start,sum=emptyMetric(),days=cutoff>=actualStart?calendarRecords(actualStart,cutoff):[];if(cutoff>=actualStart)for(const k of dateRange(actualStart,cutoff))addMetric(sum,metricForDay(dayObject(k),todayKey()));sum.days=days;sum.opening=balanceBefore(start);sum.closing=sum.opening+sum.diff;sum.cutoff=cutoff;return sum;
}
function earliestYear(){return Number(TRACKING_START_DATE.slice(0,4))}
function renderMonthOverview(){
const now=new Date(),items=[];
for(let y=now.getFullYear();y>=earliestYear();y--){const maxM=y===now.getFullYear()?now.getMonth():11,minM=y===Number(TRACKING_START_DATE.slice(0,4))?Number(TRACKING_START_DATE.slice(5,7))-1:0;for(let m=maxM;m>=minM;m--)items.push({y,m})}
$('timesContent').innerHTML=`<div class="period-list">${items.map(({y,m})=>{const s=monthSummary(y,m),name=new Intl.DateTimeFormat('de-DE',{month:'long',year:'numeric'}).format(new Date(y,m,1)),running=s.cutoff<s.calendarEnd;return `<article class="period-card"><button type="button" onclick="openMonthDetail(${y},${m})"><div class="period-top"><div><h3>${esc(name)}</h3><div class="muted" style="font-size:12px;margin-top:3px">${running?'Stichtag '+formatDate(s.cutoff,{day:'2-digit',month:'2-digit',year:'numeric'}):'Abgeschlossener Monat'}</div></div><div class="period-balance"><span>Monatsdifferenz</span><strong class="${s.diff<0?'red':'green'}">${formatDuration(s.diff)}</strong></div></div><div class="metric-lines"><div class="metric-line"><span>Übertrag aus Vormonat</span><b>${formatDuration(s.opening)}</b></div><div class="metric-line"><span>${running?'Zeitkonto zum Stichtag':'Zeitkonto Monatsende'}</span><b class="${s.closing<0?'red':'green'}">${formatDuration(s.closing)}</b></div><div class="metric-line"><span>Soll / Netto / Pause</span><b>${formatDuration(s.target,{signed:false})} / ${formatDuration(s.net,{signed:false})} / ${formatDuration(s.pause,{signed:false})}</b></div><div class="metric-line"><span>Urlaub / Krankheit / Zeitausgleich / Sonstige</span><b>${formatDayCount(s.vacation)} / ${formatDayCount(s.sick)} / ${formatDayCount(s.timeOff||0)} / ${formatDayCount(s.other)}</b></div><div class="metric-line"><span>Unvollständige Tage</span><b>${s.incomplete}</b></div></div></button></article>`}).join('')}</div>`;
}
function openMonthDetail(y,m){currentView='month';document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view==='month'));monthDrill={y,m};const start=`${y}-${pad(m+1)}-01`,end=dateKey(new Date(y,m+1,0,12)),s=monthSummary(y,m),name=new Intl.DateTimeFormat('de-DE',{month:'long',year:'numeric'}).format(new Date(y,m,1)),running=s.cutoff<s.calendarEnd;
const rows=s.days.length?s.days.map(d=>{const c=calculateDay(d),first=(d.entries||[]).find(e=>e.type==='in'),last=[...(d.entries||[])].reverse().find(e=>e.type==='out');return `<tr><td class="date-cell">${formatDate(d.date,{day:'2-digit',month:'2-digit',year:'numeric'})}</td><td>${esc(dayStatus(d))}</td><td class="num">${esc(first?.logged||'–')}</td><td class="num">${esc(last?.logged||'–')}</td><td class="num">${Number(d.pauseMinutes)||0}</td><td class="num">${formatDuration(c.net,{signed:false})}</td><td class="num ${c.diff<0?'red':'green'}">${formatDuration(c.diff)}</td><td class="num">${formatDuration(balanceThrough(d.date))}</td><td class="action-cell"><button type="button" class="edit-icon-btn" onclick="openDayEditor('${d.date}')" aria-label="${d.date} bearbeiten">${SVG.edit}</button></td></tr>`}).join(''):`<tr><td colspan="9" class="empty">Keine relevanten Tagesdaten</td></tr>`;
$('timesContent').innerHTML=`<div class="back-row"><button type="button" onclick="renderMonthOverview()">‹ Alle Monate</button><b>${esc(name)}</b></div><div class="month-detail-summary"><div class="card balance-hero"><span>Monatsdifferenz</span><strong class="${s.diff<0?'red':'green'}">${formatDuration(s.diff)}</strong></div><div class="card balance-hero"><span>${running?'Zeitkonto zum Stichtag':'Zeitkonto Monatsende'}</span><strong class="${s.closing<0?'red':'green'}">${formatDuration(s.closing)}</strong></div></div><div class="table-scroll"><table class="mobile-table"><thead><tr><th class="date-cell">Datum</th><th>Status</th><th class="num">Kommen</th><th class="num">Gehen</th><th class="num">Pause</th><th class="num">Netto</th><th class="num">Diff.</th><th class="num">Zeitkonto</th><th class="action-cell">Aktion</th></tr></thead><tbody>${rows}</tbody></table></div><button type="button" class="secondary-btn" onclick="monthReport(${y},${m})">Monatsbericht öffnen</button>`;
}
function renderYearOverview(){
const now=new Date(),years=[];for(let y=now.getFullYear();y>=earliestYear();y--)years.push(y);
$('timesContent').innerHTML=`<div class="period-list">${years.map(y=>{const s=yearSummary(y),imported=y<now.getFullYear()?'Geprüftes / archiviertes Jahr':'Aktueller Stand';return `<article class="period-card"><button type="button" onclick="openYearDetail(${y})"><div class="period-top"><div><h3>${y}</h3><div class="muted" style="font-size:12px;margin-top:3px">${imported}</div></div><div class="period-balance"><span>Jahresveränderung</span><strong class="${s.diff<0?'red':'green'}">${formatDuration(s.diff)}</strong></div></div><div class="metric-lines"><div class="metric-line"><span>Übertrag aus dem Vorjahr</span><b>${formatDuration(s.opening)}</b></div><div class="metric-line"><span>Zeitkonto ${y===now.getFullYear()?'zum Stichtag':'Jahresende'}</span><b class="${s.closing<0?'red':'green'}">${formatDuration(s.closing)}</b></div><div class="metric-line"><span>Soll / Netto / Pause</span><b>${formatDuration(s.target,{signed:false})} / ${formatDuration(s.net,{signed:false})} / ${formatDuration(s.pause,{signed:false})}</b></div><div class="metric-line"><span>Urlaub / Krankheit / Zeitausgleich / Sonstige</span><b>${formatDayCount(s.vacation)} / ${formatDayCount(s.sick)} / ${formatDayCount(s.timeOff||0)} / ${formatDayCount(s.other)}</b></div></div></button></article>`}).join('')}</div>`;
}
function openYearDetail(y){
const cards=[];for(let m=11;m>=0;m--){if(y===new Date().getFullYear()&&m>new Date().getMonth())continue;const s=monthSummary(y,m),running=s.cutoff<s.calendarEnd;cards.push(`<article class="period-card"><button type="button" onclick="openMonthDetail(${y},${m})"><div class="period-top"><h3>${new Intl.DateTimeFormat('de-DE',{month:'long'}).format(new Date(y,m,1))}</h3><div class="period-balance"><span>Monatsdifferenz</span><strong class="${s.diff<0?'red':'green'}">${formatDuration(s.diff)}</strong></div></div><div class="metric-lines"><div class="metric-line"><span>${running?'Zeitkonto zum Stichtag':'Zeitkonto Monatsende'}</span><b>${formatDuration(s.closing)}</b></div><div class="metric-line"><span>Netto / Soll</span><b>${formatDuration(s.net,{signed:false})} / ${formatDuration(s.target,{signed:false})}</b></div></div></button></article>`)}
$('timesContent').innerHTML=`<div class="back-row"><button type="button" onclick="renderYearOverview()">‹ Alle Jahre</button><b>${y}</b></div><div class="period-list">${cards.join('')}</div><button type="button" class="secondary-btn" onclick="yearReport(${y})">Jahresbericht öffnen</button>`;
}
let singleEntryDate=null,singleEntryIndex=-1;
function openSingleEntryEditor(k,index){
const d=dayObject(k),entry=(d.entries||[])[index];if(!entry)return;
singleEntryDate=k;singleEntryIndex=index;$('singleEntryType').value=entry.type;$('singleEntryActual').value=entry.actual||'';$('singleEntryLogged').value=entry.logged||'';$('entryModalTitle').textContent=`${entry.type==='in'?'Kommen':'Gehen'} bearbeiten`;$('entryContextDate').textContent=`${entry.type==='in'?'Kommen':'Gehen'} für ${formatContextDate(k)}`;openModal('entryModal');
}
function saveSingleEntry(){
if(singleEntryDate===null||singleEntryIndex<0)return;
const actual=$('singleEntryActual').value,logged=$('singleEntryLogged').value,type=$('singleEntryType').value;
if(!isClock(actual)||!isClock(logged)){alert('Bitte beide Uhrzeiten vollständig eingeben.');return}
if(singleEntryDate===todayKey()&&minutes(actual)>minutes(hm())){alert('Zukünftige Arbeitszeitbuchungen sind nicht zulässig.');return}
const d=clone(dayObject(singleEntryDate,true)),entries=clone(d.entries||[]),old=entries[singleEntryIndex];if(!old)return;
entries[singleEntryIndex]={...old,type,actual,logged,source:'manual',edited:true};
const validation=validateEntries(entries);if(!validation.plausible){alert('Die Buchung kann nicht gespeichert werden. Kommen und Gehen müssen sich abwechseln; jede dokumentierte Uhrzeit muss mindestens fünf Minuten nach der vorherigen liegen.');return}
d.entries=entries;d.edited=true;d.modifiedAt=new Date().toISOString();state.days[singleEntryDate]=d;touchDay(singleEntryDate);closeModal('entryModal');refreshAllDerivedViews();showToast(`${type==='in'?'Kommen':'Gehen'} gespeichert. Tagessaldo und Zeitkonto wurden aktualisiert.`);
}
function restoreDeletedEntry(date,index,entry){
const d=clone(dayObject(date,true)),entries=clone(d.entries||[]);entries.splice(Math.min(index,entries.length),0,clone(entry));const validation=validateEntries(entries);
if(!validation.plausible){alert('Die Buchung konnte nicht wiederhergestellt werden, weil sich der Tag inzwischen geändert hat.');return}
d.entries=entries;d.edited=true;d.modifiedAt=new Date().toISOString();state.days[date]=d;touchDay(date);refreshAllDerivedViews();showToast(`${entry.type==='in'?'Kommen':'Gehen'} ${entry.logged||entry.actual} wiederhergestellt.`);
}
function deleteSingleEntry(){
if(singleEntryDate===null||singleEntryIndex<0)return;
const date=singleEntryDate,index=singleEntryIndex,d=clone(dayObject(date,true)),entry=(d.entries||[])[index];if(!entry)return;
d.entries.splice(index,1);d.edited=true;d.importCleared=!!IMPORTED_BY_DATE[date];d.modifiedAt=new Date().toISOString();state.days[date]=d;touchDay(date);closeModal('entryModal');refreshAllDerivedViews();const label=entry.type==='in'?'Kommen':'Gehen',time=entry.logged||entry.actual||'';showUndoToast(`${label} ${time} gelöscht.`,()=>restoreDeletedEntry(date,index,entry));
}
function openFullDayFromSingleEntry(){const k=singleEntryDate;if(k)runAfterDirtyCheck('entryModal',()=>openFullDayForDate(k))}
function dayEditorEntryLabel(index){
const entry=editingEntries[index]||{},type=entry.type==='out'?'out':'in';let no=0;for(let i=0;i<=index;i++)if((editingEntries[i]?.type==='out'?'out':'in')===type)no++;return type==='in'?`Kommen ${no}`:`Gehen ${no}`;
}
function dayEditorEntrySummary(entry){return `<span>Tatsächlich ${esc(entry?.actual||'–')}</span><span>Dok. ${esc(entry?.logged||'–')}</span>`}
function updateDayNoteSummary(){const summary=$('dayNoteSummary');if(!summary)return;const note=normalizeNoteText($('editNote').value);summary.textContent=note?notePreview(note,92):'Kein Kommentar'}
function openCommentEditor(date,mode='direct'){
const fromDayEditor=mode==='dayEditor',source=fromDayEditor&&$('dayModal').classList.contains('open')&&$('editDate').value===date?$('editNote').value:(dayObject(date).note||'');
commentEditorContext={date,mode:fromDayEditor?'dayEditor':'direct'};if($('quickAddModal').classList.contains('open'))closeModal('quickAddModal');$('commentModalTitle').textContent='Kommentar bearbeiten';$('commentContext').textContent=`Kommentar für ${formatContextDate(date)}`;$('commentText').value=source;openModal('commentModal');setTimeout(()=>$('commentText').focus(),80)
}
function cancelCommentEditor(){commentEditorContext=null;closeModal('commentModal')}
function applyCommentEditor(){
const context=commentEditorContext;if(!context)return;const note=$('commentText').value.trim();
if(context.mode==='dayEditor'&&$('dayModal').classList.contains('open')&&$('editDate').value===context.date){$('editNote').value=note;updateDayNoteSummary();commentEditorContext=null;closeModal('commentModal');return}
const existing=dayObject(context.date),before=String(existing.note||'');if(before===note){commentEditorContext=null;closeModal('commentModal');return}
const d=clone(dayObject(context.date,true));d.note=note;d.edited=true;d.modifiedAt=new Date().toISOString();d.archived=Number(context.date.slice(0,4))<new Date().getFullYear();state.days[context.date]=d;touchDay(context.date);commentEditorContext=null;closeModal('commentModal');refreshAllDerivedViews();showToast(note?'Kommentar gespeichert':'Kommentar entfernt')
}
function updateDayEditorAddButton(){const button=$('addEntryBtn');if(!button)return;const type=!editingEntries.length||editingEntries.at(-1)?.type==='out'?'in':'out';button.textContent=type==='in'?(editingEntries.length?'Weiteres Kommen':'Kommen ergänzen'):'Gehen ergänzen'}
function updateDayEditorEntrySummary(index){
const entry=editingEntries[index],card=document.querySelector(`[data-entry-card="${index}"]`);if(!entry||!card)return;const label=card.querySelector('[data-entry-label]'),summary=card.querySelector('[data-entry-summary]');if(label)label.textContent=dayEditorEntryLabel(index);if(summary)summary.innerHTML=dayEditorEntrySummary(entry)
}
function toggleDayEntryEditor(index){
expandedDayEntryIndex=expandedDayEntryIndex===index?-1:index;document.querySelectorAll('[data-entry-card]').forEach(card=>{const open=Number(card.dataset.entryCard)===expandedDayEntryIndex;card.classList.toggle('is-open',open);const toggle=card.querySelector('[data-entry-toggle]'),details=card.querySelector('.entry-edit-details');if(toggle)toggle.setAttribute('aria-expanded',String(open));if(details)details.hidden=!open})
}
function removeEditingEntry(index){
const removed=clone(editingEntries[index]);if(!removed)return;editingEntries.splice(index,1);expandedDayEntryIndex=editingEntries.length?Math.min(index,editingEntries.length-1):-1;renderEntryEditors();const label=removed.type==='in'?'Kommen':'Gehen',time=removed.logged||removed.actual||'';showUndoToast(`${label}${time?` ${time}`:''} entfernt.`,()=>{editingEntries.splice(Math.min(index,editingEntries.length),0,removed);expandedDayEntryIndex=Math.min(index,editingEntries.length-1);renderEntryEditors()})
}
function openDayEditor(k){
const d=dayObject(k),hasDeletable=(d.entries||[]).length||Number(d.pauseMinutes),hasImport=!!IMPORTED_BY_DATE[k];$('dayModalTitle').textContent='Tag bearbeiten';$('dayModalContext').textContent=formatContextDate(k);editingEntries=clone(d.entries||[]);$('editDate').value=k;$('editPause').value=Number(d.pauseMinutes)||0;$('editNote').value=d.note||'';$('advancedActions').open=false;updateDayNoteSummary();$('dayAbsenceEditorSummary').textContent=absenceSummaryText(d);$('manageAbsenceFromDay').textContent=d.absence?'Bearbeiten':'Eintragen';$('restoreImportBtn').hidden=!hasImport;$('deleteDayBtn').disabled=!hasDeletable;$('advancedActionsHint').textContent=!hasDeletable&&!hasImport?'Für diesen Tag sind keine löschbaren Buchungen, Pausen oder Importdaten vorhanden.':!hasDeletable?'Keine Buchungen oder Pausen zum Löschen vorhanden.':'';expandedDayEntryIndex=editingEntries.length<=1?(editingEntries.length?0:-1):(editingEntries.at(-1)?.type==='in'?editingEntries.length-1:-1);renderEntryEditors();openModal('dayModal')
}
function renderEntryEditors(){
const scroll=$('dayModal')?.querySelector('.day-editor-scroll'),scrollTop=scroll?.scrollTop||0;let inNo=0,outNo=0;
$('entryEditors').innerHTML=editingEntries.length?`<div class="entry-editor entry-card-list">${editingEntries.map((e,i)=>{const no=e.type==='in'?++inNo:++outNo,label=e.type==='in'?`Kommen ${no}`:`Gehen ${no}`,open=i===expandedDayEntryIndex;return `<article class="entry-edit-card ${open?'is-open':''}" data-entry-card="${i}"><div class="entry-edit-summary"><button type="button" class="entry-toggle" data-entry-toggle="${i}" aria-expanded="${open}"><span class="entry-summary-icon ${e.type}">${e.type==='in'?SVG.in:SVG.out}</span><span class="entry-summary-copy"><b data-entry-label>${label}</b><small data-entry-summary>${dayEditorEntrySummary(e)}</small></span><span class="entry-expand-icon" aria-hidden="true">›</span></button><button type="button" class="remove-entry" data-remove-entry="${i}" aria-label="${label} löschen"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/></svg></button></div><div class="entry-inline-error" data-entry-error="${i}" hidden></div><div class="entry-edit-details" ${open?'':'hidden'}><div class="field"><label>Buchungsart</label><select data-entry-type="${i}"><option value="in" ${e.type==='in'?'selected':''}>Kommen</option><option value="out" ${e.type==='out'?'selected':''}>Gehen</option></select></div><div class="entry-time-grid"><div class="field"><label>Tatsächliche Uhrzeit</label><div class="time-input-wrap"><input data-entry-actual="${i}" type="time" value="${esc(e.actual||'')}"></div></div><div class="field"><label>Dokumentierte Uhrzeit</label><div class="time-input-wrap"><input data-entry-logged="${i}" type="time" value="${esc(e.logged||'')}"></div></div></div></div></article>`}).join('')}</div>`:'<div class="day-editor-empty">Noch keine Buchungen vorhanden.</div>';
document.querySelectorAll('[data-entry-toggle]').forEach(el=>el.addEventListener('click',()=>toggleDayEntryEditor(Number(el.dataset.entryToggle))));
document.querySelectorAll('[data-entry-type]').forEach(el=>el.addEventListener('change',event=>{const i=Number(event.target.dataset.entryType),entry=editingEntries[i];entry.type=event.target.value;if(entry.actual)entry.logged=roundLogged(entry.actual,entry.type);expandedDayEntryIndex=i;renderEntryEditors()}));
document.querySelectorAll('[data-entry-actual]').forEach(el=>el.addEventListener('input',event=>{const i=Number(event.target.dataset.entryActual),entry=editingEntries[i];entry.actual=event.target.value;entry.logged=entry.actual?roundLogged(entry.actual,entry.type):'';const logged=document.querySelector(`[data-entry-logged="${i}"]`);if(logged)logged.value=entry.logged;updateDayEditorEntrySummary(i);clearDayEditorEntryError(i)}));
document.querySelectorAll('[data-entry-logged]').forEach(el=>el.addEventListener('input',event=>{const i=Number(event.target.dataset.entryLogged);editingEntries[i].logged=event.target.value;updateDayEditorEntrySummary(i);clearDayEditorEntryError(i)}));
document.querySelectorAll('[data-remove-entry]').forEach(el=>el.addEventListener('click',()=>removeEditingEntry(Number(el.dataset.removeEntry))));
updateDayEditorAddButton();if(scroll)requestAnimationFrame(()=>{scroll.scrollTop=scrollTop})
}
function addEditingEntry(){const type=!editingEntries.length||editingEntries.at(-1)?.type==='out'?'in':'out',actual=hm();editingEntries.push({type,actual,logged:roundLogged(actual,type),source:'manual',edited:true});expandedDayEntryIndex=editingEntries.length-1;renderEntryEditors();requestAnimationFrame(()=>document.querySelector(`[data-entry-card="${expandedDayEntryIndex}"]`)?.scrollIntoView({block:'nearest',behavior:'smooth'}))}
function collectDayEditorEntries(){const changedAt=new Date().toISOString();return editingEntries.map((entry,i)=>{const type=document.querySelector(`[data-entry-type="${i}"]`)?.value||entry.type,actual=document.querySelector(`[data-entry-actual="${i}"]`)?.value||'',logged=document.querySelector(`[data-entry-logged="${i}"]`)?.value||'',unchanged=entry.type===type&&String(entry.actual||'')===actual&&String(entry.logged||'')===logged;if(unchanged)return clone(entry);return{...(entry||{}),type,actual,logged,source:'manual',edited:true,editedAt:changedAt}})}
function validateDayEditorEntries(entries,date){
const errors=entries.map(()=>[]);entries.forEach((entry,i)=>{const expected=i%2===0?'in':'out';if(entry.type!==expected)errors[i].push(`Hier wird ${expected==='in'?'Kommen':'Gehen'} erwartet.`);if(!entry.actual||!isClock(entry.actual))errors[i].push('Tatsächliche Uhrzeit fehlt oder ist ungültig.');if(!entry.logged||!isClock(entry.logged))errors[i].push('Dokumentierte Uhrzeit fehlt oder ist ungültig.')});
const actual=normalizedEntryTimeline(entries,'actual'),logged=normalizedEntryTimeline(entries,'logged');if(entries.length&&!actual){const i=Math.max(1,entries.findIndex((_,idx)=>idx>0&&minutes(entries[idx].actual)-minutes(entries[idx-1].actual)<0&&minutes(entries[idx-1].actual)-minutes(entries[idx].actual)<360));errors[i<1?1:i].push('Die tatsächlichen Uhrzeiten überschneiden sich oder liegen in unzulässiger Reihenfolge.')}if(entries.length&&!logged){const i=Math.max(1,entries.findIndex((_,idx)=>idx>0&&minutes(entries[idx].logged)-minutes(entries[idx-1].logged)<5&&minutes(entries[idx-1].logged)-minutes(entries[idx].logged)<360));errors[i<1?1:i].push('Die dokumentierten Uhrzeiten benötigen mindestens fünf Minuten Abstand und eine eindeutige Reihenfolge.')}
if(date===todayKey()&&actual){const now=minutes(hm());actual.forEach((value,i)=>{if(value>now)errors[i].push('Zukünftige Arbeitszeitbuchungen sind nicht zulässig.')})}
const central=validateEntries(entries);if(entries.length&&!central.plausible&&!errors.some(list=>list.length))errors[0].push('Die Buchungsfolge ist nicht plausibel.');return{valid:errors.every(list=>!list.length),errors}
}
function clearDayEditorEntryError(index){const card=document.querySelector(`[data-entry-card="${index}"]`),box=document.querySelector(`[data-entry-error="${index}"]`);card?.classList.remove('has-error');if(box){box.hidden=true;box.textContent=''}const global=$('dayEditorValidation');if(global)global.hidden=true}
function showDayEditorValidation(result){
const first=result.errors.findIndex(list=>list.length);if(first>=0&&expandedDayEntryIndex!==first){expandedDayEntryIndex=first;renderEntryEditors()}
result.errors.forEach((messages,index)=>{const card=document.querySelector(`[data-entry-card="${index}"]`),box=document.querySelector(`[data-entry-error="${index}"]`);card?.classList.toggle('has-error',!!messages.length);if(box){box.hidden=!messages.length;box.textContent=messages.join(' ')}});const global=$('dayEditorValidation');global.hidden=false;global.textContent='Bitte prüfe die markierte Buchung.';requestAnimationFrame(()=>document.querySelector(`[data-entry-card="${first}"]`)?.scrollIntoView({block:'center',behavior:'smooth'}))
}
function commitEditedDay({close=true,notify=true}={}){
const key=$('editDate').value;if(!key)return false;const existing=dayObject(key),d=clone(existing);d.date=key;d.entries=collectDayEditorEntries();d.pauseMinutes=Math.max(0,Number($('editPause').value)||0);d.note=$('editNote').value.trim();const validation=validateDayEditorEntries(d.entries,key);if(!validation.valid){showDayEditorValidation(validation);return false}const global=$('dayEditorValidation');if(global)global.hidden=true;const before=JSON.stringify({entries:existing.entries||[],pauseMinutes:Number(existing.pauseMinutes)||0,note:String(existing.note||'')}),after=JSON.stringify({entries:d.entries,pauseMinutes:d.pauseMinutes,note:d.note});cursorDate=parseDateKey(key);if(before===after){editingEntries=clone(existing.entries||[]);if(close)closeModal('dayModal');else modalBaselines.set('dayModal',modalSnapshot('dayModal'));refreshAllDerivedViews();if(notify)showToast('Keine Änderungen vorhanden.');return true}editingEntries=clone(d.entries);d.edited=true;d.modifiedAt=new Date().toISOString();d.archived=Number(key.slice(0,4))<new Date().getFullYear();state.days[key]=d;touchDay(key);if(close)closeModal('dayModal');else modalBaselines.set('dayModal',modalSnapshot('dayModal'));refreshAllDerivedViews();if(notify)showToast('Tag gespeichert. Tagessaldo und Zeitkonto wurden aktualisiert.');return true
}
function saveEditedDay(){commitEditedDay()}
function manageAbsenceFromDayEditor(){
const key=$('editDate').value;if(isModalDirty('dayModal')&&!commitEditedDay({close:false,notify:false}))return;closeModal('dayModal');const d=dayObject(key);d.absence?openAbsenceEditorForDay(key,d.absenceGroupId&&absenceGroupDays(d.absenceGroupId).length>1?'group':'day'):openNewAbsence('vacation',key)
}
function deleteEditedDay(){
const k=$('editDate').value,d=clone(dayObject(k,true));if(!confirm('Alle Kommen-, Gehen- und Pausenbuchungen dieses Tages dauerhaft löschen? Eine vorhandene Abwesenheit und der Kommentar bleiben erhalten.'))return;
d.entries=[];d.pauseMinutes=0;d.edited=true;d.importCleared=!!IMPORTED_BY_DATE[k];d.modifiedAt=new Date().toISOString();state.days[k]=d;touchDay(k);closeModal('dayModal');refreshAllDerivedViews();showToast('Buchungen und Pause gelöscht');
}
function modalSnapshot(id){
const modal=$(id);if(!modal)return'';
if(id==='dayModal')return JSON.stringify({date:$('editDate').value,pause:$('editPause').value,note:$('editNote').value,entries:editingEntries.map((entry,index)=>({...entry,type:document.querySelector(`[data-entry-type=\"${index}\"]`)?.value||entry.type,actual:document.querySelector(`[data-entry-actual=\"${index}\"]`)?.value||'',logged:document.querySelector(`[data-entry-logged=\"${index}\"]`)?.value||''}))});
const values=[...modal.querySelectorAll('input,select,textarea')].map(element=>({id:element.id||element.name||element.type,type:element.type,value:element.type==='checkbox'?element.checked:element.value}));
return JSON.stringify(values);
}
function isModalDirty(id){return guardedModalIds.has(id)&&modalBaselines.has(id)&&modalBaselines.get(id)!==modalSnapshot(id)}

function topOpenModal(){return[...document.querySelectorAll('.modal.open')].at(-1)||null}
function modalFocusable(modal){return[...modal.querySelectorAll('button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[href],[tabindex]:not([tabindex="-1"])')].filter(el=>!el.hidden&&el.getClientRects().length&&getComputedStyle(el).visibility!=='hidden')}
function trapModalFocus(event){if(event.key!=='Tab')return;const modal=topOpenModal();if(!modal)return;const items=modalFocusable(modal);if(!items.length){event.preventDefault();modal.focus();return}const first=items[0],last=items.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}else if(!modal.contains(document.activeElement)){event.preventDefault();first.focus()}}
function openModal(id){const modal=$(id);if(!modal)return;if(!modal.classList.contains('open'))modalFocusOrigins.set(id,document.activeElement);modal.classList.add('open');document.body.classList.add('modal-open');if(id==='dayModal')$('dayModal').dataset.originalDate=$('editDate').value;modalBaselines.set(id,modalSnapshot(id));updateDayQuickButton();setTimeout(()=>{const target=id==='dayModal'?modal.querySelector('.close-btn'):modalFocusable(modal)[0];target?.focus()},60)}
function closeModal(id){const modal=$(id);if(!modal)return;modal.classList.remove('open');modalBaselines.delete(id);const origin=modalFocusOrigins.get(id);modalFocusOrigins.delete(id);if(!document.querySelector('.modal.open'))document.body.classList.remove('modal-open');updateDayQuickButton();const remaining=topOpenModal();if(remaining){const target=origin&&remaining.contains(origin)?origin:modalFocusable(remaining)[0];target?.focus({preventScroll:true})}else if(origin&&document.contains(origin))origin.focus({preventScroll:true})}
function runAfterDirtyCheck(id,action){
if(isModalDirty(id)){pendingDiscardModalId=id;pendingDiscardAction=action;openModal('discardConfirmModal');return}
closeModal(id);if(typeof action==='function')action();
}
function requestCloseModal(id){
if(id==='discardConfirmModal'){closeModal(id);return}
if(isModalDirty(id)){pendingDiscardModalId=id;pendingDiscardAction=null;openModal('discardConfirmModal');return}
closeModal(id);
}
function continueEditing(){pendingDiscardModalId=null;pendingDiscardAction=null;closeModal('discardConfirmModal')}
function discardChanges(){const id=pendingDiscardModalId,action=pendingDiscardAction;pendingDiscardModalId=null;pendingDiscardAction=null;closeModal('discardConfirmModal');if(id)closeModal(id);if(typeof action==='function')action()}
function openPauseModal(){$('quickPause').value=Number(dayObject(todayKey()).pauseMinutes)||0;openModal('pauseModal');setTimeout(()=>$('quickPause').focus(),80)}
function saveQuickPause(){const k=todayKey(),d=dayObject(k,true);d.pauseMinutes=Math.max(0,Number($('quickPause').value)||0);d.edited=true;d.modifiedAt=new Date().toISOString();state.days[k]=d;touchDay(k);closeModal('pauseModal');renderToday();showToast('Pause gespeichert')}
let chartMode=['month','year','history'].includes(state.settings.chartMode)?state.settings.chartMode:'month',chartSelection=null;
function renderReports(){
const t=todayKey(),bal=balanceThrough(t);$('reportBalance').textContent=formatDuration(bal);$('reportBalance').className=bal<0?'red':'green';$('reportDay').max=t;$('reportDay').value=t;$('reportMonth').max=t.slice(0,7);$('reportMonth').value=t.slice(0,7);
const years=[];for(let y=new Date().getFullYear();y>=earliestYear();y--)years.push(`<option value="${y}">${y}</option>`);$('reportYear').innerHTML=years.join('');$('chartYear').innerHTML=years.join('');if(!$('chartYear').value)$('chartYear').value=String(new Date().getFullYear());renderOvertimeChart();
}
function setChartMode(mode){chartMode=mode;chartSelection=null;state.settings.chartMode=mode;saveState();renderOvertimeChart()}
function chartSelect(kind,key){chartSelection={kind,key};renderOvertimeChart()}
function chartHistoryItems(){
const first=earliestYear(),now=new Date(),items=[];
for(let y=first;y<=now.getFullYear();y++)for(let m=0;m<12;m++){
if(y===now.getFullYear()&&m>now.getMonth())break;
const key=`${y}-${pad(m+1)}`,summary=monthSummary(y,m),available=summary.days.length>0;
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
items.forEach((it,i)=>{const showLabel=i===0||i===items.length-1||items[i-1].key.slice(0,4)!==it.key.slice(0,4),selected=chartSelection?.key===it.key;svg+=`<g class="history-point ${selected?'selected':''}" data-chart-key="${it.key}"><rect class="chart-hit" x="${Math.max(left,x(i)-10)}" y="${top}" width="20" height="${plotH}"/><circle cx="${x(i)}" cy="${y(it.value)}" r="${selected?4.5:2.2}"/>${showLabel?`<text class="chart-label" x="${x(i)}" y="${h-14}" text-anchor="middle">${it.key.slice(0,4)}</text>`:''}</g>`});
host.innerHTML=svg+'</svg>';
host.querySelectorAll('[data-chart-key]').forEach(el=>{const act=()=>chartSelect('history',el.dataset.chartKey);el.addEventListener('click',act)});
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
const items=chartMode==='month'?Array.from({length:12},(_,m)=>{const y=Number($('chartYear').value)||new Date().getFullYear(),s=monthSummary(y,m);return{key:`${y}-${pad(m+1)}`,label:['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'][m],name:new Intl.DateTimeFormat('de-DE',{month:'long',year:'numeric'}).format(new Date(y,m,1)),value:s.diff,summary:s,available:s.days.length>0}}):Array.from({length:new Date().getFullYear()-earliestYear()+1},(_,i)=>earliestYear()+i).map(y=>{const s=yearSummary(y);return{key:String(y),label:String(y),name:`Jahr ${y}`,value:s.diff,summary:s,available:s.days.length>0}});
const available=items.filter(i=>i.available),max=Math.max(60,...available.map(i=>Math.abs(i.value))),w=360,h=235,padX=48,right=10,zero=107.5,plotH=78,step=(w-padX-right)/Math.max(items.length,1),bar=Math.max(10,Math.min(22,step*.58));
const ticks=[max,Math.round(max/2),0,-Math.round(max/2),-max];
let svg=`<svg viewBox="0 0 ${w} ${h}" aria-hidden="true" focusable="false"><g class="chart-grid">${ticks.map((v,i)=>{const yy=zero-(v/max)*plotH;return `<line x1="${padX}" x2="${w-right}" y1="${yy}" y2="${yy}"/><text x="${padX-5}" y="${yy+3}" text-anchor="end">${i===2?'0':Math.round(Math.abs(v)/60)+'h'}</text>`}).join('')}</g><line class="zero-line" x1="${padX}" x2="${w-right}" y1="${zero}" y2="${zero}"/>`;
items.forEach((it,i)=>{const xx=padX+i*step+(step-bar)/2,val=it.available?it.value:0,bh=Math.abs(val)/max*plotH,yy=val>=0?zero-bh:zero,selected=chartSelection?.key===it.key,current=it.key===todayKey().slice(0,chartMode==='month'?7:4);svg+=`<g class="chart-item ${selected?'selected':''} ${current?'current':''} ${it.available?'':'unavailable'}" data-chart-key="${it.key}"><rect class="chart-hit" x="${padX+i*step}" y="12" width="${step}" height="${h-35}"/><rect class="chart-bar ${val<0?'negative':'positive'}" x="${xx}" y="${yy}" width="${bar}" height="${Math.max(it.available?2:0,bh)}" rx="4"/><text class="chart-label" x="${xx+bar/2}" y="${h-14}" text-anchor="middle">${it.label}</text></g>`});
host.innerHTML=svg+'</svg>';host.querySelectorAll('[data-chart-key]').forEach(el=>{const act=()=>chartSelect(chartMode,el.dataset.chartKey);el.addEventListener('click',act)});
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
function formatContextDate(k){return formatDate(k,{weekday:'long',day:'2-digit',month:'2-digit',year:'numeric'})}
function quickMenuTitle(k){return 'Eintrag hinzufügen'}
function openQuickAdd(date=todayKey()){
quickContextDate=date;const hasComment=!!normalizeNoteText(dayObject(date).note);$('quickAddTitle').textContent=quickMenuTitle(date);$('quickAddContext').textContent=`Bezugsdatum: ${formatContextDate(date)}`;$('quickCommentLabel').textContent=hasComment?'Kommentar bearbeiten':'Kommentar eintragen';$('quickCommentHint').textContent=hasComment?'Vorhandenen Tageskommentar ändern':'Tageskommentar hinzufügen';openModal('quickAddModal')
}
function openAbsenceTypePicker(date=quickContextDate){
quickContextDate=date;closeModal('quickAddModal');$('absenceTypeQuickTitle').textContent='Abwesenheit eintragen';$('absenceTypeContext').textContent=`Bezugsdatum: ${formatContextDate(date)}`;openModal('absenceTypeModal')
}
function openQuickAbsence(code,date=quickContextDate){
quickContextDate=date;quickAbsenceCode=code;closeModal('absenceTypeModal');$('quickAbsenceTitle').textContent=`${absenceLabel(code)} eintragen`;$('quickAbsenceContext').textContent=`${absenceLabel(code)} für ${formatContextDate(date)}`;$('quickAbsenceTypeLabel').textContent=absenceLabel(code);$('quickAbsenceExtent').value='full';$('quickAbsenceNote').value='';updateQuickAbsenceConflict();openModal('quickAbsenceModal')
}
function quickAbsenceConflictText(){
const k=quickContextDate,d=dayObject(k),extent=$('quickAbsenceExtent').value;
if(!isAbsenceWorkday(k))return 'Für dieses Datum liegt kein regulärer Soll-Arbeitstag vor. Nutze für Sonderfälle „Weitere Optionen“.';
if(d.absence)return `Für diesen Tag ist bereits ${d.absence} eingetragen. Vorhandene Daten werden nicht überschrieben.`;
if(extent==='full'&&((d.entries||[]).length||Number(d.pauseMinutes)))return 'Für diesen Tag bestehen Arbeitszeit- oder Pausenbuchungen. Eine ganztägige Abwesenheit kann hier nicht ohne Prüfung gespeichert werden.';
return'';
}
function updateQuickAbsenceConflict(){
const box=$('quickAbsenceConflict');if(!box)return;const text=quickAbsenceConflictText();box.hidden=!text;box.textContent=text;$('saveQuickAbsence').disabled=!!text;
}
function saveQuickAbsence(){
const k=quickContextDate,extent=$('quickAbsenceExtent').value,note=$('quickAbsenceNote').value.trim(),conflict=quickAbsenceConflictText();if(conflict){alert(conflict);return}
const d=clone(dayObject(k,true)),nowIso=new Date().toISOString(),label=absenceLabel(quickAbsenceCode);d.absence=label;d.absenceCode=quickAbsenceCode;d.absenceDuration=extent;delete d.absenceMinutes;d.absenceNote=note;d.absenceGroupId=newAbsenceGroupId();d.absenceCreatedAt=nowIso;d.absenceUpdatedAt=nowIso;d.edited=true;d.modifiedAt=nowIso;d.archived=Number(k.slice(0,4))<new Date().getFullYear();state.days[k]=d;touchDay(k);cursorDate=parseDateKey(k);closeModal('quickAbsenceModal');refreshAllDerivedViews();showToast(`${label} für ${formatContextDate(k)} gespeichert.`)
}
function openQuickAbsenceFurther(){const k=quickContextDate;runAfterDirtyCheck('quickAbsenceModal',()=>openFullDayForDate(k))}
function timeActionDescription(d){
const status=dayStatus(d);if(hasFullAbsence(d))return `${status}. Für Arbeitszeitänderungen ist der vollständige Tageseditor erforderlich.`;
if(!(d.entries||[]).length)return 'Für diesen Tag ist noch keine Buchung vorhanden.';
if(status==='Gehen fehlt')return 'Nach dem vorhandenen Kommen fehlt die Gehen-Buchung.';
if(status==='Kommen fehlt')return 'In der Buchungsfolge fehlt eine Kommen-Buchung.';
if(status==='Vollständig')return 'Die vorhandenen Buchungen sind vollständig. Du kannst eine Buchung korrigieren oder einen weiteren Arbeitsblock beginnen.';
return 'Die Buchungsfolge ist unvollständig und sollte geprüft werden.';
}
function openTimeAction(date=quickContextDate){
quickContextDate=date;closeModal('quickAddModal');closeModal('workdayIssuesModal');const d=dayObject(date),entries=d.entries||[],next=nextActionForDay(d),status=dayStatus(d);$('timeActionTitle').textContent='Zeit ergänzen';$('timeActionContext').textContent=`Bezugsdatum: ${formatContextDate(date)}`;$('timeActionStatus').innerHTML=`<b>${esc(status)}</b><span>${esc(timeActionDescription(d))}</span>`;
const actions=[];
if(!hasFullAbsence(d)){
const nextLabel=next==='in'?'Kommen ergänzen':'Gehen ergänzen',sub=next==='in'&&entries.length?'Weiteren Arbeitsblock beginnen':next==='in'?'Erste Buchung des Tages':'Logisch nächste fehlende Buchung';actions.push(`<button type="button" class="recommended" onclick="openManualTimeQuick('${date}','${next}')"><span>${nextLabel}</span><small>${sub}</small><b>›</b></button>`);
if(entries.length)actions.push(`<button type="button" onclick="openBookingList('${date}')"><span>Vorhandene Buchung korrigieren</span><small>${entries.length} ${entries.length===1?'Buchung':'Buchungen'} auswählen</small><b>›</b></button>`);
}
actions.push(`<button type="button" onclick="openFullDayForDate('${date}','timeActionModal')"><span>Vollständigen Tag bearbeiten</span><small>Pausen, Kommentare und komplexe Fälle</small><b>›</b></button>`);$('timeActionList').innerHTML=actions.join('');openModal('timeActionModal')
}
function suggestedActualForDate(k,type){
if(k===todayKey())return hm();const entries=dayObject(k).entries||[],previous=entries.at(-1);if(!previous)return'';const base=minutes(previous.actual||previous.logged||'00:00');return clockFromMinutes(Math.min(1435,base+5));
}
function openManualTimeQuick(date=quickContextDate,type=null){
quickContextDate=date;manualQuickDate=date;closeModal('timeActionModal');const d=dayObject(date),entries=d.entries||[];manualQuickType=type||nextActionForDay(d);const label=manualQuickType==='in'?'Kommen':'Gehen',actual=suggestedActualForDate(date,manualQuickType),logged=actual?roundLogged(actual,manualQuickType):'';$('manualQuickTitle').textContent=`${label} ergänzen`;$('manualQuickContext').textContent=`${label} für ${formatContextDate(date)}`;$('manualQuickBookingType').textContent=label;const previous=entries.at(-1);$('manualQuickHint').innerHTML=`<b>${label} wird ergänzt</b><span>${previous?`${previous.type==='in'?'Kommen':'Gehen'} um ${esc(previous.logged||previous.actual)} ist zuletzt erfasst.`:'Für diesen Tag ist noch keine Buchung vorhanden.'}</span>`;$('manualActual').value=actual;$('manualLogged').value=logged;$('saveManualQuick').textContent=`${label} speichern`;$('timeInfoText').hidden=true;openModal('manualQuickModal')
}
function saveManualQuick(){
const k=manualQuickDate,d=clone(dayObject(k,true)),actual=$('manualActual').value,logged=$('manualLogged').value,label=manualQuickType==='in'?'Kommen':'Gehen';
if(k>todayKey()){alert('Zukünftige Arbeitszeitbuchungen sind nicht zulässig.');return}
if(hasFullAbsence(d)){alert('Für diesen Tag ist eine ganztägige Abwesenheit eingetragen. Nutze den vollständigen Tageseditor, um den Konflikt zu prüfen.');return}
if(!isClock(actual)||!isClock(logged)){alert('Bitte beide Uhrzeiten vollständig eingeben.');return}
if(k===todayKey()&&minutes(actual)>minutes(hm())){alert('Zukünftige Arbeitszeitbuchungen sind nicht zulässig.');return}
const entries=[...(d.entries||[]),{type:manualQuickType,actual,logged,source:'manual',edited:true,createdAt:new Date().toISOString()}],validation=validateEntries(entries);
if(!validation.plausible){alert('Die Buchung kann nicht gespeichert werden. Kommen und Gehen müssen sich abwechseln; jede dokumentierte Uhrzeit muss mindestens fünf Minuten nach der vorherigen liegen.');return}
d.entries=entries;d.edited=true;d.modifiedAt=new Date().toISOString();d.archived=false;state.days[k]=d;touchDay(k);cursorDate=parseDateKey(k);closeModal('manualQuickModal');refreshAllDerivedViews();showToast(`${label} um ${logged} gespeichert. Tagessaldo und Zeitkonto wurden aktualisiert.`)
}
function openBookingList(date=quickContextDate){
quickContextDate=date;closeModal('timeActionModal');const entries=dayObject(date).entries||[];$('bookingListTitle').textContent='Vorhandene Buchung korrigieren';$('bookingListContext').textContent=`Buchungen für ${formatContextDate(date)}`;$('bookingChoiceList').innerHTML=entries.map((entry,index)=>`<button type="button" onclick="openEntryFromList('${date}',${index})"><span>${entry.type==='in'?'Kommen':'Gehen'}</span><b>${esc(entry.logged||entry.actual||'–')}</b><small>Tatsächlich ${esc(entry.actual||'–')} · Dokumentiert ${esc(entry.logged||'–')}</small><i>›</i></button>`).join('')||'<div class="empty">Keine Buchungen vorhanden</div>';openModal('bookingListModal')
}
function openEntryFromList(date,index){closeModal('bookingListModal');openSingleEntryEditor(date,index)}
function openFullDayForDate(date=quickContextDate,sourceModalId=null){
if(sourceModalId)closeModal(sourceModalId);['quickAddModal','timeActionModal','manualQuickModal','bookingListModal','quickAbsenceModal','absenceTypeModal','workdayIssuesModal'].forEach(id=>{if($(id)?.classList.contains('open'))closeModal(id)});showScreen('times');currentView='day';document.querySelectorAll('[data-view]').forEach(button=>button.classList.toggle('active',button.dataset.view==='day'));cursorDate=parseDateKey(date);renderDayView(date);openDayEditor(date)
}
function openFullTodayEditor(){const k=manualQuickDate;runAfterDirtyCheck('manualQuickModal',()=>openFullDayForDate(k))}
function toggleTimeInfo(kind){const box=$('timeInfoText');box.hidden=false;box.textContent=kind==='actual'?'Tatsächliche Uhrzeit = die reale Uhrzeit der Buchung.':'Dokumentierte Uhrzeit = die gerundete beziehungsweise angerechnete Uhrzeit.'}
function workdayIssueSignature(k,d,kind,status){return JSON.stringify({date:k,kind,status,entries:(d.entries||[]).map(e=>({type:e.type,actual:e.actual||'',logged:e.logged||''})),pauseMinutes:Number(d.pauseMinutes)||0,absence:d.absence||null,absenceCode:dayAbsenceCode(d),absenceDuration:absenceDuration(d),targetMinutes:targetMinutesForDate(k,d)})}
function workdayIssueForDate(k,{includeReviewed=false}={}){const d=dayObject(k);if(k>=todayKey()||scheduledTargetMinutes(k)<=0)return null;const entries=d.entries||[],halfAbsence=!!d.absence&&absenceDuration(d)==='half';if(d.absence&&!halfAbsence)return null;let kind=null,status='';if(!entries.length){kind='missing';status=halfAbsence?'Arbeitszeit zum halben Abwesenheitstag fehlt':'Ohne Buchung'}else{status=dayStatus(d);if(status==='Vollständig'||status==='Halbe Abwesenheit + Arbeitszeit')return null;kind='incomplete'}const signature=workdayIssueSignature(k,d,kind,status),review=d.workdayIssueReview;if(!includeReviewed&&review?.signature===signature)return null;return{date:k,kind,status,signature,reviewed:review?.signature===signature}}
function workdayIssues(){const result=[],end=parseDateKey(todayKey());end.setDate(end.getDate()-1);let current=parseDateKey(TRACKING_START_DATE);for(;current<=end;current.setDate(current.getDate()+1)){const issue=workdayIssueForDate(dateKey(current));if(issue)result.push(issue)}return result}
function confirmWorkdayIssue(date){const issue=workdayIssueForDate(date,{includeReviewed:true});if(!issue){showToast('Für diesen Tag besteht kein offener Prüfhinweis mehr.');refreshAllDerivedViews();return}if(!confirm('Der Tag wurde geprüft. Die angezeigten Minusstunden sind korrekt und es sind keine weiteren Eingaben erforderlich?'))return;const d=dayObject(date,true);d.workdayIssueReview={signature:issue.signature,reviewedAt:new Date().toISOString(),label:'Geprüft – Minusstunden sind korrekt'};state.days[date]=d;touchDay(date);closeModal('workdayIssuesModal');refreshAllDerivedViews();showToast('Prüfhinweis bestätigt und von der Startseite entfernt.')}
function renderPastWorkdayNotice(){
const issues=workdayIssues(),missing=issues.filter(issue=>issue.kind==='missing').length,incomplete=issues.filter(issue=>issue.kind==='incomplete').length,button=$('pastWorkdayNotice');button.hidden=!issues.length;if(!issues.length)return;
let label='';if(missing&&incomplete)label=`${missing} ohne Buchung · ${incomplete} unvollständig`;else if(missing)label=`${missing} ${missing===1?'Arbeitstag':'Arbeitstage'} ohne Buchung`;else label=`${incomplete} ${incomplete===1?'Tag':'Tage'} unvollständig`;$('pastWorkdayNoticeTitle').textContent=label;$('pastWorkdayNoticeText').textContent='';
}
function openWorkdayIssues(){
const issues=workdayIssues(),missing=issues.filter(issue=>issue.kind==='missing').length,incomplete=issues.length-missing;$('workdayIssuesSummary').textContent=`${missing} ohne Buchung · ${incomplete} unvollständig`;$('workdayIssuesList').innerHTML=issues.map(issue=>`<article><div><b>${formatContextDate(issue.date)}</b><span>${esc(issue.status)}</span></div><div><button type="button" onclick="openIssueTime('${issue.date}')">Zeit nachtragen</button><button type="button" onclick="openIssueAbsence('${issue.date}')">Abwesenheit eintragen</button><button type="button" class="issue-reviewed-button" onclick="confirmWorkdayIssue('${issue.date}')">Als geprüft bestätigen</button></div></article>`).join('')||'<div class="empty">Keine offenen Arbeitstage.</div>';openModal('workdayIssuesModal')
}
function openIssueTime(date){closeModal('workdayIssuesModal');openTimeAction(date)}
function openIssueAbsence(date){closeModal('workdayIssuesModal');openAbsenceTypePicker(date)}
function setAbsenceType(code){$('absenceType').value=code||'vacation'}
function openNewAbsence(code='vacation',date=todayKey()){
['quickAddModal','absenceTypeModal','quickAbsenceModal'].forEach(id=>{if($(id)?.classList.contains('open'))closeModal(id)});absenceEditorContext={mode:'new',scope:'range',originalGroupId:null,sourceDate:date};
$('absenceModalTitle').textContent=`Abwesenheit eintragen für ${formatContextDate(date)}`;setAbsenceType(code);$('absenceFrom').value=date;$('absenceTo').value=date;$('absenceExtent').value='full';$('absenceNote').value='';$('absenceConflictPolicy').value='abort';$('absenceDeleteActions').hidden=true;updateAbsenceSummary();openModal('absenceModal');
}
function openAbsenceEditorForDay(k,scope='day'){
const d=dayObject(k);if(!d.absence){openNewAbsence('vacation',k);return}
const group=scope==='group'&&d.absenceGroupId?absenceGroupDays(d.absenceGroupId):[d],from=group[0]?.date||k,to=group.at(-1)?.date||k;
absenceEditorContext={mode:'edit',scope,originalGroupId:d.absenceGroupId||null,sourceDate:k,originalDates:group.map(x=>x.date)};
$('absenceModalTitle').textContent=scope==='group'?`Abwesenheitszeitraum bearbeiten · ${formatContextDate(k)}`:`Abwesenheit bearbeiten für ${formatContextDate(k)}`;setAbsenceType(d.absenceCode||absenceCodeFromLabel(d.absence));$('absenceFrom').value=from;$('absenceTo').value=to;$('absenceExtent').value=absenceDuration(d);$('absenceNote').value=d.absenceNote||'';$('absenceConflictPolicy').value='abort';$('absenceDeleteActions').hidden=false;$('deleteAbsenceGroupBtn').hidden=!(d.absenceGroupId&&absenceGroupDays(d.absenceGroupId).length>1);updateAbsenceSummary();openModal('absenceModal');
}
function absenceConflict(k,excludeGroupId){
const d=state.days[k];if(!d)return false;
const otherAbsence=d.absence&&(!excludeGroupId||d.absenceGroupId!==excludeGroupId);
return !!((d.entries||[]).length||Number(d.pauseMinutes)||otherAbsence);
}
function absencePlan(){
const from=$('absenceFrom').value,to=$('absenceTo').value,extent=$('absenceExtent').value,code=$('absenceType').value;if(!from||!to||from>to)return{error:'Das Von-Datum darf nicht nach dem Bis-Datum liegen.'};
const range=dateRange(from,to),workdays=range.filter(isAbsenceWorkday),exclude=absenceEditorContext?.originalGroupId||null,conflicts=workdays.filter(k=>absenceConflict(k,exclude)),total=workdays.reduce((n,k)=>{const base=scheduledTargetMinutes(k);return n+(code==='timeOff'?base:(extent==='half'?Math.round(base/2):0))},0);
return{from,to,range,workdays,conflicts,total,code,extent};
}
function updateAbsenceSummary(){
const box=$('absenceSummary'),plan=absencePlan();if(plan.error){box.innerHTML=`<b>Eingaben prüfen</b>${esc(plan.error)}`;return}
const type=absenceLabel($('absenceType').value),extent=$('absenceExtent').value==='half'?'Halber Tag':'Ganzer Tag',weekendCount=plan.range.length-plan.workdays.length;
box.innerHTML=`<b>${esc(type)} · ${extent}</b><div class="summary-line"><span>Kalenderzeitraum</span><strong>${formatDate(plan.from,{day:'2-digit',month:'2-digit',year:'numeric'})} – ${formatDate(plan.to,{day:'2-digit',month:'2-digit',year:'numeric'})}</strong></div><div class="summary-line"><span>Berücksichtigte Arbeitstage</span><strong>${plan.workdays.length}</strong></div><div class="summary-line"><span>Sollzeit nach Abwesenheit</span><strong>${formatDuration(plan.total,{signed:false})}</strong></div>${weekendCount?`<div class="summary-line"><span>Ausgelassene Wochenend-/Feiertage</span><strong>${weekendCount}</strong></div>`:''}${plan.conflicts.length?`<div class="conflict">Konflikte an ${plan.conflicts.length} Tag(en): ${plan.conflicts.slice(0,4).map(k=>formatDate(k,{day:'2-digit',month:'2-digit'})).join(', ')}${plan.conflicts.length>4?' …':''}</div>`:'<div class="summary-line"><span>Konflikte</span><strong>Keine</strong></div>'}`;
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
d.absence=label;d.absenceCode=code;d.absenceDuration=extent;delete d.absenceMinutes;d.absenceNote=note;d.absenceGroupId=groupId;d.absenceCreatedAt=d.absenceCreatedAt||nowIso;d.absenceUpdatedAt=nowIso;d.edited=true;d.modifiedAt=nowIso;d.archived=Number(k.slice(0,4))<new Date().getFullYear();state.days[k]=d;
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
const targetDate=$('targetValidFrom')?.value||todayKey(),regionDate=$('holidayRegionValidFrom')?.value||todayKey();$('employeeName').value=state.settings.employeeName||'';$('targetValidFrom').min=TRACKING_START_DATE;$('targetValidFrom').value=targetDate;$('targetHours').value=clockFromMinutes(targetMinutesFromSettings(targetDate,state.settings));$('checkpointBalance').value=formatDuration(state.settings.startBalanceMinutes||0);$('holidayRegionValidFrom').min=TRACKING_START_DATE;$('holidayRegionValidFrom').value=regionDate;$('holidayRegion').value=holidayRegionFromSettings(regionDate,state.settings);$('freeChristmasEve').checked=state.settings.freeChristmasEve!==false;$('freeNewYearsEve').checked=state.settings.freeNewYearsEve!==false;$('countdownEnabled').checked=state.settings.countdownEnabled!==false;$('bookingSoundEnabled').checked=state.settings.bookingSoundEnabled===true;$('reportSignature').checked=state.settings.reportSignature!==false;$('targetRuleStatus').textContent=normalizeTargetRules(state.settings.targetRules).map(r=>`${formatDate(r.from,{day:'2-digit',month:'2-digit',year:'numeric'})}: ${formatDuration(r.minutes,{signed:false})}`).join(' · ');$('holidayRegionRuleStatus').textContent=normalizeHolidayRegionRules(state.settings.holidayRegionRules).map(r=>`${formatDate(r.from,{day:'2-digit',month:'2-digit',year:'numeric'})}: ${HOLIDAY_REGIONS[r.region]}`).join(' · ');$('appVersion').textContent=`Arbeitszeit PWA · Version ${APP_VERSION}`
}
function saveSettings(){const startBalance=parseSignedTime($('checkpointBalance').value);if(startBalance===null){showToast('Startwert im Format +HH:MM mit Minuten von 00 bis 59 eingeben');$('checkpointBalance').value=formatDuration(state.settings.startBalanceMinutes||0);return}state.settings.employeeName=$('employeeName').value.trim();state.settings.startBalanceMinutes=startBalance;state.settings.trackingStartDate=TRACKING_START_DATE;state.settings.calculationVersion=CALCULATION_VERSION;state.settings.freeChristmasEve=$('freeChristmasEve').checked;state.settings.freeNewYearsEve=$('freeNewYearsEve').checked;state.settings.countdownEnabled=$('countdownEnabled').checked;state.settings.bookingSoundEnabled=$('bookingSoundEnabled').checked;state.settings.reportSignature=$('reportSignature').checked;state.settings.targetMinutes=targetMinutesFromSettings(todayKey(),state.settings);state.settings.holidayRegion=holidayRegionFromSettings(todayKey(),state.settings);ensureHolidayYears();saveState();refreshAllDerivedViews();if(!state.settings.countdownEnabled)stopConfetti();showToast('Einstellungen gespeichert')}

function applyTargetRule(){const from=$('targetValidFrom').value,value=$('targetHours').value,newMinutes=minutes(value);if(!isDateKey(from)||from<TRACKING_START_DATE){showToast('Gültigkeitsdatum ab 01.11.2022 wählen');return}if(!isClock(value)||newMinutes<=0){showToast('Gültige tägliche Sollzeit eingeben');return}const previous=targetMinutesFromSettings(from,state.settings);if(previous===newMinutes&&normalizeTargetRules(state.settings.targetRules).some(r=>r.from===from&&r.minutes===newMinutes)){showToast('Diese Sollzeitregel besteht bereits');return}if(from<=todayKey()&&!confirm(`Sollzeit ab ${formatDate(from,{day:'2-digit',month:'2-digit',year:'numeric'})} auf ${formatDuration(newMinutes,{signed:false})} ändern? Alle Tage ab diesem Datum werden neu berechnet. Frühere Zeiträume bleiben unverändert.`))return;state.settings.targetRules=upsertEffectiveRule(normalizeTargetRules(state.settings.targetRules),{from,minutes:newMinutes});state.settings.targetMinutes=targetMinutesFromSettings(todayKey(),state.settings);saveState();refreshAllDerivedViews();renderSettings();showToast(`Sollzeit ab ${formatDate(from,{day:'2-digit',month:'2-digit',year:'numeric'})} gespeichert`)}
function applyHolidayRegionRule(){const from=$('holidayRegionValidFrom').value,region=$('holidayRegion').value;if(!isDateKey(from)||from<TRACKING_START_DATE||!HOLIDAY_REGIONS[region]){showToast('Bundesland und Gültigkeitsdatum prüfen');return}const previous=holidayRegionFromSettings(from,state.settings);if(previous===region&&normalizeHolidayRegionRules(state.settings.holidayRegionRules).some(r=>r.from===from&&r.region===region)){showToast('Diese Bundeslandregel besteht bereits');return}if(from<=todayKey()&&!confirm(`Feiertagsregion ab ${formatDate(from,{day:'2-digit',month:'2-digit',year:'numeric'})} auf ${HOLIDAY_REGIONS[region]} ändern? Gesetzliche Feiertage und Zeitkonto werden ab diesem Datum neu berechnet. Frühere Zeiträume bleiben unverändert.`))return;state.settings.holidayRegionRules=upsertEffectiveRule(normalizeHolidayRegionRules(state.settings.holidayRegionRules),{from,region});state.settings.holidayRegion=holidayRegionFromSettings(todayKey(),state.settings);ensureHolidayYears(Number(from.slice(0,4)),new Date().getFullYear()+1);saveState();refreshAllDerivedViews();renderSettings();showToast(`Feiertagsregion ab ${formatDate(from,{day:'2-digit',month:'2-digit',year:'numeric'})} gespeichert`)}
function syncTargetRuleInput(){const date=$('targetValidFrom').value||todayKey();$('targetHours').value=clockFromMinutes(targetMinutesFromSettings(date,state.settings))}
function syncHolidayRegionInput(){const date=$('holidayRegionValidFrom').value||todayKey();$('holidayRegion').value=holidayRegionFromSettings(date,state.settings)}
function downloadBlob(name,blob){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),2500)}
function downloadFile(name,text,type){downloadBlob(name,new Blob([text],{type}))}
function backupTimestamp(date=new Date()){return `${dateKey(date)}_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`}
function createBackupPayload(exportedAt=new Date()){return{format:BACKUP_FORMAT,version:2,appVersion:APP_VERSION,exportedAt:exportedAt.toISOString(),schemaVersion:CURRENT_SCHEMA,recordCount:Object.values(state.days||{}).reduce((n,d)=>n+(d.entries?.length||0),0),dayCount:Object.keys(state.days||{}).length,state:clone(state)}}
function createBackupFile(stamp=backupTimestamp(),exportedAt=new Date()){const payload=createBackupPayload(exportedAt);return new File([JSON.stringify(payload,null,2)],`Arbeitszeit_Backup_${stamp}.json`,{type:'application/json'})}
function exportJSON(){const file=createBackupFile();downloadBlob(file.name,file);showToast('Sicherung erstellt')}
function validateBackupEnvelope(raw){if(!raw||typeof raw!=='object'||raw.format!==BACKUP_FORMAT)throw new Error('Die Datei gehört nicht zu dieser Arbeitszeit-App.');if(!raw.state||typeof raw.state!=='object')throw new Error('Die Sicherung enthält keinen vollständigen App-Zustand.');const suppliedSchema=Math.max(Number(raw.schemaVersion)||0,Number(raw.state?.schemaVersion)||0,Number(raw.state?.settings?.schemaVersion)||0);if(suppliedSchema>CURRENT_SCHEMA)throw new Error(`Diese Sicherung verwendet Datenschema ${suppliedSchema}. Die installierte App unterstützt höchstens Schema ${CURRENT_SCHEMA}. Bitte zuerst die App aktualisieren.`);const checked=validateStateShape(raw.state),expanded=checked.compact===true?expandCompact(checked):checked;const days=Object.values(expanded.days||{}),entries=days.reduce((n,d)=>n+(d.entries?.length||0),0);return{state:expanded,meta:{exportedAt:raw.exportedAt||raw.savedAt||null,appVersion:raw.appVersion||'unbekannt',days:days.length,entries}}}
function restoreJSON(file){if(!file)return;const r=new FileReader();r.onload=()=>{try{
const result=validateBackupEnvelope(JSON.parse(r.result));
const stamp=result.meta.exportedAt?new Intl.DateTimeFormat('de-DE',{dateStyle:'medium',timeStyle:'short'}).format(new Date(result.meta.exportedAt)):'unbekannt';
const info=`Sicherungsdatum: ${stamp}\nApp-Version: ${result.meta.appVersion}\nKalendertage: ${result.meta.days}\nBuchungen: ${result.meta.entries}`;
if(!confirm(`${info}\n\nDie aktuellen Daten werden vor dem Überschreiben gesichert. Wiederherstellung fortsetzen?`))return;
const safety=createBackupFile();downloadBlob(safety.name.replace('.json','_vor_Wiederherstellung.json'),safety);
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
function exportDays(){return calendarRecords(TRACKING_START_DATE,todayKey())}
function makeWorkbook(){
const days=exportDays(),countable=days.filter(d=>isCountable(d,todayKey())),first=countable[0]?.date||days[0]?.date||'',last=countable.at(-1)?.date||days.at(-1)?.date||'';
const totals=countable.reduce((a,d)=>{const c=calculateDay(d);a.net+=c.net;a.target+=c.target;a.pause+=c.appliedPause;a.diff+=c.diff;a.entries+=(d.entries||[]).length;return a},{net:0,target:0,pause:0,diff:0,entries:0});
const overview=[[H('Kennzahl'),H('Wert')],[T('Sicherungsdatum'),T(new Date().toLocaleString('de-DE'))],[T('Datenzeitraum'),T(first&&last?`${first} bis ${last}`:'Keine Daten')],[T('App-Version'),T(APP_VERSION)],[T('Aktueller Zeitkontostand'),DUR(balanceThrough(todayKey()),true)],[T('Gesamte Nettoarbeitszeit'),DUR(totals.net)],[T('Gesamte Sollzeit'),DUR(totals.target)],[T('Gesamte Pausenzeit'),DUR(totals.pause)],[T('Gesamte Differenz'),DUR(totals.diff,true)],[T('Anzahl erfasster Arbeitstage'),{v:countable.length,t:'n'}],[T('Anzahl einzelner Buchungen'),{v:totals.entries,t:'n'}]];
const daily=[[H('Datum'),H('Wochentag'),H('Erster Arbeitsbeginn'),H('Letztes Arbeitsende'),H('Bruttozeit'),H('Automatische Pause'),H('Manuelle Pause'),H('Gesamte Pause'),H('Nettozeit'),H('Sollzeit'),H('Tagesdifferenz'),H('Zeitkontostand nach diesem Tag'),H('Status'),H('Kommentar')]];
for(const d of days){const c=calculateDay(d),ins=(d.entries||[]).filter(e=>e.type==='in'),outs=(d.entries||[]).filter(e=>e.type==='out');daily.push([D(d.date),T(formatDate(d.date,{weekday:'long'})),TM(ins[0]?.logged||ins[0]?.actual),TM(outs.at(-1)?.logged||outs.at(-1)?.actual),DUR(c.gross),DUR(0),DUR(0),DUR(c.enteredPause),DUR(c.appliedPause),DUR(c.net),DUR(c.target),DUR(c.diff,true),DUR(balanceThrough(d.date),true),T(dayStatus(d)),T(d.note||d.absenceNote||'')])}
const bookings=[[H('Datum'),H('Typ'),H('Tatsächliche Uhrzeit'),H('Dokumentierte Uhrzeit'),H('Herkunft'),H('Manuell geändert'),H('Änderungszeitpunkt')]];
for(const d of days)for(const e of d.entries||[])bookings.push([D(d.date),T(e.type==='in'?'Kommen':'Gehen'),TM(e.actual),TM(e.logged),T(entrySource(d,e)),T(e.edited||d.edited?'Ja':'Nein'),T((e.editedAt||d.modifiedAt||'').replace('T',' ').slice(0,19))]);
const months=[[H('Monat'),H('Nettozeit'),H('Sollzeit'),H('Pausenzeit'),H('Monatsdifferenz'),H('Zeitkontostand am Monatsende'),H('Anzahl Arbeitstage')]],years=[[H('Jahr'),H('Nettozeit'),H('Sollzeit'),H('Pausenzeit'),H('Jahresdifferenz'),H('Zeitkontostand am Jahresende'),H('Anzahl Arbeitstage')]];
const monthKeys=[...new Set(countable.map(d=>d.date.slice(0,7)))].sort();for(const mk of monthKeys){const [y,m]=mk.split('-').map(Number),ss=monthSummary(y,m-1);months.push([T(new Intl.DateTimeFormat('de-DE',{month:'long',year:'numeric'}).format(new Date(y,m-1,1))),DUR(ss.net),DUR(ss.target),DUR(ss.pause),DUR(ss.diff,true),DUR(ss.closing,true),{v:ss.days.filter(d=>isCountable(d,ss.cutoff)).length,t:'n'}])}
const yearKeys=[...new Set(countable.map(d=>Number(d.date.slice(0,4))))].sort();for(const y of yearKeys){const ss=yearSummary(y);years.push([{v:y,t:'n'},DUR(ss.net),DUR(ss.target),DUR(ss.pause),DUR(ss.diff,true),DUR(ss.closing,true),{v:ss.months.reduce((n,m)=>n+m.days.filter(d=>isCountable(d,m.cutoff)).length,0),t:'n'}])}
const history=[[H('Datum'),H('Import Netto'),H('Neu Netto'),H('Delta Netto'),H('Import Soll'),H('Neu Soll'),H('Delta Soll'),H('Import Saldo'),H('Neu Saldo'),H('Delta Saldo'),H('Import Tagesstand'),H('Neu Tagesstand'),H('Delta Tagesstand'),H('Historisch einbezogen'),H('Bereinigung / Hinweis')]];
for(const d of days.filter(x=>x.sourceYear||Number.isFinite(Number(x.excelDiffMinutes)))){const c=calculateDay(d),legacyNet=Number(d.excelNetMinutes)||0,legacyTarget=Number(d.excelTargetMinutes)||0,legacyDiff=Number(d.excelDiffMinutes)||0,legacyBalance=Number(d.excelBalanceMinutes)||0,currentBalance=balanceThrough(d.date);history.push([D(d.date),DUR(legacyNet),DUR(c.net),DUR(c.net-legacyNet,true),DUR(legacyTarget),DUR(c.target),DUR(c.target-legacyTarget,true),DUR(legacyDiff,true),DUR(c.diff,true),DUR(c.diff-legacyDiff,true),DUR(legacyBalance,true),DUR(currentBalance,true),DUR(currentBalance-legacyBalance,true),T(d.excelIncludedInSummary===false?'Nein':'Ja'),T(d.dataCorrection||'')])}
const settings=[[H('Einstellung'),H('Wert')],[T('Name im Bericht'),T(state.settings.employeeName||'')],[T('Tägliche Sollzeit heute'),DUR(targetMinutesFromSettings(todayKey(),state.settings))],[T('Sollzeitregeln'),T(normalizeTargetRules(state.settings.targetRules).map(r=>`${r.from}: ${formatDuration(r.minutes,{signed:false})}`).join(' | '))],[T(`Startwert Zeitkonto am ${TRACKING_START_DATE}`),DUR(state.settings.startBalanceMinutes||0,true)],[T('Feiertagsregion heute'),T(HOLIDAY_REGIONS[holidayRegionFromSettings(todayKey(),state.settings)])],[T('Bundeslandregeln'),T(normalizeHolidayRegionRules(state.settings.holidayRegionRules).map(r=>`${r.from}: ${HOLIDAY_REGIONS[r.region]}`).join(' | '))],[T('Heiligabend frei'),T(state.settings.freeChristmasEve!==false?'Ja':'Nein')],[T('Silvester frei'),T(state.settings.freeNewYearsEve!==false?'Ja':'Nein')],[T('Countdown aktiviert'),T(state.settings.countdownEnabled!==false?'Ja':'Nein')],[T('Retro-Buchungston'),T(state.settings.bookingSoundEnabled===true?'Ja':'Nein')],[T('Unterschriftsbereich'),T(state.settings.reportSignature!==false?'Ja':'Nein')],[T('Datenschema'),{v:CURRENT_SCHEMA,t:'n'}],[T('App-Version'),T(APP_VERSION)]];
const sheets=[['Übersicht',overview,[32,28],false],['Tagesübersicht',daily,[12,14,18,18,14,18,16,15,14,14,16,24,22,34],true],['Buchungen',bookings,[12,12,18,20,24,18,24],true],['Monatsübersicht',months,[22,16,16,16,18,28,18],true],['Jahresübersicht',years,[12,16,16,16,18,28,18],true],['Historienvergleich',history,[12,16,16,16,16,16,16,16,16,16,20,20,20,20,54],true],['Einstellungen',settings,[34,28],false]];
const files=[];files.push({name:'[Content_Types].xml',data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_,i)=>`<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`});
files.push({name:'_rels/.rels',data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`});
files.push({name:'xl/workbook.xml',data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((sh,i)=>`<sheet name="${xml(sh[0])}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join('')}</sheets></workbook>`});
files.push({name:'xl/_rels/workbook.xml.rels',data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_,i)=>`<Relationship Id="rId${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`});
files.push({name:'xl/styles.xml',data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="3"><numFmt numFmtId="164" formatCode="dd.mm.yyyy"/><numFmt numFmtId="165" formatCode="hh:mm"/><numFmt numFmtId="166" formatCode="[h]:mm;-[h]:mm"/></numFmts><fonts count="4"><font><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/></font><font><color rgb="FF008000"/><sz val="11"/><name val="Calibri"/></font><font><color rgb="FFC00000"/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF315B7D"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="7"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="166" fontId="2" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/><xf numFmtId="166" fontId="3" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`});
sheets.forEach((sh,i)=>files.push({name:`xl/worksheets/sheet${i+1}.xml`,data:sheetXml(sh[1],sh[2],{filter:sh[3],freeze:true})}));return new Blob([zipStore(files)],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'})
}
function createExcelFile(stamp=backupTimestamp()){return new File([makeWorkbook()],`Arbeitszeit_Auswertung_${stamp}.xlsx`,{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'})}
function exportXLSX(){try{const file=createExcelFile();downloadBlob(file.name,file);showToast('Excel-Auswertung erstellt')}catch(e){console.error(e);alert(`Excel-Datei konnte nicht erstellt werden: ${e.message}`)}}
async function createPackage(){const now=new Date(),stamp=backupTimestamp(now);return[createBackupFile(stamp,now),createExcelFile(stamp)]}
async function sharePackage(){try{const files=await createPackage();if(navigator.share&&navigator.canShare?.({files})){await navigator.share({title:'Arbeitszeit-Sicherung',files});openBackupSuccessConfirm()}else openShareFallback(files)}catch(e){if(e?.name!=='AbortError'){console.error(e);try{openShareFallback(await createPackage())}catch(inner){alert(`Sicherung konnte nicht erstellt werden: ${inner.message}`)}}}}
function openShareFallback(files){pendingShareFiles=files;fallbackShareCompleted={json:false,excel:false};const [jsonFile,xlsxFile]=files;$('fallbackJsonName').textContent=jsonFile.name;$('fallbackExcelName').textContent=xlsxFile.name;openModal('shareFallbackModal')}
function downloadFallbackFile(kind){const file=pendingShareFiles?.[kind==='json'?0:1];if(!file)return;downloadBlob(file.name,file);fallbackShareCompleted[kind]=true;showToast(`${kind==='json'?'JSON-Sicherung':'Excel-Auswertung'} gespeichert`);if(fallbackShareCompleted.json&&fallbackShareCompleted.excel){setTimeout(()=>{closeModal('shareFallbackModal');openBackupSuccessConfirm()},150)}}
function openBackupSuccessConfirm(){openModal('backupSuccessModal')}
function cancelBackupSuccess(){closeModal('backupSuccessModal')}
function confirmBackupSuccess(){state.settings.lastExternalBackupAt=new Date().toISOString();storageNotice='';saveState(true);renderSettings();closeModal('backupSuccessModal');showToast('Externe Sicherung bestätigt')}
function formatExternalBackup(value){if(!value)return'Noch nicht bestätigt';const date=new Date(value);if(Number.isNaN(date.getTime()))return'Noch nicht bestätigt';return new Intl.DateTimeFormat('de-DE',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(date)}
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
const summary=`<div class="hero"><span>Zeitkontostand nach diesem Tag</span><strong>${formatDuration(balanceThrough(k))}</strong></div><div class="summary"><div><span>Tagesstatus</span><b>${esc(dayStatus(d))}</b></div><div><span>Bruttoarbeitszeit</span><b>${formatDuration(c.gross,{signed:false})}</b></div><div><span>Nettoarbeitszeit</span><b>${formatDuration(c.net,{signed:false})}</b></div><div><span>Sollzeit</span><b>${formatDuration(c.target,{signed:false})}</b></div><div><span>Tagesdifferenz</span><b>${formatDuration(c.diff)}</b></div><div><span>Pause</span><b>${Number(d.pauseMinutes)||0} Min.</b></div><div><span>Abwesenheit</span><b>${esc(d.absence?`${d.absence} · ${absenceDuration(d)==='half'?'Halber Tag':'Ganzer Tag'}`:'–')}</b></div><div><span>Sollzeit nach Abwesenheit</span><b>${d.absence?formatDuration(targetMinutesForDate(d.date,d),{signed:false}):'–'}</b></div><div><span>Abwesenheitsnotiz</span><b class="wrap">${esc(d.absenceNote||'–')}</b></div><div><span>Herkunft / Änderung</span><b>${esc(source)}</b></div><div><span>Kommentar</span><b class="wrap">${esc(d.note||'–')}</b></div></div>`;
const body=entries.length?entries.map((e,i)=>`<tr><td>${i+1}</td><td>${e.type==='in'?'Kommen':'Gehen'}</td><td class="num">${esc(e.actual||'–')}</td><td class="num">${esc(e.logged||'–')}</td><td>${esc(entrySource(d,e))}</td></tr>`).join(''):'<tr><td colspan="5">Keine Buchungen</td></tr>';
reportShell(`Tagesbericht ${formatDate(k,{day:'2-digit',month:'2-digit',year:'numeric'})}`,formatDate(k),summary,`<table><thead><tr><th>Nr.</th><th>Art</th><th class="num">Tatsächlich</th><th class="num">Dokumentiert</th><th>Herkunft</th></tr></thead><tbody>${body}</tbody></table>`,'day')
}
function monthReport(y,m){
const start=`${y}-${pad(m+1)}-01`,end=dateKey(new Date(y,m+1,0,12)),s=periodSummary(start,end),title=new Intl.DateTimeFormat('de-DE',{month:'long',year:'numeric'}).format(new Date(y,m,1));
const summary=`<div class="hero"><span>Zeitkonto Monatsende / Stichtag</span><strong>${formatDuration(s.closing)}</strong></div><div class="summary"><div><span>Übertrag Vormonat</span><b>${formatDuration(s.opening)}</b></div><div><span>Monatsdifferenz</span><b>${formatDuration(s.diff)}</b></div><div><span>Sollzeit</span><b>${formatDuration(s.target,{signed:false})}</b></div><div><span>Nettozeit</span><b>${formatDuration(s.net,{signed:false})}</b></div><div><span>Pausenzeit</span><b>${formatDuration(s.pause,{signed:false})}</b></div><div><span>Urlaubstage</span><b>${formatDayCount(s.vacation)}</b></div><div><span>Krankheitstage</span><b>${formatDayCount(s.sick)}</b></div><div><span>Zeitausgleichstage</span><b>${formatDayCount(s.timeOff||0)}</b></div><div><span>Sonstige Abwesenheiten</span><b>${formatDayCount(s.other)}</b></div><div><span>Unvollständige Tage</span><b>${s.incomplete}</b></div></div>`;
const body=s.days.map(d=>{const c=calculateDay(d),ins=(d.entries||[]).filter(e=>e.type==='in').map(e=>e.logged).join(', ')||'–',outs=(d.entries||[]).filter(e=>e.type==='out').map(e=>e.logged).join(', ')||'–',absence=d.absence?`${d.absence} (${absenceDuration(d)==='half'?'½ Tag':'ganzer Tag'}, Soll ${formatDuration(targetMinutesForDate(d.date,d),{signed:false})})`:'–';return `<tr><td>${formatDate(d.date,{day:'2-digit',month:'2-digit',year:'numeric'})}</td><td>${esc(dayStatus(d))}</td><td>${esc(absence)}</td><td class="num">${esc(ins)}</td><td class="num">${esc(outs)}</td><td class="num">${Number(d.pauseMinutes)||0}</td><td class="num">${formatDuration(c.net,{signed:false})}</td><td class="num">${formatDuration(c.target,{signed:false})}</td><td class="num">${formatDuration(c.diff)}</td><td class="num">${formatDuration(balanceThrough(d.date))}</td><td class="wrap">${esc(d.absenceNote||d.note||'')}</td></tr>`}).join('');
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
ensureHolidayYears();saveState();
document.querySelectorAll('.tabbar button').forEach(b=>b.addEventListener('click',()=>showScreen(b.dataset.screen)));
document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>setTimesView(b.dataset.view)));
document.querySelectorAll('[data-close]').forEach(button=>button.addEventListener('click',()=>requestCloseModal(button.dataset.close)));
document.querySelectorAll('.modal').forEach(modal=>modal.addEventListener('click',event=>{if(event.target===modal)requestCloseModal(modal.id)}));
document.addEventListener('keydown',event=>{trapModalFocus(event);if(event.key==='Escape'){const open=topOpenModal();if(open)requestCloseModal(open.id)}});
bindPunchButton($('punchAction'));
$('todayAbsenceEdit').addEventListener('click',()=>openAbsenceEditorForDay(todayKey(),'day'));
$('pauseToday').addEventListener('click',openPauseModal);$('savePauseBtn').addEventListener('click',saveQuickPause);$('quickAddBtn').addEventListener('click',()=>openQuickAdd(todayKey()));$('timesQuickAddBtn').addEventListener('click',()=>openQuickAdd(dateKey(cursorDate)));$('pastWorkdayNotice').addEventListener('click',openWorkdayIssues);
$('quickAbsenceStart').addEventListener('click',()=>openAbsenceTypePicker(quickContextDate));$('quickTimeStart').addEventListener('click',()=>openTimeAction(quickContextDate));$('quickCommentStart').addEventListener('click',()=>openCommentEditor(quickContextDate,'direct'));document.querySelectorAll('[data-simple-absence]').forEach(button=>button.addEventListener('click',()=>openQuickAbsence(button.dataset.simpleAbsence,quickContextDate)));$('quickAbsenceExtent').addEventListener('change',updateQuickAbsenceConflict);$('saveQuickAbsence').addEventListener('click',saveQuickAbsence);$('quickAbsenceFurther').addEventListener('click',openQuickAbsenceFurther);
['absenceType','absenceFrom','absenceTo','absenceExtent','absenceConflictPolicy'].forEach(id=>$(id).addEventListener('change',updateAbsenceSummary));$('absenceNote').addEventListener('input',updateAbsenceSummary);$('saveAbsenceBtn').addEventListener('click',saveAbsence);$('deleteAbsenceDayBtn').addEventListener('click',()=>deleteAbsenceFromModal('day'));$('deleteAbsenceGroupBtn').addEventListener('click',()=>deleteAbsenceFromModal('group'));
$('headerWeekendToggle')?.addEventListener('change',event=>{state.settings.showWeekends=event.target.checked;saveState();if(currentView==='day')renderDayView(dateKey(cursorDate));else if(currentView==='week')renderWeekView(dateKey(cursorDate))});$('addEntryBtn').addEventListener('click',addEditingEntry);$('saveDayBtn').addEventListener('click',saveEditedDay);$('dayNoteOpen').addEventListener('click',()=>openCommentEditor($('editDate').value,'dayEditor'));$('todayCommentRow').addEventListener('click',()=>openCommentEditor(todayKey(),'direct'));$('cancelCommentBtn').addEventListener('click',cancelCommentEditor);$('applyCommentBtn').addEventListener('click',applyCommentEditor);$('editNote').addEventListener('input',updateDayNoteSummary);$('saveSingleEntry').addEventListener('click',saveSingleEntry);$('deleteSingleEntry').addEventListener('click',deleteSingleEntry);$('openFullDayFromEntry').addEventListener('click',openFullDayFromSingleEntry);$('singleEntryActual').addEventListener('input',event=>{$('singleEntryLogged').value=roundLogged(event.target.value,$('singleEntryType').value)});$('singleEntryType').addEventListener('change',()=>{if($('singleEntryActual').value)$('singleEntryLogged').value=roundLogged($('singleEntryActual').value,$('singleEntryType').value)});$('saveManualQuick').addEventListener('click',saveManualQuick);$('manualFullEditor').addEventListener('click',openFullTodayEditor);$('manualActual').addEventListener('input',event=>{$('manualLogged').value=roundLogged(event.target.value,manualQuickType)});document.querySelectorAll('[data-time-info]').forEach(button=>button.addEventListener('click',()=>toggleTimeInfo(button.dataset.timeInfo)));$('continueEditingBtn').addEventListener('click',continueEditing);$('discardChangesBtn').addEventListener('click',discardChanges);$('advancedActions').addEventListener('toggle',()=>{if(!$('advancedActions').open)return;requestAnimationFrame(()=>{const scroll=$('dayModal').querySelector('.day-editor-scroll'),section=$('advancedActions');if(!scroll||!section)return;const targetBottom=section.offsetTop+section.offsetHeight,visibleBottom=scroll.scrollTop+scroll.clientHeight;if(targetBottom>visibleBottom)scroll.scrollTo({top:Math.max(0,targetBottom-scroll.clientHeight+18),behavior:'smooth'})})});$('deleteDayBtn').addEventListener('click',deleteEditedDay);$('restoreImportBtn').addEventListener('click',restoreImportedDay);$('manageAbsenceFromDay').addEventListener('click',manageAbsenceFromDayEditor);
$('dayReportBtn').addEventListener('click',()=>{const k=$('reportDay').value||todayKey();if(k>todayKey()){$('reportDay').value=todayKey();showToast('Tagesberichte sind nur bis heute möglich');return}dayReport(k)});
$('monthReportBtn').addEventListener('click',()=>openMobileReport('month'));
$('yearReportBtn').addEventListener('click',()=>openMobileReport('year'));
$('chartMonthMode').addEventListener('click',()=>setChartMode('month'));$('chartYearMode').addEventListener('click',()=>setChartMode('year'));$('chartHistoryMode').addEventListener('click',()=>setChartMode('history'));$('chartYear').addEventListener('change',()=>{chartSelection=null;renderOvertimeChart()});
$('closeMobileReport').addEventListener('click',closeMobileReport);$('mobileReportPrev').addEventListener('click',()=>shiftMobileReport(-1));$('mobileReportNext').addEventListener('click',()=>shiftMobileReport(1));$('mobileReportPrint').addEventListener('click',printMobileReport);$('mobileReportShare').addEventListener('click',shareMobileReportPdf);$('closePrintPreview').addEventListener('click',closePrintPreview);$('printReportBtn').addEventListener('click',printCurrentReport);
$('shareBackupBtn').addEventListener('click',sharePackage);$('fallbackJsonBtn').addEventListener('click',()=>downloadFallbackFile('json'));$('fallbackExcelBtn').addEventListener('click',()=>downloadFallbackFile('excel'));$('backupSuccessNo').addEventListener('click',cancelBackupSuccess);$('backupSuccessYes').addEventListener('click',confirmBackupSuccess);$('jsonRestoreBtn').addEventListener('click',()=>$('restoreFile').click());$('restoreFile').addEventListener('change',e=>restoreJSON(e.target.files[0]));
['employeeName','checkpointBalance','freeChristmasEve','freeNewYearsEve','countdownEnabled','bookingSoundEnabled','reportSignature'].forEach(id=>$(id).addEventListener('change',saveSettings));$('applyTargetRuleBtn').addEventListener('click',applyTargetRule);$('applyHolidayRegionBtn').addEventListener('click',applyHolidayRegionRule);$('targetValidFrom').addEventListener('change',syncTargetRuleInput);$('holidayRegionValidFrom').addEventListener('change',syncHolidayRegionInput);
updateClock();setInterval(updateClock,1000);window.addEventListener('resize',()=>{if(document.body.classList.contains('today-fixed')){renderTodayCapture(dayObject(todayKey()));updateCountdown({allowCelebrate:false})}});document.addEventListener('visibilitychange',()=>{if(!document.hidden&&document.body.classList.contains('today-fixed')){updateClock();updateCountdown()}});renderToday();
if('serviceWorker'in navigator&&location.protocol!=='file:')navigator.serviceWorker.register('./sw.js').catch(()=>{});
}
document.addEventListener('DOMContentLoaded',init);
document.addEventListener('DOMContentLoaded',()=>{if(storageNotice)setTimeout(()=>showToast(storageNotice),250)});

/* V5.30 – einheitliche Ein-Karten-Navigation und kompakte Einstellungen */
let dayCardDraft=null;
let dayCardOriginal=null;
let dayCardCurrent={view:'overview',params:{}};
let dayCardStack=[];
let dayCardFormBaseline='';
let dayCardConfirmState=null;
let dayCardRestoreForm=null;
let settingsCardView=null;
let settingsCardBaseline='';
let settingsCardConfirmState=null;
let settingsCardRestoreForm=null;
let pendingRestoreResult=null;

function cleanDayCardDraft(value){
  const out=clone(value||{});delete out.__deleteAll;return out;
}
function dayCardIsDirty(){
  if(!dayCardDraft||!dayCardOriginal)return false;
  return JSON.stringify(cleanDayCardDraft(dayCardDraft))!==JSON.stringify(cleanDayCardDraft(dayCardOriginal))||!!dayCardDraft.__deleteAll;
}
function dayCardFormSnapshot(){
  const view=dayCardCurrent?.view;
  if(view==='entry')return JSON.stringify({type:$('dayEntryType')?.value||'',actual:$('dayEntryActual')?.value||'',logged:$('dayEntryLogged')?.value||''});
  if(view==='pause')return JSON.stringify({pause:$('dayPauseMinutes')?.value||''});
  if(view==='absence')return JSON.stringify({type:$('dayAbsenceType')?.value||'',extent:$('dayAbsenceExtent')?.value||'',note:$('dayAbsenceNote')?.value||''});
  if(view==='comment')return JSON.stringify({note:$('dayCommentText')?.value||''});
  return'';
}
function dayCardSubviewDirty(){
  const snap=dayCardFormSnapshot();return !!snap&&!!dayCardFormBaseline&&snap!==dayCardFormBaseline;
}
function captureDayCardForm(){
  const view=dayCardCurrent?.view;
  if(view==='entry')return{type:$('dayEntryType')?.value||'',actual:$('dayEntryActual')?.value||'',logged:$('dayEntryLogged')?.value||''};
  if(view==='pause')return{pause:$('dayPauseMinutes')?.value||''};
  if(view==='absence')return{type:$('dayAbsenceType')?.value||'',extent:$('dayAbsenceExtent')?.value||'',note:$('dayAbsenceNote')?.value||''};
  if(view==='comment')return{note:$('dayCommentText')?.value||''};
  return null;
}
function restoreDayCardForm(data){
  if(!data)return;
  requestAnimationFrame(()=>{
    if($('dayEntryType'))$('dayEntryType').value=data.type;
    if($('dayEntryActual'))$('dayEntryActual').value=data.actual;
    if($('dayEntryLogged'))$('dayEntryLogged').value=data.logged;
    if($('dayPauseMinutes'))$('dayPauseMinutes').value=data.pause;
    if($('dayAbsenceType'))$('dayAbsenceType').value=data.type;
    if($('dayAbsenceExtent'))$('dayAbsenceExtent').value=data.extent;
    if($('dayAbsenceNote'))$('dayAbsenceNote').value=data.note;
    if($('dayCommentText'))$('dayCommentText').value=data.note;
    dayCardFormBaseline=dayCardFormSnapshot();
  });
}
function dayCardTitle(view){
  const entry=dayCardCurrent?.params?.index;
  if(view==='entry'){
    const existing=Number.isInteger(entry)&&entry>=0?dayCardDraft?.entries?.[entry]:null;
    const type=existing?.type||dayCardCurrent?.params?.type||'in';
    return existing?`${type==='in'?'Kommen':'Gehen'} bearbeiten`:'Buchung hinzufügen';
  }
  return({overview:'Tag bearbeiten',pause:'Pause bearbeiten',absence:'Abwesenheit bearbeiten',comment:'Kommentar bearbeiten',actions:'Weitere Aktionen',confirm:dayCardConfirmState?.title||'Bestätigen'})[view]||'Tag bearbeiten';
}
function dayCardSetFooter(html){
  $('dayCardFooter').innerHTML=html;
}
function dayCardNavigate(view,params={}){
  dayCardStack.push(dayCardCurrent);dayCardCurrent={view,params};renderDayCard();
}
function dayCardReturnToOverview(){dayCardCurrent={view:'overview',params:{}};dayCardStack=[];renderDayCard()}
function dayCardBack(force=false){
  if(!force&&dayCardSubviewDirty()){
    dayCardAskConfirm({title:'Eingaben verwerfen?',message:'Die noch nicht übernommenen Eingaben dieser Ansicht gehen verloren.',confirmLabel:'Verwerfen',onConfirm:()=>dayCardBack(true)});return;
  }
  dayCardCurrent=dayCardStack.pop()||{view:'overview',params:{}};renderDayCard();
}
function dayCardAskConfirm({title,message,confirmLabel='Bestätigen',danger=true,onConfirm}){
  dayCardConfirmState={title,message,confirmLabel,danger,onConfirm,returnCurrent:dayCardCurrent,returnStack:[...dayCardStack],form:captureDayCardForm()};
  dayCardCurrent={view:'confirm',params:{}};renderDayCard();
}
function dayCardCancelConfirm(){
  const state=dayCardConfirmState;if(!state)return;dayCardConfirmState=null;dayCardCurrent=state.returnCurrent;dayCardStack=state.returnStack;dayCardRestoreForm=state.form;renderDayCard();
}
function dayCardProceedConfirm(){
  const state=dayCardConfirmState;if(!state)return;dayCardConfirmState=null;state.onConfirm?.();
}
function dayCardEntryLabel(index){
  const entry=dayCardDraft.entries[index]||{};let no=0;for(let i=0;i<=index;i++)if((dayCardDraft.entries[i]?.type||'in')===(entry.type||'in'))no++;
  return `${entry.type==='out'?'Gehen':'Kommen'} ${no}`;
}
function dayCardAbsenceText(d=dayCardDraft){
  if(!d?.absence)return'Keine';
  const extent=absenceDuration(d)==='half'?' · halber Tag':'';return`${d.absence}${extent}`;
}
function renderDayOverview(){
  const entries=dayCardDraft.entries||[];
  const entryRows=entries.map((entry,index)=>`<button type="button" class="unified-list-row booking-disclosure" data-day-entry="${index}"><span class="unified-row-main"><b>${esc(dayCardEntryLabel(index))}</b><small>Tatsächlich ${esc(entry.actual||'–')} · Dokumentiert ${esc(entry.logged||'–')}</small></span><i aria-hidden="true">›</i></button>`).join('');
  const note=normalizeNoteText(dayCardDraft.note);
  $('dayCardBody').innerHTML=`
    <section class="unified-list-section" aria-labelledby="dayCardBookings"><h3 id="dayCardBookings">Buchungen</h3><div class="unified-list">${entryRows||'<div class="unified-empty-row">Keine Buchungen vorhanden</div>'}<button type="button" class="unified-list-row unified-add-row" id="dayAddEntry"><span class="unified-row-main"><b>Buchung hinzufügen</b><small>Kommen oder Gehen ergänzen</small></span><i aria-hidden="true">›</i></button></div></section>
    <section class="unified-list-section" aria-labelledby="dayCardDetails"><h3 id="dayCardDetails">Tagesangaben</h3><div class="unified-list">
      <button type="button" class="unified-list-row" data-day-route="pause"><span class="unified-row-main"><b>Pause</b><small>Manuelle Pausenzeit</small></span><span class="unified-row-end"><strong>${Math.max(0,Number(dayCardDraft.pauseMinutes)||0)} Min.</strong><i aria-hidden="true">›</i></span></button>
      <button type="button" class="unified-list-row" data-day-route="absence"><span class="unified-row-main"><b>Abwesenheit</b><small>${esc(dayCardDraft.absenceNote||'Einzelner ausgewählter Tag')}</small></span><span class="unified-row-end"><strong>${esc(dayCardAbsenceText())}</strong><i aria-hidden="true">›</i></span></button>
      <button type="button" class="unified-list-row" data-day-route="comment"><span class="unified-row-main"><b>Kommentar</b><small>${esc(note?notePreview(note,72):'Kein Kommentar')}</small></span><i aria-hidden="true">›</i></button>
    </div></section>
    <section class="unified-list-section"><div class="unified-list"><button type="button" class="unified-list-row" data-day-route="actions"><span class="unified-row-main"><b>Weitere Aktionen</b><small>Löschen oder Importdaten wiederherstellen</small></span><i aria-hidden="true">›</i></button></div></section>`;
  document.querySelectorAll('[data-day-entry]').forEach(button=>button.addEventListener('click',()=>dayCardNavigate('entry',{index:Number(button.dataset.dayEntry)})));
  $('dayAddEntry').addEventListener('click',()=>{const type=!entries.length||entries.at(-1)?.type==='out'?'in':'out';dayCardNavigate('entry',{index:-1,type})});
  document.querySelectorAll('[data-day-route]').forEach(button=>button.addEventListener('click',()=>dayCardNavigate(button.dataset.dayRoute)));
  dayCardSetFooter('<button type="button" class="cancel" id="dayCancelEdit">Abbrechen</button><button type="button" class="save" id="daySaveEdit">Tag speichern</button>');
  $('dayCancelEdit').addEventListener('click',requestDayCardClose);$('daySaveEdit').addEventListener('click',saveDayCard);
  dayCardFormBaseline='';
}
function renderDayEntry(){
  const index=Number(dayCardCurrent.params.index),existing=index>=0?dayCardDraft.entries[index]:null,type=existing?.type||dayCardCurrent.params.type||'in',actual=existing?.actual||hm(),logged=existing?.logged||roundLogged(actual,type);
  const origin=existing?(existing.source==='excel'?'Importiert':'Manuell'):'Neue manuelle Buchung';
  $('dayCardBody').innerHTML=`<div class="unified-form">
    <div class="context-date">${formatContextDate($('editDate').value)}</div>
    <div class="field"><label for="dayEntryType">Buchungsart</label><select id="dayEntryType"><option value="in" ${type==='in'?'selected':''}>Kommen</option><option value="out" ${type==='out'?'selected':''}>Gehen</option></select></div>
    <div class="unified-time-grid"><div class="field"><label for="dayEntryActual">Tatsächliche Uhrzeit</label><input id="dayEntryActual" type="time" value="${esc(actual)}"></div><div class="field"><label for="dayEntryLogged">Dokumentierte Uhrzeit</label><input id="dayEntryLogged" type="time" value="${esc(logged)}"></div></div>
    <div class="unified-origin"><b>Herkunft</b><span>${esc(origin)}</span></div>
    <div id="dayEntryError" class="unified-inline-error" role="alert" hidden></div>
    ${existing?'<button type="button" class="unified-danger-action" id="dayDeleteEntry">Buchung löschen</button>':''}
  </div>`;
  dayCardSetFooter('<button type="button" class="cancel" id="dayEntryCancel">Zurück</button><button type="button" class="save" id="dayEntryApply">Übernehmen</button>');
  const reround=()=>{const value=$('dayEntryActual').value;if(value)$('dayEntryLogged').value=roundLogged(value,$('dayEntryType').value)};
  $('dayEntryActual').addEventListener('input',reround);$('dayEntryType').addEventListener('change',reround);
  $('dayEntryCancel').addEventListener('click',()=>dayCardBack());$('dayEntryApply').addEventListener('click',applyDayEntry);
  $('dayDeleteEntry')?.addEventListener('click',()=>dayCardAskConfirm({title:'Buchung löschen?',message:'Die Buchung wird zunächst nur aus dem vorgemerkten Tageszustand entfernt. Dauerhaft gespeichert wird erst mit „Tag speichern“.',confirmLabel:'Buchung löschen',onConfirm:()=>{dayCardDraft.entries.splice(index,1);dayCardReturnToOverview()}}));
  dayCardFormBaseline=dayCardFormSnapshot();
}
function applyDayEntry(){
  const index=Number(dayCardCurrent.params.index),type=$('dayEntryType').value,actual=$('dayEntryActual').value,logged=$('dayEntryLogged').value,error=$('dayEntryError');
  if(!isClock(actual)||!isClock(logged)){error.hidden=false;error.textContent='Bitte beide Uhrzeiten vollständig und gültig eingeben.';return}
  if($('editDate').value===todayKey()&&minutes(actual)>minutes(hm())){error.hidden=false;error.textContent='Zukünftige Arbeitszeitbuchungen sind nicht zulässig.';return}
  const entries=clone(dayCardDraft.entries||[]),old=index>=0?entries[index]:null,unchanged=old&&old.type===type&&String(old.actual||'')===actual&&String(old.logged||'')===logged;
  const next=unchanged?old:{...(old||{}),type,actual,logged,source:'manual',createdAt:old?.createdAt||new Date().toISOString(),edited:true,editedAt:new Date().toISOString()};
  if(index>=0)entries[index]=next;else entries.push(next);
  const validation=validateDayEditorEntries(entries,$('editDate').value);if(!validation.valid){error.hidden=false;error.textContent=validation.errors.flat().filter(Boolean).join(' ')||'Die Buchungsfolge ist nicht plausibel.';return}
  dayCardDraft.entries=entries;dayCardReturnToOverview();
}
function renderDayPause(){
  $('dayCardBody').innerHTML=`<div class="unified-form"><div class="context-date">${formatContextDate($('editDate').value)}</div><div class="field"><label for="dayPauseMinutes">Pausenwert in Minuten</label><div class="stepper"><button type="button" id="dayPauseMinus" aria-label="Fünf Minuten abziehen">−</button><input id="dayPauseMinutes" type="number" min="0" step="1" inputmode="numeric" value="${Math.max(0,Number(dayCardDraft.pauseMinutes)||0)}"><button type="button" id="dayPausePlus" aria-label="Fünf Minuten hinzufügen">+</button></div></div><p class="unified-help">Der Wert kann nicht negativ sein. Die bestehende Pausenberechnung bleibt unverändert.</p></div>`;
  dayCardSetFooter('<button type="button" class="cancel" id="dayPauseCancel">Zurück</button><button type="button" class="save" id="dayPauseApply">Übernehmen</button>');
  const adjust=n=>{$('dayPauseMinutes').value=String(Math.max(0,(Number($('dayPauseMinutes').value)||0)+n))};$('dayPauseMinus').addEventListener('click',()=>adjust(-5));$('dayPausePlus').addEventListener('click',()=>adjust(5));$('dayPauseCancel').addEventListener('click',()=>dayCardBack());$('dayPauseApply').addEventListener('click',()=>{dayCardDraft.pauseMinutes=Math.max(0,Math.round(Number($('dayPauseMinutes').value)||0));dayCardReturnToOverview()});dayCardFormBaseline=dayCardFormSnapshot();
}
function renderDayAbsence(){
  const currentCode=dayAbsenceCode(dayCardDraft)||'none';
  if(currentCode==='holiday'){
    $('dayCardBody').innerHTML=`<div class="unified-info-state"><div class="context-date">${formatContextDate($('editDate').value)}</div><h3>${esc(dayCardDraft.holiday||'Feiertag')}</h3><p>Dieser gesetzliche oder betriebliche Feiertag wird aus den gültigen Einstellungen abgeleitet und kann im Tageseditor nicht geändert werden.</p></div>`;
    dayCardSetFooter('<button type="button" class="cancel single-footer-action" id="dayAbsenceBack">Zurück</button>');$('dayAbsenceBack').addEventListener('click',()=>dayCardBack(true));dayCardFormBaseline='';return;
  }
  $('dayCardBody').innerHTML=`<div class="unified-form"><div class="context-date">${formatContextDate($('editDate').value)}</div>
    <div class="field"><label for="dayAbsenceType">Art der Abwesenheit</label><select id="dayAbsenceType"><option value="none">Keine Abwesenheit</option><option value="vacation">Urlaub</option><option value="sick">Krankheit</option><option value="timeOff">Zeitausgleich</option><option value="other">Sonstige Abwesenheit</option></select></div>
    <div class="field"><label for="dayAbsenceExtent">Umfang</label><select id="dayAbsenceExtent"><option value="full">Ganzer Tag</option><option value="half">Halber Tag</option></select></div>
    <div class="field"><label for="dayAbsenceNote">Optionale Notiz</label><textarea id="dayAbsenceNote" rows="3" placeholder="Notiz zur Abwesenheit">${esc(dayCardDraft.absenceNote||'')}</textarea></div>
    <div id="dayAbsenceError" class="unified-inline-error" role="alert" hidden></div><p class="unified-help">Diese Bearbeitung gilt ausschließlich für den ausgewählten Tag. Zeiträume werden weiterhin über den gesonderten Abwesenheitsweg erfasst.</p></div>`;
  $('dayAbsenceType').value=currentCode;$('dayAbsenceExtent').value=absenceDuration(dayCardDraft)==='half'?'half':'full';
  dayCardSetFooter('<button type="button" class="cancel" id="dayAbsenceCancel">Zurück</button><button type="button" class="save" id="dayAbsenceApply">Übernehmen</button>');$('dayAbsenceCancel').addEventListener('click',()=>dayCardBack());$('dayAbsenceApply').addEventListener('click',applyDayAbsence);dayCardFormBaseline=dayCardFormSnapshot();
}
function applyDayAbsence(){
  const code=$('dayAbsenceType').value,extent=$('dayAbsenceExtent').value,note=$('dayAbsenceNote').value.trim(),error=$('dayAbsenceError');
  if(code!=='none'&&extent==='full'&&(dayCardDraft.entries||[]).length){error.hidden=false;error.textContent='Eine ganztägige Abwesenheit kann nicht zusammen mit Arbeitszeitbuchungen gespeichert werden. Entferne die Buchungen oder wähle einen halben Tag.';return}
  if(code==='none'){clearAbsenceFields(dayCardDraft)}else{
    const unchanged=dayAbsenceCode(dayCardDraft)===code&&absenceDuration(dayCardDraft)===extent&&String(dayCardDraft.absenceNote||'')===note;
    dayCardDraft.absence=absenceLabel(code);dayCardDraft.absenceCode=code;dayCardDraft.absenceDuration=extent;dayCardDraft.absenceNote=note;delete dayCardDraft.absenceMinutes;
    if(!unchanged){delete dayCardDraft.absenceGroupId;dayCardDraft.absenceUpdatedAt=new Date().toISOString();dayCardDraft.absenceCreatedAt=dayCardDraft.absenceCreatedAt||dayCardDraft.absenceUpdatedAt}
  }
  dayCardReturnToOverview();
}
function renderDayComment(){
  $('dayCardBody').innerHTML=`<div class="unified-form"><div class="context-date">${formatContextDate($('editDate').value)}</div><div class="field"><label for="dayCommentText">Kommentar</label><textarea id="dayCommentText" class="day-comment-textarea" rows="7" placeholder="Kommentar für diesen Tag">${esc(dayCardDraft.note||'')}</textarea></div><p class="unified-help">Ein leeres Feld entfernt den Kommentar. Dauerhaft gespeichert wird erst mit „Tag speichern“.</p></div>`;
  dayCardSetFooter('<button type="button" class="cancel" id="dayCommentCancel">Zurück</button><button type="button" class="save" id="dayCommentApply">Übernehmen</button>');$('dayCommentCancel').addEventListener('click',()=>dayCardBack());$('dayCommentApply').addEventListener('click',()=>{dayCardDraft.note=$('dayCommentText').value.trim();dayCardReturnToOverview()});dayCardFormBaseline=dayCardFormSnapshot();setTimeout(()=>$('dayCommentText')?.focus(),30);
}
function renderDayActions(){
  const hasBookings=(dayCardDraft.entries||[]).length||Number(dayCardDraft.pauseMinutes),hasAnything=hasMeaningfulData(cleanDayCardDraft(dayCardDraft)),hasImport=!!IMPORTED_BY_DATE[$('editDate').value];
  $('dayCardBody').innerHTML=`<div class="unified-action-list"><div class="context-date">${formatContextDate($('editDate').value)}</div>
    <button type="button" class="unified-secondary-action" id="dayClearBookings" ${hasBookings?'':'disabled'}><b>Buchungen und Pause löschen</b><small>Abwesenheit und Kommentar bleiben erhalten</small></button>
    <button type="button" class="unified-danger-action" id="dayDeleteAll" ${hasAnything?'':'disabled'}><b>Tag vollständig löschen</b><small>Alle Tagesdaten werden entfernt</small></button>
    <button type="button" class="unified-secondary-action" id="dayRestoreImport" ${hasImport?'':'disabled'}><b>Importdaten wiederherstellen</b><small>Ursprünglichen eingebetteten Datenstand vormerken</small></button>
    ${!hasBookings&&!hasAnything&&!hasImport?'<p class="unified-help">Für diesen Tag sind keine weiteren Aktionen verfügbar.</p>':''}</div>`;
  dayCardSetFooter('<button type="button" class="cancel single-footer-action" id="dayActionsBack">Zurück</button>');$('dayActionsBack').addEventListener('click',()=>dayCardBack(true));
  $('dayClearBookings').addEventListener('click',()=>dayCardAskConfirm({title:'Buchungen und Pause löschen?',message:'Abwesenheit und Kommentar bleiben erhalten. Die Änderung wird erst mit „Tag speichern“ dauerhaft.',confirmLabel:'Löschen',onConfirm:()=>{dayCardDraft.entries=[];dayCardDraft.pauseMinutes=0;if(IMPORTED_BY_DATE[$('editDate').value])dayCardDraft.importCleared=true;dayCardReturnToOverview()}}));
  $('dayDeleteAll').addEventListener('click',()=>dayCardAskConfirm({title:'Tag vollständig löschen?',message:'Alle Buchungen, Pausen, Abwesenheiten und Kommentare dieses Tages werden entfernt. Dieser Vorgang wird erst mit „Tag speichern“ endgültig.',confirmLabel:'Tag löschen',onConfirm:()=>{const key=$('editDate').value;dayCardDraft={date:key,entries:[],pauseMinutes:0,absence:null,absenceCode:null,note:'',holiday:null,absenceNote:'',edited:true,importCleared:!!IMPORTED_BY_DATE[key],__deleteAll:true};dayCardReturnToOverview()}}));
  $('dayRestoreImport').addEventListener('click',()=>dayCardAskConfirm({title:'Importdaten wiederherstellen?',message:'Alle vorgemerkten lokalen Änderungen dieses Tages werden durch die ursprünglichen Importdaten ersetzt.',confirmLabel:'Wiederherstellen',danger:false,onConfirm:()=>{dayCardDraft=clone(IMPORTED_BY_DATE[$('editDate').value]);dayCardReturnToOverview()}}));dayCardFormBaseline='';
}
function renderDayConfirm(){
  const state=dayCardConfirmState;$('dayCardBody').innerHTML=`<div class="unified-confirm-state"><div class="unified-confirm-icon ${state?.danger?'danger':''}" aria-hidden="true">${state?.danger?'!':'✓'}</div><p>${esc(state?.message||'')}</p></div>`;
  dayCardSetFooter(`<button type="button" class="cancel" id="dayConfirmCancel">Abbrechen</button><button type="button" class="${state?.danger?'danger-button':'save'}" id="dayConfirmProceed">${esc(state?.confirmLabel||'Bestätigen')}</button>`);$('dayConfirmCancel').addEventListener('click',dayCardCancelConfirm);$('dayConfirmProceed').addEventListener('click',dayCardProceedConfirm);dayCardFormBaseline='';
}
function renderDayCard(){
  if(!$('dayModal')?.classList.contains('open')&&!dayCardDraft)return;
  const view=dayCardCurrent.view;$('dayModalTitle').textContent=dayCardTitle(view);$('dayModalContext').textContent=formatContextDate($('editDate').value);$('dayCardBack').hidden=view==='overview'||view==='confirm';
  if(view==='overview')renderDayOverview();else if(view==='entry')renderDayEntry();else if(view==='pause')renderDayPause();else if(view==='absence')renderDayAbsence();else if(view==='comment')renderDayComment();else if(view==='actions')renderDayActions();else if(view==='confirm')renderDayConfirm();
  if(dayCardRestoreForm){const form=dayCardRestoreForm;dayCardRestoreForm=null;restoreDayCardForm(form)}
  requestAnimationFrame(()=>$('dayCardBody')?.scrollTo({top:0}));
}
function openDayEditor(k){
  const d=clone(dayObject(k));dayCardOriginal=d;dayCardDraft=clone(d);dayCardCurrent={view:'overview',params:{}};dayCardStack=[];dayCardConfirmState=null;$('editDate').value=k;$('dayModalContext').textContent=formatContextDate(k);openModal('dayModal');renderDayCard();
}
function requestDayCardClose(){
  if(dayCardCurrent.view==='confirm'){dayCardCancelConfirm();return}
  const dirty=dayCardIsDirty()||dayCardSubviewDirty();if(dirty){dayCardAskConfirm({title:'Änderungen verwerfen?',message:'Alle noch nicht mit „Tag speichern“ gesicherten Änderungen gehen verloren.',confirmLabel:'Verwerfen',onConfirm:()=>{dayCardDraft=null;dayCardOriginal=null;closeModal('dayModal')}});return}
  dayCardDraft=null;dayCardOriginal=null;closeModal('dayModal');
}
function saveDayCard(){
  const key=$('editDate').value;if(!dayCardDraft||!key)return;
  const candidate=cleanDayCardDraft(dayCardDraft),validation=validateDayEditorEntries(candidate.entries||[],key);if(!validation.valid){showToast('Buchungsfolge prüfen');const first=validation.errors.findIndex(x=>x.length);dayCardNavigate('entry',{index:Math.max(0,first)});return}
  if(dayAbsenceCode(candidate)!=='holiday'&&candidate.absence&&absenceDuration(candidate)==='full'&&(candidate.entries||[]).length){showToast('Ganztägige Abwesenheit und Buchungen können nicht gemeinsam gespeichert werden');dayCardNavigate('absence');return}
  if(!dayCardIsDirty()){dayCardDraft=null;dayCardOriginal=null;closeModal('dayModal');refreshAllDerivedViews();showToast('Keine Änderungen vorhanden.');return}
  const originalImport=IMPORTED_BY_DATE[key];
  if(dayCardDraft.__deleteAll){
    if(originalImport)state.days[key]={date:key,entries:[],pauseMinutes:0,absence:null,absenceCode:null,note:'',holiday:null,absenceNote:'',edited:true,importCleared:true,modifiedAt:new Date().toISOString(),archived:Number(key.slice(0,4))<new Date().getFullYear()};else delete state.days[key];
  }else if(originalImport&&JSON.stringify(candidate)===JSON.stringify(originalImport))state.days[key]=clone(originalImport);else{
    candidate.date=key;candidate.edited=true;candidate.modifiedAt=new Date().toISOString();candidate.archived=Number(key.slice(0,4))<new Date().getFullYear();state.days[key]=candidate;
  }
  cursorDate=parseDateKey(key);touchDay(key);dayCardDraft=null;dayCardOriginal=null;closeModal('dayModal');refreshAllDerivedViews();showToast('Tag gespeichert. Tagessaldo und Zeitkonto wurden aktualisiert.');
}
function saveEditedDay(){saveDayCard()}
function deleteEditedDay(){dayCardNavigate('actions')}
function restoreImportedDay(){dayCardNavigate('actions')}
function manageAbsenceFromDayEditor(){dayCardNavigate('absence')}
function addEditingEntry(){const entries=dayCardDraft?.entries||[],type=!entries.length||entries.at(-1)?.type==='out'?'in':'out';dayCardNavigate('entry',{index:-1,type})}

function effectiveTargetRuleToday(){return effectiveRule(normalizeTargetRules(state.settings.targetRules),todayKey())||{from:TRACKING_START_DATE,minutes:480}}
function effectiveRegionRuleToday(){return effectiveRule(normalizeHolidayRegionRules(state.settings.holidayRegionRules),todayKey())||{from:TRACKING_START_DATE,region:'HE'}}
function renderSettings(){
  $('employeeName').value=state.settings.employeeName||'';$('checkpointBalance').value=formatDuration(state.settings.startBalanceMinutes||0);$('freeChristmasEve').checked=state.settings.freeChristmasEve!==false;$('freeNewYearsEve').checked=state.settings.freeNewYearsEve!==false;$('countdownEnabled').checked=state.settings.countdownEnabled!==false;$('bookingSoundEnabled').checked=state.settings.bookingSoundEnabled===true;$('reportSignature').checked=state.settings.reportSignature!==false;
  const target=effectiveTargetRuleToday(),region=effectiveRegionRuleToday();$('targetCurrentValue').textContent=`${formatDuration(target.minutes,{signed:false})} h`;$('targetCurrentSince').textContent=`Gültig seit ${formatDate(target.from,{day:'2-digit',month:'2-digit',year:'numeric'})}`;$('holidayRegionCurrentValue').textContent=HOLIDAY_REGIONS[region.region];$('holidayRegionCurrentSince').textContent=`Gültig seit ${formatDate(region.from,{day:'2-digit',month:'2-digit',year:'numeric'})}`;$('lastExternalBackup').textContent=formatExternalBackup(state.settings.lastExternalBackupAt);$('appVersion').textContent=`Version ${APP_VERSION}`;
}
function saveSettings(){
  const startBalance=parseSignedTime($('checkpointBalance').value);if(startBalance===null){showToast('Startwert im Format +HH:MM mit Minuten von 00 bis 59 eingeben');$('checkpointBalance').value=formatDuration(state.settings.startBalanceMinutes||0);return}
  state.settings.employeeName=$('employeeName').value.trim();state.settings.startBalanceMinutes=startBalance;state.settings.trackingStartDate=TRACKING_START_DATE;state.settings.calculationVersion=CALCULATION_VERSION;state.settings.freeChristmasEve=$('freeChristmasEve').checked;state.settings.freeNewYearsEve=$('freeNewYearsEve').checked;state.settings.countdownEnabled=$('countdownEnabled').checked;state.settings.bookingSoundEnabled=$('bookingSoundEnabled').checked;state.settings.reportSignature=$('reportSignature').checked;state.settings.targetMinutes=targetMinutesFromSettings(todayKey(),state.settings);state.settings.holidayRegion=holidayRegionFromSettings(todayKey(),state.settings);ensureHolidayYears();saveState();refreshAllDerivedViews();if(!state.settings.countdownEnabled)stopConfetti();showToast('Einstellungen gespeichert');
}
function settingsCardFormSnapshot(){
  if(settingsCardView==='target')return JSON.stringify({hours:$('settingsTargetHours')?.value||'',from:$('settingsTargetFrom')?.value||''});
  if(settingsCardView==='region')return JSON.stringify({region:$('settingsRegionValue')?.value||'',from:$('settingsRegionFrom')?.value||''});return'';
}
function settingsCardDirty(){const snap=settingsCardFormSnapshot();return !!snap&&!!settingsCardBaseline&&snap!==settingsCardBaseline}
function openSettingsCard(view){settingsCardView=view;settingsCardConfirmState=null;openModal('settingsModal');renderSettingsCard()}
function settingsCardFooter(html){$('settingsCardFooter').innerHTML=html}
function renderSettingsCard(){
  $('settingsCardBack').hidden=true;$('settingsModalContext').textContent='';
  if(settingsCardView==='target')renderSettingsTarget();else if(settingsCardView==='region')renderSettingsRegion();else if(settingsCardView==='offline')renderSettingsOffline();else if(settingsCardView==='confirm')renderSettingsConfirm();
  if(settingsCardRestoreForm){const data=settingsCardRestoreForm;settingsCardRestoreForm=null;requestAnimationFrame(()=>{if($('settingsTargetHours'))$('settingsTargetHours').value=data.hours;if($('settingsTargetFrom'))$('settingsTargetFrom').value=data.from;if($('settingsRegionValue'))$('settingsRegionValue').value=data.region;if($('settingsRegionFrom'))$('settingsRegionFrom').value=data.from;settingsCardBaseline=settingsCardFormSnapshot()})}
}
function renderSettingsTarget(){
  const current=effectiveTargetRuleToday();$('settingsModalTitle').textContent='Sollzeit bearbeiten';$('settingsModalContext').textContent=`Aktuell ${formatDuration(current.minutes,{signed:false})} h seit ${formatDate(current.from,{day:'2-digit',month:'2-digit',year:'numeric'})}`;
  $('settingsCardBody').innerHTML=`<div class="unified-form"><div class="field"><label for="settingsTargetHours">Neue Sollzeit</label><input id="settingsTargetHours" type="time" value="${clockFromMinutes(current.minutes)}"></div><div class="field"><label for="settingsTargetFrom">Gültig ab</label><input id="settingsTargetFrom" type="date" min="${TRACKING_START_DATE}" value="${todayKey()}"></div><div id="settingsCardError" class="unified-inline-error" hidden role="alert"></div><div class="unified-rule-note"><b>Historische Grundregel</b><p>Seit dem 01.11.2022 beträgt die Grundsollzeit verbindlich 8:00 Stunden. Frühere Excel-Werte von 7:48 Stunden werden nicht übernommen. Eine neue Sollzeit gilt erst ab dem ausdrücklich gewählten Datum.</p></div></div>`;
  settingsCardFooter('<button type="button" class="cancel" id="settingsTargetCancel">Abbrechen</button><button type="button" class="save" id="settingsTargetApply">Übernehmen</button>');$('settingsTargetCancel').addEventListener('click',requestSettingsCardClose);$('settingsTargetApply').addEventListener('click',applyTargetRule);settingsCardBaseline=settingsCardFormSnapshot();
}
function renderSettingsRegion(){
  const current=effectiveRegionRuleToday(),options=Object.entries(HOLIDAY_REGIONS).map(([key,label])=>`<option value="${key}" ${key===current.region?'selected':''}>${esc(label)}</option>`).join('');$('settingsModalTitle').textContent='Bundesland bearbeiten';$('settingsModalContext').textContent=`Aktuell ${HOLIDAY_REGIONS[current.region]} seit ${formatDate(current.from,{day:'2-digit',month:'2-digit',year:'numeric'})}`;
  $('settingsCardBody').innerHTML=`<div class="unified-form"><div class="field"><label for="settingsRegionValue">Bundesland</label><select id="settingsRegionValue">${options}</select></div><div class="field"><label for="settingsRegionFrom">Gültig ab</label><input id="settingsRegionFrom" type="date" min="${TRACKING_START_DATE}" value="${todayKey()}"></div><div id="settingsCardError" class="unified-inline-error" hidden role="alert"></div><div class="unified-rule-note"><b>Feiertagsberechnung</b><p>Gesetzliche Feiertage werden vollständig offline aus dem ab diesem Datum gültigen Bundesland abgeleitet. Betriebliche Feiertage bleiben unabhängig davon erhalten. Frühere Zeiträume werden nicht verändert.</p></div></div>`;
  settingsCardFooter('<button type="button" class="cancel" id="settingsRegionCancel">Abbrechen</button><button type="button" class="save" id="settingsRegionApply">Übernehmen</button>');$('settingsRegionCancel').addEventListener('click',requestSettingsCardClose);$('settingsRegionApply').addEventListener('click',applyHolidayRegionRule);settingsCardBaseline=settingsCardFormSnapshot();
}
function renderSettingsOffline(){
  $('settingsModalTitle').textContent='Offline-Nutzung';$('settingsModalContext').textContent='Installation und lokaler Datenspeicher';$('settingsCardBody').innerHTML='<div class="unified-info-state"><h3>Vollständig offline nutzbar</h3><p>Die App speichert Arbeitszeitdaten ausschließlich lokal auf diesem Gerät. In Safari kann sie über „Teilen“ und „Zum Home-Bildschirm“ installiert werden. Für Erfassung, Auswertung, PDF, JSON und Excel ist keine Internetverbindung erforderlich.</p><p>Bestehende Daten werden über den unveränderten lokalen Speicherschlüssel weiterverwendet.</p></div>';settingsCardFooter('<button type="button" class="cancel single-footer-action" id="settingsOfflineClose">Schließen</button>');$('settingsOfflineClose').addEventListener('click',()=>closeModal('settingsModal'));settingsCardBaseline='';
}
function settingsAskConfirm({title,message,confirmLabel='Übernehmen',onConfirm,returnView,form,danger=false}){
  settingsCardConfirmState={title,message,confirmLabel,onConfirm,returnView,form,danger};settingsCardView='confirm';renderSettingsCard();
}
function renderSettingsConfirm(){
  const state=settingsCardConfirmState;$('settingsModalTitle').textContent=state.title;$('settingsModalContext').textContent='Bitte bewusst bestätigen';$('settingsCardBody').innerHTML=`<div class="unified-confirm-state"><div class="unified-confirm-icon ${state.danger?'danger':''}" aria-hidden="true">!</div><p>${esc(state.message)}</p></div>`;settingsCardFooter(`<button type="button" class="cancel" id="settingsConfirmCancel">Abbrechen</button><button type="button" class="${state.danger?'danger-button':'save'}" id="settingsConfirmProceed">${esc(state.confirmLabel)}</button>`);$('settingsConfirmCancel').addEventListener('click',()=>{settingsCardView=state.returnView;settingsCardRestoreForm=state.form;settingsCardConfirmState=null;renderSettingsCard()});$('settingsConfirmProceed').addEventListener('click',()=>{const fn=state.onConfirm;settingsCardConfirmState=null;fn?.()});settingsCardBaseline='';
}
function requestSettingsCardClose(){
  if(settingsCardView==='confirm'){const state=settingsCardConfirmState;settingsCardView=state.returnView;settingsCardRestoreForm=state.form;settingsCardConfirmState=null;renderSettingsCard();return}
  if(settingsCardDirty()){
    const view=settingsCardView,form=view==='target'?{hours:$('settingsTargetHours').value,from:$('settingsTargetFrom').value}:{region:$('settingsRegionValue').value,from:$('settingsRegionFrom').value};settingsAskConfirm({title:'Eingaben verwerfen?',message:'Die noch nicht übernommenen Änderungen gehen verloren.',confirmLabel:'Verwerfen',danger:true,returnView:view,form,onConfirm:()=>closeModal('settingsModal')});return;
  }
  closeModal('settingsModal');
}
function commitTargetRule(from,newMinutes){
  state.settings.targetRules=upsertEffectiveRule(normalizeTargetRules(state.settings.targetRules),{from,minutes:newMinutes});state.settings.targetMinutes=targetMinutesFromSettings(todayKey(),state.settings);saveState();refreshAllDerivedViews();renderSettings();closeModal('settingsModal');showToast(`Sollzeit ab ${formatDate(from,{day:'2-digit',month:'2-digit',year:'numeric'})} gespeichert`);
}
function applyTargetRule(){
  const from=$('settingsTargetFrom')?.value||$('targetValidFrom')?.value,value=$('settingsTargetHours')?.value||$('targetHours')?.value,newMinutes=minutes(value),error=$('settingsCardError');
  if(!isDateKey(from)||from<TRACKING_START_DATE){if(error){error.hidden=false;error.textContent='Gültigkeitsdatum ab 01.11.2022 wählen.'}else showToast('Gültigkeitsdatum prüfen');return}
  if(!isClock(value)||newMinutes<=0){if(error){error.hidden=false;error.textContent='Gültige tägliche Sollzeit eingeben.'}else showToast('Sollzeit prüfen');return}
  if(from===TRACKING_START_DATE&&newMinutes!==480){error.hidden=false;error.textContent='Die verbindliche Grundsollzeit ab 01.11.2022 bleibt 8:00 Stunden. Wähle für eine spätere Änderung ein späteres Gültigkeitsdatum.';return}
  const exact=normalizeTargetRules(state.settings.targetRules).some(r=>r.from===from&&r.minutes===newMinutes);if(exact){error.hidden=false;error.textContent='Diese Sollzeitregel besteht bereits.';return}
  const form={hours:value,from},message=`Sollzeit ab ${formatDate(from,{day:'2-digit',month:'2-digit',year:'numeric'})} auf ${formatDuration(newMinutes,{signed:false})} Stunden ändern? Frühere Zeiträume bleiben unverändert.`;
  if(from<=todayKey()){settingsAskConfirm({title:'Rückwirkende Sollzeit bestätigen',message,confirmLabel:'Sollzeit übernehmen',returnView:'target',form,onConfirm:()=>commitTargetRule(from,newMinutes)});return}commitTargetRule(from,newMinutes);
}
function commitRegionRule(from,region){
  state.settings.holidayRegionRules=upsertEffectiveRule(normalizeHolidayRegionRules(state.settings.holidayRegionRules),{from,region});state.settings.holidayRegion=holidayRegionFromSettings(todayKey(),state.settings);ensureHolidayYears(Number(from.slice(0,4)),new Date().getFullYear()+1);saveState();refreshAllDerivedViews();renderSettings();closeModal('settingsModal');showToast(`Feiertagsregion ab ${formatDate(from,{day:'2-digit',month:'2-digit',year:'numeric'})} gespeichert`);
}
function applyHolidayRegionRule(){
  const from=$('settingsRegionFrom')?.value||$('holidayRegionValidFrom')?.value,region=$('settingsRegionValue')?.value||$('holidayRegion')?.value,error=$('settingsCardError');
  if(!isDateKey(from)||from<TRACKING_START_DATE||!HOLIDAY_REGIONS[region]){if(error){error.hidden=false;error.textContent='Bundesland und Gültigkeitsdatum prüfen.'}else showToast('Bundeslandregel prüfen');return}
  if(from===TRACKING_START_DATE&&region!=='HE'){error.hidden=false;error.textContent='Der verbindliche Ausgangswert ab 01.11.2022 bleibt Hessen. Wähle für einen späteren Wechsel ein späteres Gültigkeitsdatum.';return}
  const exact=normalizeHolidayRegionRules(state.settings.holidayRegionRules).some(r=>r.from===from&&r.region===region);if(exact){error.hidden=false;error.textContent='Diese Bundeslandregel besteht bereits.';return}
  const form={region,from},message=`Bundesland ab ${formatDate(from,{day:'2-digit',month:'2-digit',year:'numeric'})} auf ${HOLIDAY_REGIONS[region]} ändern? Gesetzliche Feiertage und Zeitkonto werden erst ab diesem Datum neu berechnet.`;
  if(from<=todayKey()){settingsAskConfirm({title:'Rückwirkendes Bundesland bestätigen',message,confirmLabel:'Bundesland übernehmen',returnView:'region',form,onConfirm:()=>commitRegionRule(from,region)});return}commitRegionRule(from,region);
}
function syncTargetRuleInput(){const date=$('targetValidFrom')?.value||todayKey();if($('targetHours'))$('targetHours').value=clockFromMinutes(targetMinutesFromSettings(date,state.settings))}
function syncHolidayRegionInput(){const date=$('holidayRegionValidFrom')?.value||todayKey();if($('holidayRegion'))$('holidayRegion').value=holidayRegionFromSettings(date,state.settings)}

function restoreJSON(file){
  if(!file)return;const reader=new FileReader();reader.onload=()=>{try{
    pendingRestoreResult=validateBackupEnvelope(JSON.parse(reader.result));const stamp=pendingRestoreResult.meta.exportedAt?new Intl.DateTimeFormat('de-DE',{dateStyle:'medium',timeStyle:'short'}).format(new Date(pendingRestoreResult.meta.exportedAt)):'unbekannt';
    $('restoreConfirmBody').innerHTML=`<div class="restore-summary"><div><span>Sicherungsdatum</span><b>${esc(stamp)}</b></div><div><span>App-Version</span><b>${esc(pendingRestoreResult.meta.appVersion)}</b></div><div><span>Kalendertage</span><b>${pendingRestoreResult.meta.days}</b></div><div><span>Buchungen</span><b>${pendingRestoreResult.meta.entries}</b></div></div><p class="unified-help">Vor dem Überschreiben wird automatisch eine separate JSON-Sicherheitskopie des aktuellen Stands erzeugt.</p>`;openModal('restoreConfirmModal');
  }catch(e){alert(`Sicherung konnte nicht wiederhergestellt werden: ${e.message||'ungültige Datei'}`);$('restoreFile').value=''}};reader.onerror=()=>{alert('Die Datei konnte nicht gelesen werden.');$('restoreFile').value=''};reader.readAsText(file);
}
function cancelRestore(){pendingRestoreResult=null;if($('restoreFile'))$('restoreFile').value='';closeModal('restoreConfirmModal')}
function proceedRestore(){
  if(!pendingRestoreResult)return;try{const safety=createBackupFile();downloadBlob(safety.name.replace('.json','_vor_Wiederherstellung.json'),safety);state=migrateState(pendingRestoreResult.state);if(!saveState())throw new Error('Speichern fehlgeschlagen');pendingRestoreResult=null;closeModal('restoreConfirmModal');refreshAllDerivedViews();showToast('Sicherung wiederhergestellt');setTimeout(()=>location.reload(),500)}catch(e){alert(`Sicherung konnte nicht wiederhergestellt werden: ${e.message||'ungültige Datei'}`)}finally{if($('restoreFile'))$('restoreFile').value=''}
}

function removeInlineModalConfirm(id){const modal=$(id),sheet=modal?.querySelector('.sheet');sheet?.classList.remove('inline-confirm-active');sheet?.querySelector('.inline-card-confirm')?.remove()}
function showInlineModalConfirm(id,title,message,confirmLabel,onConfirm){
  const modal=$(id),sheet=modal?.querySelector('.sheet');if(!sheet)return;removeInlineModalConfirm(id);sheet.classList.add('inline-confirm-active');const panel=document.createElement('div');panel.className='inline-card-confirm';panel.innerHTML=`<div class="unified-card-head"><span class="unified-card-head-spacer"></span><div class="unified-card-title-wrap"><h2>${esc(title)}</h2></div><span class="unified-card-head-spacer"></span></div><div class="unified-card-body"><div class="unified-confirm-state"><div class="unified-confirm-icon danger">!</div><p>${esc(message)}</p></div></div><div class="unified-card-footer"><button type="button" class="cancel" data-inline-cancel>Weiter bearbeiten</button><button type="button" class="danger-button" data-inline-confirm>${esc(confirmLabel)}</button></div>`;sheet.appendChild(panel);panel.querySelector('[data-inline-cancel]').addEventListener('click',()=>{removeInlineModalConfirm(id);modalFocusable(modal)[0]?.focus()});panel.querySelector('[data-inline-confirm]').addEventListener('click',()=>{removeInlineModalConfirm(id);onConfirm?.()});panel.querySelector('[data-inline-cancel]').focus();
}
function modalSnapshot(id){
  const modal=$(id);if(!modal)return'';if(id==='dayModal')return JSON.stringify({draft:cleanDayCardDraft(dayCardDraft),view:dayCardCurrent?.view,form:dayCardFormSnapshot()});if(id==='settingsModal')return settingsCardFormSnapshot();
  const values=[...modal.querySelectorAll('input,select,textarea')].map(element=>({id:element.id||element.name||element.type,type:element.type,value:element.type==='checkbox'?element.checked:element.value}));return JSON.stringify(values);
}
function isModalDirty(id){if(id==='dayModal')return dayCardIsDirty()||dayCardSubviewDirty();if(id==='settingsModal')return settingsCardDirty();return guardedModalIds.has(id)&&modalBaselines.has(id)&&modalBaselines.get(id)!==modalSnapshot(id)}
function openModal(id){
  const modal=$(id);if(!modal)return;document.querySelectorAll('.modal.open').forEach(other=>{if(other!==modal){other.classList.remove('open');removeInlineModalConfirm(other.id);modalBaselines.delete(other.id)}});if(!modal.classList.contains('open'))modalFocusOrigins.set(id,document.activeElement);modal.classList.add('open');document.body.classList.add('modal-open');modalBaselines.set(id,modalSnapshot(id));updateDayQuickButton();setTimeout(()=>{const target=modal.querySelector('.unified-card-back:not([hidden]),.close-btn,button,input,select,textarea');target?.focus()},50);
}
function closeModal(id){
  const modal=$(id);if(!modal)return;removeInlineModalConfirm(id);modal.classList.remove('open');modalBaselines.delete(id);const origin=modalFocusOrigins.get(id);modalFocusOrigins.delete(id);if(!document.querySelector('.modal.open'))document.body.classList.remove('modal-open');updateDayQuickButton();if(origin&&document.contains(origin))origin.focus({preventScroll:true});
}
function runAfterDirtyCheck(id,action){if(isModalDirty(id)){showInlineModalConfirm(id,'Änderungen verwerfen?','Die noch nicht gespeicherten Eingaben gehen verloren.','Verwerfen',()=>{closeModal(id);action?.()});return}closeModal(id);action?.()}
function requestCloseModal(id){
  if(id==='dayModal'){requestDayCardClose();return}if(id==='settingsModal'){requestSettingsCardClose();return}if(id==='restoreConfirmModal'){cancelRestore();return}if(id==='discardConfirmModal'){closeModal(id);return}
  if(isModalDirty(id)){showInlineModalConfirm(id,'Änderungen verwerfen?','Die noch nicht gespeicherten Eingaben gehen verloren.','Verwerfen',()=>closeModal(id));return}closeModal(id);
}
function deleteAbsenceForDay(k,scope='day'){
  const d=state.days[k];if(!d?.absence)return;const dates=scope==='group'&&d.absenceGroupId?absenceGroupDays(d.absenceGroupId).map(x=>x.date):[k],what=dates.length>1?`den gesamten Abwesenheitszeitraum mit ${dates.length} Arbeitstagen`:'die Abwesenheit dieses Tages';
  showInlineModalConfirm('absenceModal','Abwesenheit löschen?',`${what} löschen? Vorhandene Arbeitszeitbuchungen bleiben erhalten.`,'Löschen',()=>{const nowIso=new Date().toISOString();dates.forEach(date=>{const day=state.days[date];if(!day)return;clearAbsenceFields(day);day.edited=true;day.modifiedAt=nowIso;if(IMPORTED_BY_DATE[date])day.importCleared=true;state.days[date]=day});state.settings.lastEditedDay=k;saveState();closeModal('absenceModal');refreshAllDerivedViews();showToast(dates.length>1?'Abwesenheitszeitraum gelöscht':'Abwesenheit gelöscht')});
}

function initV530Enhancements(){
  $('dayCardBack').addEventListener('click',()=>dayCardBack());$('dayCardClose').addEventListener('click',requestDayCardClose);$('settingsCardBack').addEventListener('click',requestSettingsCardClose);$('settingsCardClose').addEventListener('click',requestSettingsCardClose);$('openTargetRuleBtn').addEventListener('click',()=>openSettingsCard('target'));$('openHolidayRegionBtn').addEventListener('click',()=>openSettingsCard('region'));$('openOfflineInfoBtn').addEventListener('click',()=>openSettingsCard('offline'));$('restoreConfirmClose').addEventListener('click',cancelRestore);$('restoreCancelBtn').addEventListener('click',cancelRestore);$('restoreProceedBtn').addEventListener('click',proceedRestore);renderSettings();
}
document.addEventListener('DOMContentLoaded',initV530Enhancements);

/* V5.30 – auch verbleibende direkte Lösch-/Konfliktaktionen bestätigen innerhalb derselben Karte */
function deleteSingleEntry(){
  if(singleEntryDate===null||singleEntryIndex<0)return;
  const date=singleEntryDate,index=singleEntryIndex,d=clone(dayObject(date,true)),entry=(d.entries||[])[index];if(!entry)return;
  const label=entry.type==='in'?'Kommen':'Gehen',time=entry.logged||entry.actual||'';
  showInlineModalConfirm('entryModal','Buchung löschen?',`${label}${time?` um ${time}`:''} wirklich löschen? Die Aktion kann unmittelbar rückgängig gemacht werden.`,'Löschen',()=>{
    d.entries.splice(index,1);d.edited=true;d.importCleared=!!IMPORTED_BY_DATE[date];d.modifiedAt=new Date().toISOString();state.days[date]=d;touchDay(date);closeModal('entryModal');refreshAllDerivedViews();showUndoToast(`${label} ${time} gelöscht.`,()=>restoreDeletedEntry(date,index,entry));
  });
}
function commitAbsencePlan(plan){
  const policy=$('absenceConflictPolicy').value,context=absenceEditorContext||{mode:'new'},oldGroup=context.originalGroupId,groupId=context.scope==='group'&&oldGroup?oldGroup:newAbsenceGroupId(),code=$('absenceType').value,label=absenceLabel(code),extent=$('absenceExtent').value,note=$('absenceNote').value.trim(),nowIso=new Date().toISOString();
  const selected=policy==='skip'?plan.workdays.filter(k=>!plan.conflicts.includes(k)):plan.workdays;if(!selected.length){alert('Alle berücksichtigten Tage wurden wegen vorhandener Konflikte übersprungen.');return}
  if(context.mode==='edit'){
    const oldDates=context.scope==='group'&&oldGroup?absenceGroupDays(oldGroup).map(d=>d.date):[context.sourceDate];oldDates.forEach(k=>{const d=state.days[k];if(d){clearAbsenceFields(d);d.edited=true;d.modifiedAt=nowIso;state.days[k]=d}});
  }
  selected.forEach(k=>{const d=clone(dayObject(k,true));if(policy==='replace'&&plan.conflicts.includes(k)){d.entries=[];d.pauseMinutes=0;if(IMPORTED_BY_DATE[k])d.importCleared=true;clearAbsenceFields(d)}d.absence=label;d.absenceCode=code;d.absenceDuration=extent;delete d.absenceMinutes;d.absenceNote=note;d.absenceGroupId=groupId;d.absenceCreatedAt=d.absenceCreatedAt||nowIso;d.absenceUpdatedAt=nowIso;d.edited=true;d.modifiedAt=nowIso;d.archived=Number(k.slice(0,4))<new Date().getFullYear();state.days[k]=d});
  state.settings.lastEditedDay=selected[0];state.settings.lastActivityAt=nowIso;saveState();cursorDate=parseDateKey(selected[0]);closeModal('absenceModal');refreshAllDerivedViews();showToast(`${label} für ${selected.length} Arbeitstag(e) gespeichert`);
}
function saveAbsence(){
  const plan=absencePlan();if(plan.error){alert(plan.error);return}if(!plan.workdays.length){alert('Im ausgewählten Zeitraum liegt kein berücksichtigter Arbeitstag. Wochenenden und Feiertage werden ausgelassen.');return}
  const policy=$('absenceConflictPolicy').value;if(plan.conflicts.length&&policy==='abort'){alert('Es bestehen Konflikte mit vorhandenen Buchungen oder einer anderen Abwesenheit. Wähle „überspringen“ oder „ersetzen“, oder passe den Zeitraum an.');return}
  if(plan.conflicts.length&&policy==='replace'){
    showInlineModalConfirm('absenceModal','Vorhandene Einträge ersetzen?',`${plan.conflicts.length} betroffene Tag(e) enthalten Buchungen oder Abwesenheiten. Diese Einträge werden durch die neue Abwesenheit ersetzt.`,'Ersetzen',()=>commitAbsencePlan(plan));return;
  }
  commitAbsencePlan(plan);
}
