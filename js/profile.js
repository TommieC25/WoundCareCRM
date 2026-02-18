// === js/profile.js === Physician profile, practice profile, practice contact modal

function renderProfile() {
const p = currentPhysician;
if (!p) return;
const logs = contactLogs[p.id] || [];
const assignments = physicianAssignments[p.id] || [];
const practiceIds = [...new Set(assignments.map(a => {
const loc = a.practice_locations || practiceLocations.find(l => l.id === a.practice_location_id);
return loc?.practice_id;
}).filter(Boolean))];
const associatedPractices = practices.filter(pr => practiceIds.includes(pr.id));
$('mainContent').innerHTML = `
<div class="profile-header">
<div class="profile-name">${fmtName(p)}</div>
<div class="profile-practice">
${associatedPractices.length > 0 ? associatedPractices.map(pr => `<span style="cursor:pointer;text-decoration:underline;color:#0a4d3c;" onclick="event.stopPropagation();editPracticeFromProfile('${pr.id}')">${pr.name}</span>`).join(' | ') + ` <button class="edit-btn" style="font-size:0.75rem;padding:0.25rem 0.5rem;margin-left:0.5rem;" onclick="editPracticeFromProfile('${associatedPractices[0].id}')">Edit Practice</button>` : 'No practice assigned'}
</div>
<div class="profile-meta">
${mi('Priority',p.priority||'Not set')}${mi('Specialty',p.specialty||'Not set')}${mi('Degree',p.degree||'—')}${p.title?mi('Title',p.title):''}
${p.email?`<div class="meta-item"><div class="meta-label">Email</div><div class="meta-value"><a href="mailto:${p.email}" style="color:#0a4d3c;">${p.email}</a></div></div>`:''}
${mi('Academic Connection',p.academic_connection||p.um_connection||'None')}${mi('Candidate Patient Volume',p.patient_volume||p.mohs_volume||'Unknown')}
<div class="meta-item"><span class="meta-label">Advanced Solution</span><label style="display:inline-flex;align-items:center;gap:0.4rem;cursor:pointer;padding:0.25rem 0.6rem;border-radius:6px;background:${p.advanced_solution?'#f97316':'#e5e5e5'};color:${p.advanced_solution?'white':'#666'};font-size:0.8rem;font-weight:700;transition:all 0.2s;" onclick="toggleAdvancedSolution(event)"><input type="checkbox" ${p.advanced_solution?'checked':''} style="width:16px;height:16px;min-width:16px;" onchange="toggleAdvancedSolution(event)">${p.advanced_solution?'YES':'NO'}</label></div>
${mi('Last Contact',p.last_contact||'Never')}${mi('Locations',assignments.length+' location'+(assignments.length!==1?'s':''))}
</div>
</div>
<div class="section">
<div class="section-header">
<h3>Physician Profile</h3>
<div>
<button class="edit-btn" onclick="editPhysicianInfo()">Edit</button>
<button class="delete-btn" onclick="deletePhysician()">Delete</button>
</div>
</div>
<div class="contact-grid">
${ci('✉️','Physician Email',p.email?`<a href="mailto:${p.email}">${p.email}</a>`:'')}
${ci('📝','General Notes',p.general_notes)}
${!p.email&&!p.general_notes?'<div class="empty-notice">Click Edit to add email and notes</div>':''}
</div>
</div>
<div class="section">
<div class="section-header">
<h3>Practice Locations</h3>
<button class="edit-btn" onclick="openAssignLocationModal()">+ Assign Location</button>
</div>
${assignments.length === 0 ?
'<div class="empty-notice">No locations assigned. Click + Assign Location to add practice locations.</div>' :
'<div class="locations-grid">' +
assignments.map(assign => {
const loc = assign.practice_locations || practiceLocations.find(l => l.id === assign.practice_location_id);
if (!loc) return '';
const practiceName = loc.practices?.name || getPracticeName(loc.practice_id);
return `
<div class="location-card ${assign.is_primary ? 'primary' : ''}">
<div class="location-card-header">
<div class="location-label">
${loc.label || 'Office'}
${assign.is_primary ? '<span class="location-badge">Primary</span>' : ''}
${practiceName ? `<span class="practice-badge">${practiceName}</span>` : ''}
</div>
<div class="location-actions">
<button class="icon-btn" onclick="editLocationDetails('${loc.id}')" title="Edit">✏️</button>
<button class="icon-btn" onclick="removeAssignment('${assign.id}')" title="Remove">🗑️</button>
</div>
</div>
<div class="location-details">${locDetails(loc)}</div>
</div>
`}).join('') +
'</div>'
}
</div>
<div class="section">
<div class="section-header">
<h3>Activity Log</h3>
<button class="edit-btn" onclick="openContactModal()">+ Add Note</button>
</div>
${logs.length === 0 ?
'<div class="empty-notice">No contact history yet. Click + Add Note to record your first call or visit.</div>' :
'<div class="contact-entries">' + logs.map(e => renderLogEntry(e,{editable:true,showTimestamp:true,full:true})).join('') + '</div>'
}
</div>
`;
}

async function renderPracticeProfile() {
const p = currentPractice;
const locations = practiceLocations.filter(l => l.practice_id === p.id);
const practicePhysicians = physicians.filter(phys => {
const assigns = physicianAssignments[phys.id] || [];
return assigns.some(a => {
const loc = a.practice_locations || practiceLocations.find(l => l.id === a.practice_location_id);
return loc && loc.practice_id === p.id;
});
});
$('mainContent').innerHTML = `
<div class="profile-header">
<div class="profile-name">${p.name}</div>
<div class="profile-practice">${p.website ? `<a href="${p.website.match(/^https?:\/\//)?p.website:'https://'+p.website}" target="_blank">${p.website}</a>` : 'No website'}</div>
<div class="profile-meta">
${mi('Locations',locations.length)}${mi('Physicians',practicePhysicians.length)}${mi('Cities',[...new Set(locations.map(l=>l.city).filter(Boolean))].join(', ')||'N/A')}
</div>
</div>
<div class="section">
<div class="section-header">
<h3>Practice Details</h3>
<div>
<button class="edit-btn" onclick="editPractice()">Edit</button>
<button class="delete-btn" onclick="deletePractice()">Delete</button>
</div>
</div>
<div class="contact-grid">${(()=>{const pLocs=practiceLocations.filter(l=>l.practice_id===p.id);const pEmail=pLocs.map(l=>l.practice_email).find(Boolean)||'';const pPhone=pLocs.map(l=>l.phone).find(Boolean)||'';const pFax=pLocs.map(l=>l.fax).find(Boolean)||'';const pHours=pLocs.map(l=>l.office_hours).find(Boolean)||'';const pStaff=pLocs.map(l=>l.office_staff).find(Boolean)||'';const pBestDays=pLocs.map(l=>l.best_days).find(Boolean)||'';const wSite=p.website?`<a href="${p.website.match(/^https?:\/\//)?p.website:'https://'+p.website}" target="_blank" style="color:#0a4d3c;">${p.website}</a>`:'';return (wSite?ci('🌐','Website',wSite):'')+ci('✉️','Email',pEmail?`<a href="mailto:${pEmail}">${pEmail}</a>`:'')+ci('📞','Phone',pPhone?`<a href="tel:${pPhone.replace(/\D/g,'')}">${fmtPhone(pPhone)}</a>`:'')+ci('📠','Fax',pFax?fmtPhone(pFax):'')+ci('🕐','Office Hours',pHours)+ci('👥','Office Staff',pStaff)+ci('📅','Best Days',pBestDays)+ci('📝','Notes',p.general_notes)||(!pEmail&&!p.general_notes&&!pPhone?'<div class="empty-notice">No details for this practice</div>':'');})()}</div>
</div>
<div class="section">
<div class="section-header">
<h3>Locations</h3>
<button class="edit-btn" onclick="openLocationModal('${p.id}')">+ Add Location</button>
</div>
${locations.length === 0 ?
'<div class="empty-notice">No locations yet. Click + Add Location to add an address.</div>' :
'<div class="locations-grid">' +
locations.map(loc => `
<div class="location-card">
<div class="location-card-header">
<div class="location-label">${loc.label || 'Office'}</div>
<div class="location-actions">
<button class="icon-btn" onclick="editLocationDetails('${loc.id}')" title="Edit">✏️</button>
<button class="icon-btn" onclick="deleteLocation('${loc.id}')" title="Delete">🗑️</button>
</div>
</div>
<div class="location-details">${locDetails(loc)}</div>
</div>
`).join('') +
'</div>'
}
</div>
<div class="section">
<div class="section-header">
<h3>Activity Log</h3>
<button class="edit-btn" onclick="openPracticeContactModal()">+ Log Call</button>
</div>
<div id="practiceActivityContent"><div class="loading">Loading activity...</div></div>
</div>
<div class="section">
<div class="section-header">
<h3>Physicians at this Practice</h3>
<button class="edit-btn" onclick="openAssignPhysicianModal()">+ Assign Physician</button>
</div>
${practicePhysicians.length === 0 ?
'<div class="empty-notice">No physicians assigned to this practice yet.</div>' :
'<div class="contact-grid">' +
practicePhysicians.map(phys => `
<div class="contact-item" style="cursor: pointer;" onclick="setView('physicians');viewPhysician('${phys.id}')">
<div class="contact-icon">👨‍⚕️</div>
<div class="contact-item-content">
<div class="contact-item-label">${phys.priority || 'No tier'}</div>
<div class="contact-item-value">${fmtName(phys)}</div>
</div>
</div>
`).join('') +
'</div>'
}
</div>
`;
await loadPracticeActivity(p.id);
}

async function loadPracticeActivity(practiceId) {
const locIds = practiceLocations.filter(l => l.practice_id === practiceId).map(l => l.id);
const practPhysIds = physicians.filter(ph => {
const assigns = physicianAssignments[ph.id] || [];
return assigns.some(a => locIds.includes(a.practice_location_id));
}).map(ph => ph.id);
if (practPhysIds.length === 0) {
const el = $('practiceActivityContent');
if (el) el.innerHTML = '<div class="empty-notice">No physicians assigned yet. Assign physicians to log activity.</div>';
return;
}
try {
const { data: logs, error } = await db.from('contact_logs').select('*').in('physician_id', practPhysIds).order('contact_date', { ascending: false }).limit(50);
if (error) throw error;
const el = $('practiceActivityContent');
if (!el) return;
if (!logs || logs.length === 0) {
el.innerHTML = '<div class="empty-notice">No activity logged yet. Click + Log Call to record your first call or visit.</div>';
return;
}
el.innerHTML = '<div class="contact-entries">' + logs.map(e => {
const phys = physicians.find(p => p.id === e.physician_id);
return renderLogEntry(e,{physName:phys?fmtName(phys):'Unknown'});
}).join('') + '</div>';
} catch(e) {
const el = $('practiceActivityContent');
if (el) el.innerHTML = '<div class="empty-notice">Could not load activity</div>';
}
}

function openPracticeContactModal() {
editingContactId = null;
$('contactForm').reset();
$('contactModalTitle').textContent = 'Log Practice Call';
$('authorName').value = 'Tom';
$('contactSaveBtn').textContent = 'Save Note';
$('contactSaveBtn').className = 'btn-primary';
setToday();
const locations = practiceLocations.filter(l => l.practice_id === currentPractice.id);
const select = $('contactLocation');
select.innerHTML = locations.length === 1
? `<option value="${locations[0].id}">${locations[0].address || locations[0].label}, ${locations[0].city || ''}</option>`
: '<option value="">Select location...</option>' + locations.map(l => `<option value="${l.id}">${l.address || l.label || 'Office'}, ${l.city || ''}</option>`).join('');
$('locationSelectRow').style.display = locations.length <= 1 ? 'none' : 'block';
if (locations.length === 1) select.value = locations[0].id;
const practPhys = physicians.filter(ph => {
const assigns = physicianAssignments[ph.id] || [];
return assigns.some(a => locations.some(l => l.id === a.practice_location_id));
});
let physRow = $('practicePhysSelectRow');
if (!physRow) {
physRow = document.createElement('div');
physRow.id = 'practicePhysSelectRow';
$('locationSelectRow').parentElement.insertBefore(physRow, $('locationSelectRow'));
}
if (practPhys.length > 0) {
physRow.innerHTML = `<label>Physicians/Staff Present</label>
<div id="practicePhysCheckboxes" style="max-height:180px;overflow-y:auto;border:2px solid #e5e5e5;border-radius:8px;padding:0.5rem;">
${practPhys.map(p => `<div class="selector-option" style="margin-bottom:0.25rem;" onclick="var c=this.querySelector('input');c.checked=!c.checked;">
<input type="checkbox" value="${p.id}" class="practice-phys-cb">
<span class="selector-option-label">${fmtName(p)}</span>
</div>`).join('')}
<div class="selector-option" style="margin-bottom:0.25rem;background:#fff9e6;border:1px solid #fcd34d;" onclick="var c=this.querySelector('input');c.checked=!c.checked;var n=document.getElementById('officeStaffNameInput');if(n)n.style.display=c.checked?'block':'none';">
<input type="checkbox" value="office_staff" class="practice-phys-cb" id="officeStaffCb">
<span class="selector-option-label">📋 Office Staff (enter name)</span>
</div>
</div>
<input type="text" id="officeStaffNameInput" placeholder="Office staff name (optional)" style="display:none;margin-top:0.25rem;padding:0.5rem;font-size:0.85rem;border:1px solid #fcd34d;border-radius:6px;width:100%;">
<div style="font-size:0.75rem;color:#666;margin-top:0.25rem;">${practPhys.length} physician${practPhys.length!==1?'s':''} at this practice</div>`;
physRow.style.display = 'block';
if (practPhys.length === 1) physRow.querySelector('.practice-phys-cb').checked = true;
} else {
physRow.innerHTML = `<label>Who did you contact?</label>
<div style="padding:0.5rem;border:2px solid #e5e5e5;border-radius:8px;">
<div class="selector-option" style="background:#fff9e6;border:1px solid #fcd34d;" onclick="var c=this.querySelector('input');c.checked=!c.checked;var n=document.getElementById('officeStaffNameInput');if(n)n.style.display=c.checked?'block':'none';">
<input type="checkbox" value="office_staff" class="practice-phys-cb" id="officeStaffCb">
<span class="selector-option-label">📋 Office Staff (enter name)</span>
</div>
</div>
<input type="text" id="officeStaffNameInput" placeholder="Office staff name (optional)" style="display:none;margin-top:0.25rem;padding:0.5rem;font-size:0.85rem;border:1px solid #fcd34d;border-radius:6px;width:100%;">
<div style="font-size:0.75rem;color:#f97316;margin-top:0.25rem;">No physicians assigned yet — you can still log a note about office staff.</div>`;
physRow.style.display = 'block';
}
$('setReminder').checked = false;
$('reminderDays').style.display = 'none';
$('reminderDatePreview').textContent = '';
$('contactForm').onsubmit = function(ev) { savePracticeContact(ev); return false; };
$('contactModal').classList.add('active');
}

async function savePracticeContact(e) {
e.preventDefault();
const cbs = document.querySelectorAll('.practice-phys-cb:checked');
const selectedValues = [...cbs].map(cb => cb.value);
const physIds = selectedValues.filter(v => v !== 'office_staff');
const hasOfficeStaff = selectedValues.includes('office_staff');
const staffName = ($('officeStaffNameInput')?.value || '').trim();
if (physIds.length === 0 && !hasOfficeStaff) { showToast('Please select at least one physician or Office Staff', 'error'); return; }
const tv = $('contactTime').value, nv = $('contactNotes').value;
const locVal = $('contactLocation').value || null;
const reminderOn = $('setReminder').checked;
const reminderDate = reminderOn ? calcCalendarDate(parseInt($('reminderDaysSelect').value)) : null;
const dateVal = $('contactDate').value, authorVal = $('authorName').value;
await withSave('contactSaveBtn', 'Save Note', async() => {
const entries = [];
physIds.forEach(pid => {
const noteText = tv ? `[${tv}] ${nv}` : nv;
entries.push({physician_id:pid,contact_date:dateVal,author:authorVal,notes:noteText,practice_location_id:locVal,reminder_date:reminderDate});
});
if (hasOfficeStaff) {
const staffNote = staffName ? `[Office Staff: ${staffName}] ` : '[Office Staff] ';
const noteText = tv ? `[${tv}] ${staffNote}${nv}` : `${staffNote}${nv}`;
const firstPhysId = physIds.length > 0 ? null : (physicians.find(p => (physicianAssignments[p.id]||[]).some(a => (practiceLocations.filter(l=>l.practice_id===currentPractice.id)).some(l=>l.id===a.practice_location_id)))?.id || null);
entries.push({physician_id:firstPhysId,contact_date:dateVal,author:authorVal,notes:noteText,practice_location_id:locVal,reminder_date:reminderDate});
}
if (entries.length === 0) { showToast('Nothing to save', 'info'); return; }
const {error} = await db.from('contact_logs').insert(entries);
if (error) throw error;
for (const pid of physIds) {
await db.from('physicians').update({last_contact:dateVal}).eq('id',pid);
}
const total = physIds.length + (hasOfficeStaff ? 1 : 0);
showToast(`Call logged for ${total} contact${total!==1?'s':''}`, 'success');
await loadAllData();
renderPracticeProfile();
await loadPracticeActivity(currentPractice.id);
setTimeout(() => { closeContactModal(); $('contactForm').onsubmit = function(ev) { saveContact(ev); return false; }; const pr = $('practicePhysSelectRow'); if (pr) pr.style.display = 'none'; }, 500);
});
}
