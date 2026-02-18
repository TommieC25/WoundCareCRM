// === js/admin.js === CSV import, database clear, CSV export, field routing export

// --- CSV Import ---
async function importCSV(file) {
if(!file)return;
const status=s=>{const el=$('importStatus');if(el)el.textContent=s;const el2=$('importStatusMain');if(el2)el2.textContent=s;};
status('Reading CSV...');
try{
const text=await file.text();
const lines=text.split('\n').filter(l=>l.trim());
const headers=lines[0].split(',').map(h=>h.trim().toLowerCase().replace(/\s+/g,'_'));
const rows=[];
for(let i=1;i<lines.length;i++){
const vals=[];let cur='',inQ=false;
for(const ch of lines[i]){if(ch==='"'){inQ=!inQ;}else if(ch===','&&!inQ){vals.push(cur.trim());cur='';}else{cur+=ch;}}
vals.push(cur.trim());
const row={};headers.forEach((h,j)=>row[h]=vals[j]||'');rows.push(row);
}
status(`Parsed ${rows.length} rows. Importing...`);
updateSyncIndicators('syncing');
const practiceNames=[...new Set(rows.map(r=>r.practice_name).filter(Boolean))];
const practiceMap={};
for(const name of practiceNames){
const{data:ex}=await db.from('practices').select('*').eq('name',name).maybeSingle();
if(ex){practiceMap[name]=ex.id;}else{
const{data:np,error}=await db.from('practices').insert({name}).select().maybeSingle();
if(np)practiceMap[name]=np.id;
}}
const physMap=new Map();
rows.forEach(r=>{
const key=`${(r.first_name||'').toLowerCase()}|${(r.last_name||'').toLowerCase()}`;
if(!physMap.has(key))physMap.set(key,{phys:{first_name:r.first_name,last_name:r.last_name,email:r.email||null,priority:r.priority||null,academic_connection:r.academic_connection||r.um_connection||null,specialty:r.specialty||null,degree:r.degree||null,title:r.title||null,patient_volume:r.patient_volume||r.vol||null,general_notes:r.general_notes||null},locs:[]});
const e=physMap.get(key);
if(r.address&&r.address!=='[Research needed]')e.locs.push({practice_id:practiceMap[r.practice_name],address:r.address,city:r.city,zip:r.zip,phone:r.phone,fax:r.fax,office_hours:r.office_hours||null,office_staff:r.office_staff||null,receptionist_name:r.receptionist_name||r.receptionist||null,best_days:r.best_days||null,practice_email:r.practice_email||r.office_email||null,label:r.city||'Office',is_primary:e.locs.length===0});
});
let count=0;const total=physMap.size;
for(const[key,entry] of physMap){
count++;if(count%10===0)status(`Importing physician ${count} of ${total}...`);
const{data:ex}=await db.from('physicians').select('*').ilike('first_name',entry.phys.first_name).ilike('last_name',entry.phys.last_name).maybeSingle();
const phys=ex||(await db.from('physicians').insert(entry.phys).select().maybeSingle()).data;
if(!phys)continue;
for(const loc of entry.locs){
if(!loc.practice_id)continue;
const{data:exLoc}=await db.from('practice_locations').select('*').eq('practice_id',loc.practice_id).eq('address',loc.address).maybeSingle();
const locRec=exLoc||(await db.from('practice_locations').insert({practice_id:loc.practice_id,label:loc.label,address:loc.address,city:loc.city,zip:loc.zip,phone:loc.phone,fax:loc.fax,office_hours:loc.office_hours||null,office_staff:loc.office_staff||null,receptionist_name:loc.receptionist_name||null,best_days:loc.best_days||null,practice_email:loc.practice_email||null}).select().maybeSingle()).data;
if(!locRec)continue;
const{data:exA}=await db.from('physician_location_assignments').select('*').eq('physician_id',phys.id).eq('practice_location_id',locRec.id).maybeSingle();
if(!exA)await db.from('physician_location_assignments').insert({physician_id:phys.id,practice_location_id:locRec.id,is_primary:loc.is_primary});
}}
await loadAllData();
status(`Done! Imported ${physMap.size} physicians, ${practiceNames.length} practices.`);
showToast(`Imported ${physMap.size} physicians`,'success');
updateSyncIndicators('synced');
}catch(e){console.error('Import error:',e);status('Error: '+e.message);showToast('Import failed: '+e.message,'error');updateSyncIndicators('error');}
}

async function clearDatabase() {
const confirmMsg = 'Are you sure you want to DELETE ALL DATA?\n\nThis will remove:\n- All physicians\n- All practices\n- All locations\n- All contact logs\n\nThis cannot be undone!';
if (!confirm(confirmMsg)) return;
if (!confirm('FINAL WARNING: Click OK to permanently delete all data.')) return;
try {
updateSyncIndicators('syncing');
showToast('Clearing database...', 'info');
for(const t of ['contact_logs','physician_location_assignments','physicians','practice_locations','practices']){
const{error,count}=await db.from(t).delete().neq('id','00000000-0000-0000-0000-000000000000');
console.log(`Deleted from ${t}: error=${error?.message||'none'}`);
if(error) throw error;
}
const{data:remaining}=await db.from('physicians').select('id,first_name,last_name');
if(remaining&&remaining.length>0){
console.warn(`${remaining.length} physicians survived delete! RLS may be blocking deletions.`);
showToast(`Warning: ${remaining.length} records could not be deleted (database permissions issue). Check Supabase RLS policies.`,'error');
for(const r of remaining){
const{error:e2}=await db.from('physicians').delete().eq('id',r.id);
console.log(`Individual delete ${r.first_name} ${r.last_name}: ${e2?.message||'ok'}`);
}
}
physicians=[];practices=[];practiceLocations=[];physicianAssignments={};contactLogs={};
currentPhysician=null;currentPractice=null;
await loadAllData();
renderList();
if(physicians.length>0){
showToast(`Clear incomplete: ${physicians.length} physicians remain. Check Supabase RLS/policies.`,'error');
}else{
renderEmptyState();
showToast('Database cleared successfully!', 'success');
}
updateSyncIndicators('synced');
} catch (error) {
console.error('Clear database error:', error);
showToast('Error clearing database: ' + error.message, 'error');
updateSyncIndicators('error');
}
}

// --- CSV Export ---
function openExportModal(){document.getElementById('exportModal').classList.add('active');}
function closeExportModal(){closeModal('exportModal');}
function escCSV(val){if(val==null)return '';const s=String(val);if(s.includes(',')||s.includes('"')||s.includes('\n'))return '"'+s.replace(/"/g,'""')+'"';return s;}
function downloadCSV(filename,headers,rows){const csv=[headers.join(','),...rows.map(r=>r.map(escCSV).join(','))].join('\n');const blob=new Blob([csv],{type:'text/csv;charset=utf-8;'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(url);}
function todayStamp(){const d=new Date();return d.toISOString().slice(0,10)+'_'+d.toTimeString().slice(0,8).replace(/:/g,'');}

async function exportCSV(type){
const st=document.getElementById('exportStatus');st.style.display='block';st.style.background='#e0f2fe';st.style.color='#075985';st.textContent='Preparing export...';
try{
if(type==='physicians'||type==='all') await exportPhysicians();
if(type==='contacts'||type==='all') await exportContacts();
if(type==='practices'||type==='all') await exportPractices();
st.style.background='#dcfce7';st.style.color='#166534';st.textContent='Export complete!';
showToast('CSV exported successfully','success');
}catch(e){st.style.background='#fee2e2';st.style.color='#991b1b';st.textContent='Export failed: '+e.message;showToast('Export error: '+e.message,'error');}
}

async function exportPhysicians(){
const{data:allPhys,error}=await db.from('physicians').select('*').order('last_name');if(error)throw error;
const{data:allAssign}=await db.from('physician_location_assignments').select('*, practice_locations(*, practices(name))');
const am={};(allAssign||[]).forEach(a=>{if(!am[a.physician_id])am[a.physician_id]=[];am[a.physician_id].push(a);});
const{data:allLogs}=await db.from('contact_logs').select('*').order('contact_date',{ascending:false});
const latestLog={};(allLogs||[]).forEach(l=>{if(!latestLog[l.physician_id])latestLog[l.physician_id]=l;});
const h=['Last Name','First Name','Degree','Practice','Tier','Specialty','Email','Academic Connection','Patient Volume','Primary Address','Primary City','Primary ZIP','Primary Phone','Primary Fax','Office Hours','Best Days','Receptionist','Location Count','Last Contact','Status','General Notes'];
const rows=(allPhys||[]).map(p=>{const as=am[p.id]||[];const pl=(as.find(a=>a.is_primary)||as[0])?.practice_locations||{};
const log=latestLog[p.id];const statusNote=log?(log.notes||'').replace(/^\[\d{1,2}:\d{2}\]\s*/,''):'';const statusPreview=statusNote.length>80?statusNote.substring(0,80)+'...':statusNote;const status=log?log.contact_date+': '+statusPreview:'';
return[p.last_name,p.first_name,p.degree||'',pl.practices?.name||p.practice_name||'',p.priority||'',p.specialty||'',p.email||'',p.academic_connection||'',p.patient_volume||p.mohs_volume||'',pl.address||'',pl.city||'',pl.zip||'',fmtPhone(pl.phone),fmtPhone(pl.fax),pl.office_hours||'',pl.best_days||'',pl.receptionist_name||'',as.length,p.last_contact||'',status,p.general_notes||''];});
downloadCSV('physicians_export_'+todayStamp()+'.csv',h,rows);
}

async function exportContacts(){
const{data:allLogs,error}=await db.from('contact_logs').select('*').order('contact_date',{ascending:false});if(error)throw error;
const pm={};physicians.forEach(p=>pm[p.id]=p);
const h=['Date','Time','Author','Physician Last Name','Physician First Name','Location','Notes'];
const rows=(allLogs||[]).map(l=>{const p=pm[l.physician_id]||{};const loc=l.practice_location_id?getLocationLabel(l.practice_location_id):'';
let notes=l.notes||'',time=l.contact_time||'';
if(!time&&notes.startsWith('[')){const m=notes.match(/^\[(\d{1,2}:\d{2})\]\s*/);if(m){time=m[1];notes=notes.slice(m[0].length);}}
return[l.contact_date,time,l.author||'',p.last_name||'',p.first_name||'',loc,notes];});
downloadCSV('contact_logs_export_'+todayStamp()+'.csv',h,rows);
}

async function exportPractices(){
const{data:allLocs,error}=await db.from('practice_locations').select('*, practices(name)').order('city');if(error)throw error;
const h=['Practice Name','Location Label','Address','City','ZIP','Phone','Fax','Office Email','Office Hours','Office Staff','Receptionist','Best Days'];
const rows=(allLocs||[]).map(l=>[l.practices?.name||'',l.label||'',l.address||'',l.city||'',l.zip||'',fmtPhone(l.phone),fmtPhone(l.fax),l.practice_email||'',l.office_hours||'',l.office_staff||'',l.receptionist_name||'',l.best_days||'']);
downloadCSV('practices_locations_export_'+todayStamp()+'.csv',h,rows);
}

// --- Routing Export ---
function getRoutingExportHistory() {
try { return JSON.parse(localStorage.getItem('routingExportHistory') || '{}'); } catch(e) { return {}; }
}
function saveRoutingExportHistory(history) {
localStorage.setItem('routingExportHistory', JSON.stringify(history));
}
function buildRoutingRows(latestActivity) {
const rows = [];
const assignedLocIds = new Set();
const actMap = latestActivity || {};
physicians.forEach(phys => {
const assigns = physicianAssignments[phys.id] || [];
const activity = actMap[phys.id] || null;
if (assigns.length === 0) {
rows.push({ key: 'phys_' + phys.id, phys, loc: null, practice: null, type: 'phys-only', activity });
} else {
assigns.forEach(a => {
const loc = a.practice_locations || practiceLocations.find(l => l.id === a.practice_location_id);
if (!loc) return;
assignedLocIds.add(loc.id);
const practice = practices.find(pr => pr.id === loc.practice_id);
rows.push({ key: 'pl_' + phys.id + '_' + loc.id, phys, loc, practice, type: 'phys-loc', activity });
});
}
});
practiceLocations.forEach(loc => {
if (assignedLocIds.has(loc.id)) return;
const practice = practices.find(pr => pr.id === loc.practice_id);
rows.push({ key: 'loc_' + loc.id, phys: null, loc, practice, type: 'loc-only', activity: null });
});
return rows;
}
async function openRoutingExport() {
cachedLatestActivity = {};
try {
const {data:allLogs} = await db.from('contact_logs').select('*').order('contact_date',{ascending:false});
if (allLogs) {
allLogs.forEach(l => { if (!cachedLatestActivity[l.physician_id]) cachedLatestActivity[l.physician_id] = l; });
}
} catch(e) { console.error('Could not load activity for routing:', e); }
const history = getRoutingExportHistory();
const rows = buildRoutingRows(cachedLatestActivity);
let newCount = 0, exportedCount = 0, noPhysCount = 0;
const listHTML = rows.map(r => {
const exported = history[r.key];
const isNew = !exported;
if (r.type === 'loc-only') noPhysCount++;
if (isNew) newCount++; else exportedCount++;
const physName = r.phys ? `${r.phys.first_name} ${r.phys.last_name}${r.phys.degree ? ', ' + r.phys.degree : ''}` : '(No physician assigned)';
const practiceName = r.practice?.name || r.loc?.practices?.name || 'No practice';
const addr = r.loc ? [r.loc.address, r.loc.city, r.loc.zip].filter(Boolean).join(', ') : 'No location';
const activityNote = r.activity ? r.activity.notes || '' : '';
const activityPreview = activityNote.replace(/^\[\d{1,2}:\d{2}\]\s*/, '').substring(0, 60) + (activityNote.length > 60 ? '...' : '');
const activityDate = r.activity?.contact_date || '';
const statusLine = activityDate ? `<div style="font-size:0.7rem;color:#0a4d3c;margin-top:0.125rem;">Last: ${activityDate} — ${activityPreview}</div>` : '';
const rowClass = r.type === 'loc-only' ? 'no-phys-row' : (isNew ? 'new-row' : 'exported-row');
const badgeClass = isNew ? 'new' : 'exported';
const badgeText = isNew ? 'NEW' : 'Exported ' + exported;
return `<div class="routing-row ${rowClass}" onclick="this.querySelector('input').checked=!this.querySelector('input').checked">
<input type="checkbox" data-key="${r.key}" ${isNew ? 'checked' : ''} onclick="event.stopPropagation()">
<div class="routing-row-content">
<div class="routing-row-name">${physName}</div>
<div class="routing-row-detail">${practiceName} — ${addr}</div>
${statusLine}
</div>
<span class="routing-row-badge ${badgeClass}">${badgeText}</span>
</div>`;
}).join('');
$('routingExportSummary').innerHTML = `<strong>${newCount}</strong> new row${newCount !== 1 ? 's' : ''} to export &nbsp;|&nbsp; <strong>${exportedCount}</strong> previously exported &nbsp;|&nbsp; <strong>${noPhysCount}</strong> practice${noPhysCount !== 1 ? 's' : ''} without physicians`;
$('routingExportList').innerHTML = listHTML || '<div class="empty-notice">No data to export. Add physicians or practices first.</div>';
$('routingExportNewBtn').textContent = `Export New Only (${newCount})`;
$('routingExportModal').classList.add('active');
}
function closeRoutingExport() { closeModal('routingExportModal'); }
function getRoutingCSVHeaders() {
return ['ORIG','CALL','AS?','Rank','Physician First Name','Physician Last Name','First Last','Degree','Status','Specialty','Facility (full name)','Address','City','Zip','Phone Number','Vol','County','Notes'];
}
function routingRowToCSV(r) {
const p = r.phys;
const l = r.loc;
const pr = r.practice;
const practiceName = pr?.name || l?.practices?.name || '';
let status = '';
if (r.activity) {
const note = (r.activity.notes || '').replace(/^\[\d{1,2}:\d{2}\]\s*/, '');
const preview = note.length > 80 ? note.substring(0, 80) + '...' : note;
status = r.activity.contact_date + ': ' + preview;
}
if (r.type === 'loc-only') {
return ['','','','','(Enter HCP first name)','(Enter HCP last name)','','',status,'',practiceName,l?.address||'',l?.city||'',l?.zip||'',fmtPhone(l?.phone),'',l?.city?guessCounty(l.city):'',l?.practice_email?'Email: '+l.practice_email:''];
}
const firstName = p?.first_name || '';
const lastName = p?.last_name || '';
const firstLast = (firstName + ' ' + lastName).trim();
const degree = p?.degree || '';
const rank = p?.priority || '';
const vol = p?.patient_volume || p?.mohs_volume || '';
const county = l?.city ? guessCounty(l.city) : '';
const notes = p?.general_notes || '';
const asVal = p?.advanced_solution ? 'Y' : '';
return ['','' ,asVal,rank,firstName,lastName,firstLast,degree,status,p?.specialty||'',practiceName,l?.address||'',l?.city||'',l?.zip||'',fmtPhone(l?.phone),vol,county,notes];
}
function guessCounty(city) {
if (!city) return '';
const c = city.toLowerCase();
const mdCities = ['miami','hialeah','homestead','key biscayne','coral gables','south miami','palmetto bay','doral','north miami','aventura','miami beach','miami gardens','miami lakes','opa-locka','sunny isles','key largo'];
const brCities = ['fort lauderdale','hollywood','pembroke pines','coral springs','deerfield beach','plantation','davie','weston','tamarac','lauderdale lakes','coconut creek','pompano beach','cooper city'];
const pbCities = ['west palm beach','boca raton','boynton beach','delray beach','palm beach gardens','jupiter','lake worth','wellington','royal palm beach','belle glade','palm city','atlantis','north palm beach'];
if (mdCities.some(mc => c.includes(mc))) return 'Miami-Dade';
if (brCities.some(bc => c.includes(bc))) return 'Broward';
if (pbCities.some(pc => c.includes(pc))) return 'Palm Beach';
return '';
}
function routingExportSelected(onlyNew) {
const checkboxes = document.querySelectorAll('#routingExportList input[type="checkbox"]');
const allRows = buildRoutingRows(cachedLatestActivity);
const rowMap = {};
allRows.forEach(r => rowMap[r.key] = r);
const history = getRoutingExportHistory();
const stamp = todayStamp();
const selectedKeys = [];
checkboxes.forEach(cb => {
if (onlyNew) {
if (!history[cb.dataset.key]) selectedKeys.push(cb.dataset.key);
} else {
selectedKeys.push(cb.dataset.key);
}
});
if (selectedKeys.length === 0) { showToast('No rows to export', 'info'); return; }
const headers = getRoutingCSVHeaders();
const csvRows = selectedKeys.map(key => { const r = rowMap[key]; if (!r) return null; return routingRowToCSV(r); }).filter(Boolean);
downloadCSV('field_routing_' + stamp + '.csv', headers, csvRows);
selectedKeys.forEach(key => { history[key] = stamp; });
saveRoutingExportHistory(history);
showToast(`Exported ${selectedKeys.length} row${selectedKeys.length !== 1 ? 's' : ''} for field routing`, 'success');
openRoutingExport();
}
function routingExportNew() { routingExportSelected(true); }
function routingExportAll() { routingExportSelected(false); }
function routingClearHistory() {
if (!confirm('Clear all export history? Everything will show as "NEW" again.')) return;
localStorage.removeItem('routingExportHistory');
showToast('Export history cleared', 'info');
openRoutingExport();
}
