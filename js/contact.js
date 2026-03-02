// === js/contact.js === Contact modal, note editing, reminder completion, admin panel toggle

function prefixNote(prefix){const ta=$('contactNotes');if(!ta.value.startsWith('Call: ')&&!ta.value.startsWith('Visit: ')){ta.value=prefix+ta.value;}else{ta.value=ta.value.replace(/^(Call|Visit): /,prefix);}ta.focus();const row=$('alsoAttendedRow');if(row){row.style.display=(prefix==='Visit: ')?'block':'none';if(prefix!=='Visit: '){const det=$('alsoAttendedDetails');if(det)det.style.display='none';const sp=$('staffPresent');if(sp)sp.value='';}}}

function openContactModal() {
editingContactId = null;
$('contactForm').reset();
$('contactModalTitle').textContent = 'Add Contact Note';
$('authorName').value = '';
$('contactSaveBtn').textContent = 'Save Note';
$('contactSaveBtn').className = 'btn-primary';
setToday();
populateLocationDropdown();
populateAlsoAttended();
const row=$('alsoAttendedRow');if(row)row.style.display='none';
const det=$('alsoAttendedDetails');if(det)det.style.display='none';
const sp=$('staffPresent');if(sp)sp.value='';
const pr = $('practicePhysSelectRow'); if (pr) pr.style.display = 'none';
$('contactForm').onsubmit = function(ev) { saveContact(ev); return false; };
$('setReminder').checked = false;
if($('reminderRow'))$('reminderRow').style.display='block';
$('contactModal').classList.add('active');
}

function populateLocationDropdown() {
const select = $('contactLocation');
if (!currentPhysician) return;
const assignments = physicianAssignments[currentPhysician.id] || [];
const locations = assignments.map(a => {
const loc = practiceLocations.find(l => l.id === a.practice_location_id);
if (loc) {
const practice = practices.find(p => p.id === loc.practice_id);
const locLabel = loc.label && loc.label !== loc.city ? loc.label : loc.city || 'Office';
return {
id: loc.id,
label: `${practice ? practice.name + ' — ' : ''}${locLabel}${loc.address ? ' ('+loc.address+')' : ''}`
};
}
return null;
}).filter(Boolean);
select.innerHTML = locations.length === 1
? `<option value="${locations[0].id}">${locations[0].label}</option>`
: '<option value="">Select location...</option>' +
locations.map(l => `<option value="${l.id}">${l.label}</option>`).join('');
// Refresh attendees when location changes
select.onchange = () => { if($('contactNotes').value.startsWith('Visit: ')) populateAlsoAttended(); };
$('locationSelectRow').style.display = locations.length <= 1 ? 'none' : 'block';
if (locations.length === 1) {
select.value = locations[0].id;
}
}

function populateAlsoAttended() {
const list = $('alsoAttendedList');
if (!list || !currentPhysician) return;
// Filter by the currently selected location if one is chosen
const selectedLocId = $('contactLocation').value;
let colleagues;
if (selectedLocId) {
colleagues = physicians.filter(p => {
if (p.id === currentPhysician.id) return false;
return (physicianAssignments[p.id] || []).some(a => a.practice_location_id === selectedLocId);
});
} else {
const myLocIds = (physicianAssignments[currentPhysician.id] || []).map(a => a.practice_location_id);
colleagues = physicians.filter(p => {
if (p.id === currentPhysician.id) return false;
return (physicianAssignments[p.id] || []).some(a => myLocIds.includes(a.practice_location_id));
});
}
if (colleagues.length === 0) {
list.innerHTML = `<div style="font-size:0.8rem;color:#999;padding:0.2rem 0;">${selectedLocId ? 'No other providers at this location' : 'No colleague providers at shared locations'}</div>`;
} else {
list.innerHTML = colleagues.map(p => `<div class="selector-option" style="margin-bottom:0.25rem;" onclick="var c=this.querySelector('input');c.checked=!c.checked;">
<input type="checkbox" value="${p.id}" class="also-attended-cb">
<span class="selector-option-label">${fmtName(p)}</span>
</div>`).join('');
}
}

function closeContactModal(){closeModal('contactModal');}

async function saveContact(e) {
if(e) e.preventDefault();
try {
if(!currentPhysician){showToast('Error: no provider selected','error');return;}
const dateVal=$('contactDate').value,authorVal=$('authorName').value;
const nv=($('contactNotes').value||'').trim();
if(!dateVal){showToast('Please enter a date','error');return;}
if(!authorVal){showToast('Please select your name','error');return;}
if(!nv){showToast('Please enter note text','error');return;}
const tv=$('contactTime').value;
const locVal=$('contactLocation').value||null;
const reminderOn=$('setReminder').checked;
const baseNote=tv?`[${tv}] ${nv}`:nv;
const staffVal=$('staffPresent')?$('staffPresent').value.trim():'';
const noteText=staffVal?`${baseNote} | Staff: ${staffVal}`:baseNote;
// Activity record — clean, no reminder_date, no embedded task text
const data={provider_id:currentPhysician.id,contact_date:dateVal,author:authorVal,notes:noteText,practice_location_id:locVal};
const alsoCbs=document.querySelectorAll('.also-attended-cb:checked');
const alsoIds=[...alsoCbs].map(cb=>cb.value);
await withSave('contactSaveBtn','Save Note',async()=>{
if(editingContactId){
// Edit: update activity only, do not touch reminder_date (tasks are separate)
const{error}=await db.from('contact_logs').update(data).eq('id',editingContactId);if(error)throw error;showToast('Note updated','success');
}else{
const{error}=await db.from('contact_logs').insert(data);if(error)throw error;
if(alsoIds.length>0){
const alsoEntries=alsoIds.map(pid=>({provider_id:pid,contact_date:dateVal,author:authorVal,notes:noteText,practice_location_id:locVal}));
const{error:ae}=await db.from('contact_logs').insert(alsoEntries);
if(ae)console.error('Also-attended insert error:',ae);
for(const pid of alsoIds){await db.from('providers').update({last_contact:dateVal}).eq('id',pid);}
}
const total=1+alsoIds.length;
showToast(`Note logged for ${total} provider${total>1?'s':''}`,'success');
}
await db.from('providers').update({last_contact:dateVal}).eq('id',currentPhysician.id);
currentPhysician.last_contact=dateVal;await loadContactLogs(currentPhysician.id);if(currentView==='activity'){renderActivityView();}else{renderProfile();}
// If follow-up task requested, open separate task modal after closing activity modal
if(!editingContactId&&reminderOn){
setTimeout(()=>{closeContactModal();openAddTaskModal(currentPhysician.id,locVal);},400);
}else{
setTimeout(()=>closeContactModal(),500);
}
});
}catch(err){showToast('Error saving note: '+err.message,'error');console.error('saveContact error:',err);}
}

async function editNote(logId) {
if (!currentPhysician) return;
const log = (contactLogs[currentPhysician.id] || []).find(l => l.id === logId);
if (!log) return;
editingContactId = logId;
$('contactModalTitle').textContent = 'Edit Contact Note';
$('contactSaveBtn').textContent = 'Save Note';
$('contactSaveBtn').className = 'btn-primary';
populateLocationDropdown();
$('contactDate').value = log.contact_date;
$('contactLocation').value = log.practice_location_id || '';
$('authorName').value = log.author || '';
let notes = log.notes || '';
let time = '';
const timeMatch = notes.match(/^\[(\d{1,2}:\d{2})\]\s*/);
if (timeMatch) { time = timeMatch[1]; notes = notes.replace(timeMatch[0], ''); }
// Strip legacy embedded task text for clean display (backward compat with old records)
const taskMatch = notes.match(/\s*\|\s*\[Task:\s*(.*?)\]$/);
if (taskMatch) notes = notes.slice(0, taskMatch.index).trim();
$('contactTime').value = time;
$('contactNotes').value = notes;
// Tasks are now separate records — hide follow-up section when editing an activity
if($('reminderRow'))$('reminderRow').style.display='none';
$('setReminder').checked = false;
$('contactModal').classList.add('active');
}

async function deleteNote(logId) {
await dbDel('contact_logs',logId,'Delete this note?',async()=>{if(!currentPhysician)return;await loadContactLogs(currentPhysician.id);if(currentView==='activity'){renderActivityView();}else if(currentView==='tasks'){renderTasksView();}else{renderProfile();}});
}

async function completeReminder(logId) {
try {
updateSyncIndicators('syncing');
const {error} = await db.from('contact_logs').update({reminder_date: '2000-01-01'}).eq('id', logId);
if (error) throw error;
showToast('Reminder marked complete ✓', 'success');
updateSyncIndicators('synced');
if (!currentPhysician && !currentPractice && currentView !== 'tasks') { renderEmptyState(); }
} catch(e) { showToast('Error: ' + e.message, 'error'); updateSyncIndicators('error'); }
}

async function editNoteFromActivity(logId, physicianId) {
try {
currentPhysician = physicians.find(p => p.id === physicianId);
currentPractice = null;
if (!currentPhysician) return;
await loadContactLogs(physicianId);
if (currentView === 'activity') {
setTimeout(() => editNote(logId), 50);
} else {
renderList();
renderProfile();
if (window.innerWidth <= 768) closeSidebar();
setTimeout(() => editNote(logId), 150);
}
} catch(e) { showToast('Error loading note: ' + e.message, 'error'); }
}

async function deleteNoteFromActivity(logId, physicianId) {
try {
currentPhysician = physicians.find(p => p.id === physicianId);
currentPractice = null;
if (!currentPhysician) return;
await loadContactLogs(physicianId);
await deleteNote(logId);
} catch(e) { showToast('Error: ' + e.message, 'error'); }
}

// Edit any contact log entry from the practice profile (works for both provider-linked and practice-level notes)
async function editPracticeNote(logId) {
try{
const{data:log,error}=await db.from('contact_logs').select('*').eq('id',logId).single();
if(error||!log){showToast('Note not found','error');return;}
editingContactId=logId;
$('contactForm').reset();
$('contactModalTitle').textContent='Edit Note';
$('contactSaveBtn').textContent='Save Changes';
$('contactSaveBtn').className='btn-primary';
$('contactDate').value=log.contact_date||'';
$('authorName').value=log.author||'';
const tm=(log.notes||'').match(/^\[(\d{1,2}:\d{2})\]\s*/);
$('contactTime').value=tm?tm[1]:'';
$('contactNotes').value=tm?log.notes.slice(tm[0].length):(log.notes||'');
if($('locationSelectRow'))$('locationSelectRow').style.display='none';
if($('reminderRow'))$('reminderRow').style.display='none';
const pr=$('practicePhysSelectRow');if(pr)pr.style.display='none';
$('contactForm').onsubmit=async function(ev){
ev.preventDefault();
const tv=$('contactTime').value,nv=$('contactNotes').value;
const newNote=tv?`[${tv}] ${nv}`:nv;
await withSave('contactSaveBtn','Save Changes',async()=>{
const{error}=await db.from('contact_logs').update({notes:newNote,author:$('authorName').value,contact_date:$('contactDate').value}).eq('id',editingContactId);
if(error)throw error;
showToast('Note updated','success');
closeContactModal();
$('contactForm').onsubmit=function(ev){saveContact(ev);return false;};
await loadAllData();
if(currentPractice){renderPracticeProfile();await loadPracticeActivity(currentPractice.id);}
});
return false;
};
$('contactModal').classList.add('active');
}catch(e){showToast('Error: '+e.message,'error');}
}
async function deletePracticeNote(logId) {
await dbDel('contact_logs',logId,'Delete this note?',async()=>{
if(currentPractice){renderPracticeProfile();await loadPracticeActivity(currentPractice.id);}
});
}

function _buildTaskContext(physicianId, locationId) {
const phys = physicianId ? physicians.find(p => p.id === physicianId) : null;
const loc = locationId ? practiceLocations.find(l => l.id === locationId) : null;
const practice = loc ? practices.find(p => p.id === loc.practice_id) : null;
let ctx = '';
if (phys) { ctx = `<strong>${fmtName(phys)}</strong>`; if (practice) ctx += ` · ${practice.name}`; if (loc && loc.address) ctx += ` · ${loc.address}`; }
else if (practice) { ctx = `<strong>${practice.name}</strong>`; if (loc) ctx += ` · ${loc.label || loc.address || loc.city || ''}`; }
else if (loc) { ctx = `<strong>${loc.label || loc.address || 'Location'}</strong>`; }
return ctx;
}

function openAddTaskModal(physicianId, locationId) {
if($('addTaskEditId'))$('addTaskEditId').value = '';
$('addTaskNote').value = '';
if($('addTaskAuthor'))$('addTaskAuthor').value = '';
$('addTaskPhysicianId').value = physicianId || '';
$('addTaskLocationId').value = locationId || '';
$('addTaskModalTitle').textContent = 'New Task';
// mode: 'provider' | 'practice' | 'global'
const mode = physicianId ? 'provider' : locationId ? 'practice' : 'global';
// Context block
const ctx = $('addTaskContext');
if(ctx){ctx.innerHTML=_buildTaskContext(physicianId,locationId);ctx.style.display=mode!=='global'?'block':'none';}
// Provider search row
const provRow=$('addTaskProviderRow');
if(provRow){
  provRow.style.display=mode==='global'?'block':'none';
  if(mode==='global'){$('addTaskProviderSearch').value='';$('addTaskProviderResults').style.display='none';}
}
// Practice search row
const pracRow=$('addTaskPracticeRow');
if(pracRow){
  pracRow.style.display=mode==='global'?'block':'none';
  if(mode==='global'){$('addTaskPracticeSearch').value='';$('addTaskPracticeResults').style.display='none';}
}
// Location row
const locRow=$('addTaskLocationRow');
if(locRow){
  locRow.style.display='block';
  if(mode==='global'){
    $('addTaskLocationSelect').innerHTML='<option value="">No specific location</option>';
  } else if(mode==='provider'){
    const assigned=(physicianAssignments[physicianId]||[]).map(a=>{const loc=practiceLocations.find(l=>l.id===a.practice_location_id);if(!loc)return null;const prac=practices.find(pr=>pr.id===loc.practice_id);return{id:loc.id,label:`${prac?prac.name+' \u2014 ':''}${loc.label&&loc.label!==loc.city?loc.label:loc.city||'Office'}${loc.address?' ('+loc.address+')':''}`};}).filter(Boolean);
    const locs=assigned.length>0?assigned:practiceLocations.filter(l=>l.zip||l.address).map(l=>{const prac=practices.find(pr=>pr.id===l.practice_id);return{id:l.id,label:`${prac?prac.name+' \u2014 ':''}${l.label&&l.label!==l.city?l.label:l.city||'Office'}${l.address?' ('+l.address+')':''}`};});
    const sel=$('addTaskLocationSelect');sel.innerHTML='<option value="">No specific location</option>'+locs.map(l=>`<option value="${l.id}"${l.id===locationId?' selected':''}>${l.label}</option>`).join('');
    $('addTaskLocationId').value=locationId||'';
  } else {
    // practice mode: show all locations for this practice
    const loc=practiceLocations.find(l=>l.id===locationId);
    const practiceId=loc?loc.practice_id:null;
    const pracLocs=practiceId?practiceLocations.filter(l=>l.practice_id===practiceId):(loc?[loc]:[]);
    const sel=$('addTaskLocationSelect');
    sel.innerHTML='<option value="">No specific location</option>'+pracLocs.map(l=>`<option value="${l.id}"${l.id===locationId?' selected':''}>${l.label&&l.label!==l.city?l.label:l.city||'Office'}${l.address?' ('+l.address+')':''}</option>`).join('');
    $('addTaskLocationId').value=locationId||'';
  }
}
populateReminderDateButtons('task');
$('addTaskModal').classList.add('active');
setTimeout(() => $('addTaskNote').focus(), 100);
}
function filterAddTaskPractices() {
const q=($('addTaskPracticeSearch').value||'').toLowerCase().trim();
const results=$('addTaskPracticeResults');
if(!q){results.style.display='none';return;}
const matches=practices.filter(p=>(p.name||'').toLowerCase().includes(q)).slice(0,8);
if(!matches.length){results.innerHTML='<div style="padding:0.5rem 0.75rem;font-size:0.85rem;color:#999;">No practices found</div>';results.style.display='block';return;}
results.innerHTML=matches.map(p=>{
  const locs=practiceLocations.filter(l=>l.practice_id===p.id);
  const city=[...new Set(locs.map(l=>l.city).filter(Boolean))].slice(0,2).join(', ');
  return `<div onclick="selectAddTaskPractice('${p.id}')" style="padding:0.5rem 0.75rem;cursor:pointer;border-bottom:1px solid #f0f0f0;font-size:0.875rem;" onmouseover="this.style.background='#f0f9f4'" onmouseout="this.style.background=''"><span style="font-weight:600;">${p.name}</span>${city?`<span style="color:#888;font-size:0.8rem;"> · ${city}</span>`:''}${locs.length?`<span style="color:#aaa;font-size:0.75rem;"> (${locs.length} loc)</span>`:''}</div>`;
}).join('');
results.style.display='block';
}
function selectAddTaskPractice(practiceId) {
const prac=practices.find(p=>p.id===practiceId);
if(!prac)return;
// Clear provider fields
$('addTaskPhysicianId').value='';
$('addTaskProviderSearch').value='';
$('addTaskPracticeSearch').value=prac.name;
$('addTaskPracticeResults').style.display='none';
// Populate location with this practice's locations
const locs=practiceLocations.filter(l=>l.practice_id===practiceId);
const sel=$('addTaskLocationSelect');
sel.innerHTML='<option value="">No specific location</option>'+locs.map(l=>`<option value="${l.id}">${l.label&&l.label!==l.city?l.label:l.city||'Office'}${l.address?' ('+l.address+')':''}</option>`).join('');
if(locs.length===1){sel.value=locs[0].id;$('addTaskLocationId').value=locs[0].id;}
$('addTaskLocationRow').style.display='block';
// Update context using first location
const firstLoc=locs[0];
const ctx=$('addTaskContext');
if(ctx){ctx.innerHTML=_buildTaskContext(null,firstLoc?firstLoc.id:null);ctx.style.display='block';}
}
function openAddTaskForPractice() {
if(!currentPractice)return;
const locs=practiceLocations.filter(l=>l.practice_id===currentPractice.id);
openAddTaskModal(null,locs.length>0?locs[0].id:null);
}

function filterAddTaskProviders() {
const q=($('addTaskProviderSearch').value||'').toLowerCase().trim();
const results=$('addTaskProviderResults');
if(!q){results.style.display='none';return;}
const matches=physicians.filter(p=>fmtName(p).toLowerCase().includes(q)||(p.specialty||'').toLowerCase().includes(q)).slice(0,8);
if(!matches.length){results.innerHTML='<div style="padding:0.5rem 0.75rem;font-size:0.85rem;color:#999;">No providers found</div>';results.style.display='block';return;}
results.innerHTML=matches.map(p=>{
  const locs=(physicianAssignments[p.id]||[]).map(a=>practiceLocations.find(l=>l.id===a.practice_location_id)).filter(Boolean);
  const prac=locs.length?(practices.find(pr=>pr.id===locs[0].practice_id)||{}).name||'':'';
  return `<div onclick="selectAddTaskProvider('${p.id}')" style="padding:0.5rem 0.75rem;cursor:pointer;border-bottom:1px solid #f0f0f0;font-size:0.875rem;" onmouseover="this.style.background='#f0f9f4'" onmouseout="this.style.background=''"><span style="font-weight:600;">${fmtName(p)}</span>${prac?`<span style="color:#888;font-size:0.8rem;"> · ${prac}</span>`:''}</div>`;
}).join('');
results.style.display='block';
}

function selectAddTaskProvider(physicianId) {
const phys=physicians.find(p=>p.id===physicianId);
if(!phys)return;
$('addTaskPhysicianId').value=physicianId;
$('addTaskProviderSearch').value=fmtName(phys);
$('addTaskProviderResults').style.display='none';
// Populate location dropdown for this provider
const assignments=(physicianAssignments[physicianId]||[]);
const locs=assignments.map(a=>{
  const loc=practiceLocations.find(l=>l.id===a.practice_location_id);
  if(!loc)return null;
  const prac=practices.find(pr=>pr.id===loc.practice_id);
  return{id:loc.id,label:`${prac?prac.name+' — ':''}${loc.label&&loc.label!==loc.city?loc.label:loc.city||'Office'}${loc.address?' ('+loc.address+')':''}`};
}).filter(Boolean);
const sel=$('addTaskLocationSelect');
sel.innerHTML='<option value="">No specific location</option>'+locs.map(l=>`<option value="${l.id}">${l.label}</option>`).join('');
if(locs.length===1){sel.value=locs[0].id;$('addTaskLocationId').value=locs[0].id;}
$('addTaskLocationRow').style.display='block';
// Update context
const ctx=$('addTaskContext');
if(ctx){ctx.innerHTML=_buildTaskContext(physicianId,null);ctx.style.display='block';}
}

// Opens addTaskModal in edit mode for an existing task record (called from task detail modal)
function openEditTaskModal() {
const rec = window._openedTaskRec;
if (!rec) return;
// Extract task note: for old-style records with embedded [Task:], use that text; otherwise use the full notes
const tm = (rec.notes||'').match(/^\[(\d{1,2}:\d{2})\]\s*/);
let noteText = tm ? rec.notes.replace(tm[0], '') : (rec.notes||'');
const taskMatch = noteText.match(/\s*\|\s*\[Task:\s*(.*?)\]$/);
const taskNote = taskMatch ? taskMatch[1].trim() : noteText;
if($('addTaskEditId'))$('addTaskEditId').value = rec.id;
$('addTaskNote').value = taskNote;
$('addTaskPhysicianId').value = rec.provider_id || '';
$('addTaskLocationId').value = rec.practice_location_id || '';
const ctx=$('addTaskContext');
if(ctx){ctx.innerHTML=_buildTaskContext(rec.provider_id,rec.practice_location_id);ctx.style.display=(rec.provider_id||rec.practice_location_id)?'block':'none';}
if($('addTaskProviderRow'))$('addTaskProviderRow').style.display='none';
const _editLocRow=$('addTaskLocationRow');if(_editLocRow){const _pid=rec.provider_id;if(_pid){const _locs=(physicianAssignments[_pid]||[]).map(a=>{const loc=practiceLocations.find(l=>l.id===a.practice_location_id);if(!loc)return null;const prac=practices.find(pr=>pr.id===loc.practice_id);return{id:loc.id,label:`${prac?prac.name+' \u2014 ':''}${loc.label&&loc.label!==loc.city?loc.label:loc.city||'Office'}${loc.address?' ('+loc.address+')':''}`};}).filter(Boolean);const _sel=$('addTaskLocationSelect');const _cur=rec.practice_location_id||'';_sel.innerHTML='<option value="">No specific location</option>'+_locs.map(l=>`<option value="${l.id}"${l.id===_cur?' selected':''}>${l.label}</option>`).join('');_editLocRow.style.display='block';}else{_editLocRow.style.display='none';}}
$('addTaskModalTitle').textContent = 'Edit Task';
if ($('addTaskAuthor')) $('addTaskAuthor').value = rec.author || '';
populateReminderDateButtons('task');
if (rec.reminder_date) selectReminderDate(rec.reminder_date, '', 'task');
$('addTaskModal').classList.add('active');
setTimeout(() => $('addTaskNote').focus(), 100);
}

function closeAddTaskModal() { closeModal('addTaskModal'); }

async function saveNewTask() {
const note = ($('addTaskNote').value || '').trim();
if (!note) { showToast('Please enter a task note', 'error'); return; }
const date = $('taskSelectedDate').value;
if (!date) { showToast('Please select a due date', 'error'); return; }
const authorVal = ($('addTaskAuthor')?.value || '').trim();
if (!authorVal) { showToast('Please select your name', 'error'); return; }
const editId = ($('addTaskEditId')?.value) || null;
const physicianId = $('addTaskPhysicianId').value || null;
// When in global mode the location comes from the visible select; otherwise use the hidden field
const locRow=$('addTaskLocationRow');
const locationId = (locRow&&locRow.style.display!=='none'&&$('addTaskLocationSelect'))
  ? ($('addTaskLocationSelect').value||null)
  : ($('addTaskLocationId').value||null);
const today = localDate();
await withSave('addTaskSaveBtn', editId ? 'Save Task' : 'Save Task', async () => {
let error, _newRec = null;
if (editId) {
({error} = await db.from('contact_logs').update({ notes: note, reminder_date: date, author: authorVal }).eq('id', editId));
} else {
({data:_newRec,error} = await db.from('contact_logs').insert({ provider_id: physicianId, contact_date: today, author: authorVal, notes: note, practice_location_id: locationId, reminder_date: date }).select().single());
}
if (error) throw error;
showToast(editId ? 'Task updated' : 'Task saved', 'success');
closeAddTaskModal();
if (physicianId && currentPhysician && currentPhysician.id === physicianId) { await loadContactLogs(physicianId); renderProfile(); }
if (typeof renderTasksView === 'function') renderTasksView();
if (!editId && _newRec && date && date !== '2099-12-31') {
const _p=physicianId?physicians.find(p=>p.id===physicianId):null,_l=locationId?practiceLocations.find(l=>l.id===locationId):null,_pr=_l?practices.find(p=>p.id===_l.practice_id):null;
const calUrl=buildGoogleCalendarUrl(_newRec,_p,_l,_pr);
const _tc=$('toastContainer'),_t=document.createElement('div');
_t.className='toast success';
_t.style.cssText='display:flex;align-items:center;justify-content:space-between;gap:0.75rem;padding:0.85rem 1rem;';
const _a=document.createElement('a');_a.href=calUrl;_a.target='_blank';_a.rel='noopener';
_a.textContent='📅 Add to Google Calendar';_a.style.cssText='color:white;font-weight:600;text-decoration:underline;font-size:0.95rem;';
const _x=document.createElement('button');_x.textContent='×';_x.style.cssText='background:none;border:none;color:white;font-size:1.5rem;line-height:1;cursor:pointer;padding:0;flex-shrink:0;';
_x.onclick=()=>_t.remove();_t.appendChild(_a);_t.appendChild(_x);_tc.appendChild(_t);
setTimeout(()=>_t.remove(),15000);
}
});
}

function toggleAdminPanel() {
const panel = $('adminPanel');
panel.classList.toggle('show');
if (panel.classList.contains('show')) initSheetSyncUrl();
}
