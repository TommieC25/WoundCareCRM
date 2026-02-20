// === js/contact.js === Contact modal, note editing, reminder completion, admin panel toggle

function prefixNote(prefix){const ta=$('contactNotes');if(!ta.value.startsWith('Call: ')&&!ta.value.startsWith('Visit: ')){ta.value=prefix+ta.value;}else{ta.value=ta.value.replace(/^(Call|Visit): /,prefix);}ta.focus();const row=$('alsoAttendedRow');if(row){row.style.display=(prefix==='Visit: ')?'block':'none';if(prefix!=='Visit: '){const det=$('alsoAttendedDetails');if(det)det.style.display='none';const sp=$('staffPresent');if(sp)sp.value='';}}}

function openContactModal() {
editingContactId = null;
$('contactForm').reset();
$('contactModalTitle').textContent = 'Add Contact Note';
$('authorName').value = 'Tom';
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
$('reminderDays').style.display = 'none';
$('reminderDatePreview').textContent = '';
if($('reminderNote'))$('reminderNote').value='';
if($('reminderNoteRow'))$('reminderNoteRow').style.display='none';
$('contactModal').classList.add('active');
}

function populateLocationDropdown() {
const select = $('contactLocation');
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
list.innerHTML = `<div style="font-size:0.8rem;color:#999;padding:0.2rem 0;">${selectedLocId ? 'No other physicians at this location' : 'No colleague physicians at shared locations'}</div>`;
} else {
list.innerHTML = colleagues.map(p => `<div class="selector-option" style="margin-bottom:0.25rem;" onclick="var c=this.querySelector('input');c.checked=!c.checked;">
<input type="checkbox" value="${p.id}" class="also-attended-cb">
<span class="selector-option-label">${fmtName(p)}</span>
</div>`).join('');
}
}

function closeContactModal(){closeModal('contactModal');}

async function saveContact(e) {
e.preventDefault();
const tv=$('contactTime').value,nv=$('contactNotes').value;
const locVal=$('contactLocation').value||null;
const reminderOn=$('setReminder').checked;
const reminderDate=reminderOn?calcBusinessDate(parseInt($('reminderDaysSelect').value)):null;
const reminderNoteVal=reminderOn&&$('reminderNote')?$('reminderNote').value.trim():'';
const baseNote=tv?`[${tv}] ${nv}`:nv;
const staffVal=$('staffPresent')?$('staffPresent').value.trim():'';
const withStaff=staffVal?`${baseNote} | Staff: ${staffVal}`:baseNote;
const noteText=reminderNoteVal?`${withStaff} | [Task: ${reminderNoteVal}]`:withStaff;
const dateVal=$('contactDate').value,authorVal=$('authorName').value;
const data={physician_id:currentPhysician.id,contact_date:dateVal,author:authorVal,notes:noteText,practice_location_id:locVal,reminder_date:reminderDate};
const alsoCbs=document.querySelectorAll('.also-attended-cb:checked');
const alsoIds=[...alsoCbs].map(cb=>cb.value);
await withSave('contactSaveBtn','Save Note',async()=>{
if(editingContactId){const{error}=await db.from('contact_logs').update(data).eq('id',editingContactId);if(error)throw error;showToast('Note updated','success');
}else{
const{error}=await db.from('contact_logs').insert(data);if(error)throw error;
if(alsoIds.length>0){
const alsoEntries=alsoIds.map(pid=>({physician_id:pid,contact_date:dateVal,author:authorVal,notes:noteText,practice_location_id:locVal,reminder_date:reminderDate}));
const{error:ae}=await db.from('contact_logs').insert(alsoEntries);
if(ae)console.error('Also-attended insert error:',ae);
for(const pid of alsoIds){await db.from('physicians').update({last_contact:dateVal}).eq('id',pid);}
}
const total=1+alsoIds.length;
showToast(`Note logged for ${total} physician${total>1?'s':''}`,'success');
}
await db.from('physicians').update({last_contact:dateVal}).eq('id',currentPhysician.id);
currentPhysician.last_contact=dateVal;await loadContactLogs(currentPhysician.id);renderProfile();setTimeout(()=>closeContactModal(),500);
});
}

async function editNote(logId) {
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
if (!time) {
const timeMatch = notes.match(/^\[(\d{1,2}:\d{2})\]\s*/);
if (timeMatch) {
time = timeMatch[1];
notes = notes.replace(timeMatch[0], '');
}
}
const taskMatch=notes.match(/\s*\|\s*\[Task:\s*(.*?)\]$/);
const taskNote=taskMatch?taskMatch[1].trim():'';
if(taskMatch)notes=notes.slice(0,taskMatch.index).trim();
$('contactTime').value = time;
$('contactNotes').value = notes;
if (log.reminder_date) {
$('setReminder').checked = true;
$('reminderDays').style.display = 'flex';
if($('reminderNoteRow'))$('reminderNoteRow').style.display='block';
if($('reminderNote'))$('reminderNote').value=taskNote;
const rd = new Date(log.reminder_date + 'T12:00:00');
const opts = {weekday:'short', month:'short', day:'numeric'};
$('reminderDatePreview').textContent = rd.toLocaleDateString('en-US', opts);
} else {
$('setReminder').checked = false;
$('reminderDays').style.display = 'none';
if($('reminderNoteRow'))$('reminderNoteRow').style.display='none';
if($('reminderNote'))$('reminderNote').value='';
$('reminderDatePreview').textContent = '';
}
$('contactModal').classList.add('active');
}

async function deleteNote(logId) {
await dbDel('contact_logs',logId,'Delete this note?',async()=>{await loadContactLogs(currentPhysician.id);renderProfile();});
}

async function completeReminder(logId) {
try {
updateSyncIndicators('syncing');
const {error} = await db.from('contact_logs').update({reminder_date: null}).eq('id', logId);
if (error) throw error;
showToast('Reminder marked complete ✓', 'success');
updateSyncIndicators('synced');
if (!currentPhysician && !currentPractice) { renderEmptyState(); }
} catch(e) { showToast('Error: ' + e.message, 'error'); updateSyncIndicators('error'); }
}

async function editNoteFromActivity(logId, physicianId) {
currentPhysician = physicians.find(p => p.id === physicianId);
currentPractice = null;
if (!currentPhysician) return;
await loadContactLogs(physicianId);
renderList();
renderProfile();
if (window.innerWidth <= 768) closeSidebar();
setTimeout(() => editNote(logId), 150);
}

async function deleteNoteFromActivity(logId, physicianId) {
currentPhysician = physicians.find(p => p.id === physicianId);
currentPractice = null;
if (!currentPhysician) return;
await loadContactLogs(physicianId);
deleteNote(logId);
}

function toggleAdminPanel() {
const panel = $('adminPanel');
panel.classList.toggle('show');
}
