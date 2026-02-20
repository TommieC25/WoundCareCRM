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
// Phase 1: Find/create all practices
const practiceNames=[...new Set(rows.map(r=>(r.practice_name||'').trim()).filter(Boolean))];
const practiceMap={};
for(const name of practiceNames){
const{data:exArr}=await db.from('practices').select('*').ilike('name',name).limit(1);
const ex=exArr&&exArr.length>0?exArr[0]:null;
if(ex){practiceMap[name]=ex.id;}else{
const{data:np}=await db.from('practices').insert({name}).select().maybeSingle();
if(np)practiceMap[name]=np.id;
}}
function getPractId(practName){const n=(practName||'').trim();return practiceMap[n]||practiceMap[Object.keys(practiceMap).find(k=>k.toLowerCase()===n.toLowerCase())];}

// Phase 2: Find/create ALL locations first (independent of which physician is listed)
status('Creating practice locations...');
const locMap={};// key: `${practiceId}|${address}` -> location record
const seenLocKeys=new Set();
for(const r of rows){
const practId=getPractId(r.practice_name);
const addr=(r.address||'').trim();
if(!practId||!addr||addr==='[Research needed]')continue;
const locKey=`${practId}|${addr}`;
if(seenLocKeys.has(locKey))continue;
seenLocKeys.add(locKey);
const city=(r.city||'').trim();
const{data:exLoc}=await db.from('practice_locations').select('*').eq('practice_id',practId).eq('address',addr).maybeSingle();
const locRec=exLoc||(await db.from('practice_locations').insert({practice_id:practId,label:city||'Office',address:addr,city,zip:(r.zip||'').trim(),phone:r.phone||null,fax:r.fax||null,office_hours:r.office_hours||null,office_staff:r.office_staff||null,receptionist_name:r.receptionist_name||r.receptionist||null,best_days:r.best_days||null,practice_email:r.practice_email||r.office_email||null}).select().maybeSingle()).data;
if(locRec)locMap[locKey]=locRec;
}

// Phase 3: Build physician map — track which practices each physician belongs to
const physMap=new Map();
rows.forEach(r=>{
const key=`${(r.first_name||'').trim().toLowerCase()}|${(r.last_name||'').trim().toLowerCase()}`;
if(!physMap.has(key))physMap.set(key,{phys:{first_name:(r.first_name||'').trim(),last_name:(r.last_name||'').trim(),email:r.email||null,priority:r.priority||null,academic_connection:r.academic_connection||r.um_connection||null,specialty:r.specialty||null,degree:r.degree||null,title:r.title||null,proj_vol:r.proj_vol||r.patient_volume||r.vol||null,general_notes:r.general_notes||null},practiceIds:new Set(),primaryLocKey:null});
const e=physMap.get(key);
const practId=getPractId(r.practice_name);
if(practId)e.practiceIds.add(practId);
// Track primary location (first address listed for this physician)
const addr=(r.address||'').trim();
if(!e.primaryLocKey&&practId&&addr&&addr!=='[Research needed]')e.primaryLocKey=`${practId}|${addr}`;
});

// Phase 4: Find/create each physician then assign to ALL locations of their practice(s)
let count=0;const total=physMap.size;
for(const[key,entry] of physMap){
count++;if(count%5===0||count===total)status(`Assigning physicians ${count} of ${total}...`);
const{data:exArr}=await db.from('physicians').select('*').ilike('first_name',entry.phys.first_name).ilike('last_name',entry.phys.last_name).limit(1);
const ex=exArr&&exArr.length>0?exArr[0]:null;
const phys=ex||(await db.from('physicians').insert(entry.phys).select().maybeSingle()).data;
if(!phys)continue;
// Assign to ALL locations of every practice this physician belongs to
for(const practId of entry.practiceIds){
const{data:allLocs}=await db.from('practice_locations').select('id').eq('practice_id',practId);
for(const loc of allLocs||[]){
const isPrimary=entry.primaryLocKey&&locMap[entry.primaryLocKey]?.id===loc.id;
const{data:exA}=await db.from('physician_location_assignments').select('id').eq('physician_id',phys.id).eq('practice_location_id',loc.id).maybeSingle();
if(!exA)await db.from('physician_location_assignments').insert({physician_id:phys.id,practice_location_id:loc.id,is_primary:!!isPrimary});
}}}
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
const h=['Last Name','First Name','Degree','Practice','Tier','Specialty','Email','Academic Connection','Projected Volume','SS Volume','Primary Address','Primary City','Primary ZIP','Primary Phone','Primary Fax','Office Hours','Best Days','Receptionist','Location Count','Last Contact','Status','General Notes'];
const rows=(allPhys||[]).map(p=>{const as=am[p.id]||[];const pl=(as.find(a=>a.is_primary)||as[0])?.practice_locations||{};
const log=latestLog[p.id];const statusNote=log?(log.notes||'').replace(/^\[\d{1,2}:\d{2}\]\s*/,''):'';const statusPreview=statusNote.length>80?statusNote.substring(0,80)+'...':statusNote;const status=log?log.contact_date+': '+statusPreview:'';
return[p.last_name,p.first_name,p.degree||'',pl.practices?.name||p.practice_name||'',p.priority||'',p.specialty||'',p.email||'',p.academic_connection||'',p.proj_vol||p.mohs_volume||'',p.ss_vol||'',pl.address||'',pl.city||'',pl.zip||'',fmtPhone(pl.phone),fmtPhone(pl.fax),pl.office_hours||'',pl.best_days||'',pl.receptionist_name||'',as.length,p.last_contact||'',status,p.general_notes||''];});
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
const vol = p?.proj_vol || p?.mohs_volume || '';
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

// --- Skin Substitute Volume Import ---
// Expects CSV with headers: FirstName, LastName, FirstNameLastName, Degree, Address, Suite,
//   City, Zip, Phone, Notes, County, Specialty, ss_vol
// Conflict rule: skip if same (first_name+last_name no-space) AND same address already exists.
// proj_vol is left NULL for all imported records.
async function importSkinSubCSV(file) {
if (!file) return;
const statusEl = $('skinSubImportStatus');
const status = s => { if (statusEl) statusEl.textContent = s; };
status('Reading CSV...');
try {
function parseCSVLine(line) {
const vals = []; let cur = '', inQ = false;
for (const ch of line) {
if (ch === '"') { inQ = !inQ; }
else if (ch === ',' && !inQ) { vals.push(cur.trim()); cur = ''; }
else { cur += ch; }
}
vals.push(cur.trim());
return vals;
}
const text = await file.text();
const lines = text.split('\n').filter(l => l.trim());
const headers = parseCSVLine(lines[0]).map(h => h.trim());
const rows = [];
for (let i = 1; i < lines.length; i++) {
const vals = parseCSVLine(lines[i]);
const row = {};
headers.forEach((h, j) => row[h] = (vals[j] || '').trim());
rows.push(row);
}
status(`Parsed ${rows.length} rows. Building conflict map...`);
// Build conflict set: (first_name+last_name no-space lowercased)|(address lowercased)
const { data: existingPhys } = await db.from('physicians').select('id, first_name, last_name');
const { data: existingAssign } = await db.from('physician_location_assignments').select('physician_id, practice_locations(address)');
const existingKeys = new Set();
(existingPhys || []).forEach(p => {
const fnl = ((p.first_name || '') + (p.last_name || '')).replace(/\s/g, '').toLowerCase();
const assigns = (existingAssign || []).filter(a => a.physician_id === p.id);
if (assigns.length === 0) {
existingKeys.add(fnl + '|');
} else {
assigns.forEach(a => {
const addr = (a.practice_locations?.address || '').toLowerCase().trim();
existingKeys.add(fnl + '|' + addr);
});
}
});
let imported = 0, skipped = 0;
const skippedList = [];
for (let i = 0; i < rows.length; i++) {
const r = rows[i];
status(`Processing ${i + 1} of ${rows.length}...`);
const firstName = (r.FirstName || '').trim();
const lastName = (r.LastName || '').trim();
const fullConcat = ((r.FirstNameLastName || (firstName + lastName)).replace(/\s/g, '')).toLowerCase();
const address = (r.Address || '').toLowerCase().trim();
const conflictKey = fullConcat + '|' + address;
if (existingKeys.has(conflictKey)) {
skipped++;
skippedList.push(`${firstName} ${lastName} (${r.Address || 'no address'})`);
continue;
}
existingKeys.add(conflictKey);
// Insert physician
const ssVolRaw = parseInt(r.ss_vol, 10);
const physData = {
first_name: firstName,
last_name: lastName,
degree: r.Degree || null,
specialty: r.Specialty || null,
general_notes: r.Notes || null,
ss_vol: isNaN(ssVolRaw) ? null : ssVolRaw,
proj_vol: null,
};
const { data: newPhys, error: physErr } = await db.from('physicians').insert(physData).select().single();
if (physErr) { showToast(`Error inserting ${firstName} ${lastName}: ${physErr.message}`, 'error'); continue; }
// Create a practice named after the physician
const { data: newPractice, error: practErr } = await db.from('practices').insert({ name: `${firstName} ${lastName}`.trim() }).select().single();
if (practErr) { showToast(`Error creating practice for ${firstName} ${lastName}: ${practErr.message}`, 'error'); continue; }
// Create practice location
const phone = r.Phone && r.Phone !== '0' ? r.Phone : null;
const locData = {
practice_id: newPractice.id,
label: r.City || 'Office',
address: r.Address || null,
city: r.City || null,
zip: r.Zip ? String(r.Zip) : null,
phone,
};
const { data: newLoc, error: locErr } = await db.from('practice_locations').insert(locData).select().single();
if (locErr) { showToast(`Error creating location for ${firstName} ${lastName}: ${locErr.message}`, 'error'); continue; }
// Link physician → location
const { error: assignErr } = await db.from('physician_location_assignments').insert({
physician_id: newPhys.id,
practice_location_id: newLoc.id,
is_primary: true,
});
if (assignErr) showToast(`Warning: could not link ${firstName} ${lastName} to location`, 'error');
imported++;
}
await loadAllData();
let summary = `Import complete: ${imported} imported, ${skipped} skipped.`;
if (skippedList.length > 0) summary += ' Skipped: ' + skippedList.join('; ');
status(summary);
showToast(`Skin sub import: ${imported} added, ${skipped} skipped`, imported > 0 ? 'success' : 'info');
console.log('[SkinSubImport]', summary);
} catch (err) {
console.error('Skin sub import error:', err);
status('Error: ' + err.message);
showToast('Import error: ' + err.message, 'error');
}
}
