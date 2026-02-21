// === js/views.js === Activity view, Tasks view, Dashboard view, Map view
let _taskDetailLogs = {};
function closeTaskDetailModal() { closeModal('taskDetailModal'); }
function openTaskDetailModal(logId) {
const r = _taskDetailLogs[logId];
if (!r) return;
const phys = r.physician_id ? physicians.find(p => p.id === r.physician_id) : null;
const loc = r.practice_location_id ? practiceLocations.find(l => l.id === r.practice_location_id) : null;
const practice = loc ? practices.find(p => p.id === loc.practice_id) : null;
const tm = (r.notes||'').match(/^\[(\d{1,2}:\d{2}(?:\s*[APap][Mm])?)\]\s*/);
let displayNotes = tm ? r.notes.replace(tm[0], '') : (r.notes||'');
const taskMatch = displayNotes.match(/\s*\|\s*\[Task:\s*(.*?)\]$/);
const taskNote = taskMatch ? taskMatch[1].trim() : '';
if (taskMatch) displayNotes = displayNotes.slice(0, taskMatch.index).trim();
const noteTime = tm ? tm[1] : '';
const today = new Date().toISOString().split('T')[0];
const isOverdue = r.reminder_date && r.reminder_date !== '2099-12-31' && r.reminder_date < today;
const isOpen = r.reminder_date === '2099-12-31';
const isStaff = phys?.specialty === 'Administrative Staff';
const np = phys ? normPriority(phys.priority) : null;
const tierColors = {'1':'#ef4444','2':'#f97316','3':'#3b82f6','4':'#8b5cf6','5':'#64748b'};
const fmtD = ds => { if(!ds)return''; const d=new Date(ds+'T12:00:00'); return d.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'}); };
let html = '';
if (phys) {
html += `<div style="padding:1rem;background:#f0f9f6;border-radius:10px;margin-bottom:0.75rem;border:1px solid #d1e7dd;">
<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:0.5rem;flex-wrap:wrap;">
<div style="flex:1;">
<div style="font-size:1.15rem;font-weight:700;color:#0a4d3c;">${fmtName(phys)}</div>
${phys.specialty?`<div style="font-size:0.85rem;color:#555;margin-top:0.15rem;">${phys.specialty}${phys.academic_connection||phys.um_connection?' · '+(phys.academic_connection||phys.um_connection):''}</div>`:''}
${phys.email?`<div style="margin-top:0.3rem;"><a href="mailto:${phys.email}" onclick="event.stopPropagation()" style="color:#0a4d3c;font-size:0.875rem;">✉️ ${phys.email}</a></div>`:''}
</div>
<div style="flex-shrink:0;margin-top:0.15rem;">
${isStaff?'<span style="background:#0891b2;color:white;padding:0.2rem 0.55rem;border-radius:5px;font-size:0.78rem;font-weight:700;">Staff</span>':(np?`<span style="background:${tierColors[np]||'#64748b'};color:white;padding:0.2rem 0.55rem;border-radius:5px;font-size:0.82rem;font-weight:700;">P${np}</span>`:'')}
</div>
</div>
</div>`;
}
if (loc) {
html += `<div style="padding:1rem;background:#f9f9f9;border-radius:10px;margin-bottom:0.75rem;border:1px solid #e5e5e5;">
<div style="font-weight:600;color:#0a4d3c;font-size:0.95rem;margin-bottom:0.5rem;">${practice?.name || loc.label || 'Office'}</div>
<div class="location-details">${locDetails(loc)}</div>
</div>`;
}
html += `<div style="padding:1rem;background:#fff;border:1px solid #e5e5e5;border-radius:10px;margin-bottom:0.75rem;">
<div style="font-size:0.72rem;color:#999;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:0.5rem;">${fmtD(r.contact_date)}${noteTime?' · '+noteTime:''}${r.author?' — '+r.author:''}</div>
${taskNote?`<div style="font-weight:700;color:#92400e;background:#fef3c7;padding:0.3rem 0.6rem;border-radius:6px;margin-bottom:0.5rem;font-size:0.9rem;">📋 ${taskNote}</div>`:''}
<div style="font-size:0.9rem;color:#333;line-height:1.5;white-space:pre-wrap;">${displayNotes}</div>
${r.reminder_date?`<div style="margin-top:0.6rem;padding:0.3rem 0.6rem;border-radius:6px;font-size:0.82rem;font-weight:600;${isOpen?'background:#e5e7eb;color:#6b7280;':isOverdue?'background:#fef2f2;color:#dc2626;':'background:#fef3c7;color:#92400e;'}">${isOpen?'📌 Open task — no due date':isOverdue?`⚠️ OVERDUE — Due ${fmtD(r.reminder_date)}`:`🔔 Due ${fmtD(r.reminder_date)}`}</div>`:''}
</div>`;
const completeFn = `event.stopPropagation();completeReminder('${r.id}').then(()=>{closeTaskDetailModal();renderTasksView();})`;
const editFn = r.physician_id ? `closeTaskDetailModal();editNoteFromActivity('${r.id}','${r.physician_id}')` : '';
const delFn = r.physician_id ? `closeTaskDetailModal();deleteNoteFromActivity('${r.id}','${r.physician_id}').then(()=>renderTasksView())` : '';
const profileFn = phys ? `closeTaskDetailModal();setView('physicians');viewPhysician('${phys.id}')` : '';
html += `<div style="display:flex;flex-direction:column;gap:0.5rem;">
<button onclick="${completeFn}" style="padding:0.75rem;background:#10b981;color:white;border:none;border-radius:8px;font-weight:700;font-size:0.95rem;cursor:pointer;-webkit-tap-highlight-color:transparent;">✓ Mark Complete</button>
<div style="display:flex;gap:0.5rem;">
${editFn?`<button onclick="${editFn}" style="flex:1;padding:0.7rem;background:#0a4d3c;color:white;border:none;border-radius:8px;font-weight:600;font-size:0.875rem;cursor:pointer;">✏️ Edit Note</button>`:''}
${delFn?`<button onclick="${delFn}" style="flex:1;padding:0.7rem;background:#dc2626;color:white;border:none;border-radius:8px;font-weight:600;font-size:0.875rem;cursor:pointer;">🗑️ Delete</button>`:''}
</div>
${profileFn?`<button onclick="${profileFn}" style="padding:0.7rem;background:rgba(10,77,60,0.08);color:#0a4d3c;border:2px solid #0a4d3c;border-radius:8px;font-weight:600;font-size:0.875rem;cursor:pointer;">👤 View Full Profile</button>`:''}
</div>`;
$('taskDetailTitle').textContent = phys ? fmtName(phys) : (practice?.name || loc?.label || 'Task');
$('taskDetailBody').innerHTML = html;
$('taskDetailModal').classList.add('active');
}

// --- Activity view ---
async function renderActivityView(){
try{
const{data:allLogs,error}=await db.from('contact_logs').select('*').order('contact_date',{ascending:false}).order('created_at',{ascending:false}).limit(200);
if(error)throw error;
const physMap={};physicians.forEach(p=>physMap[p.id]=p);
const search=$('searchInput').value.toLowerCase();
const filtered=search?allLogs.filter(l=>{const p=physMap[l.physician_id]||{};
return(l.notes||'').toLowerCase().includes(search)||(l.author||'').toLowerCase().includes(search)||(p.first_name||'').toLowerCase().includes(search)||(p.last_name||'').toLowerCase().includes(search);
}):allLogs;
$('physicianList').innerHTML=filtered.length===0?'<li class="loading">No activity found</li>':
filtered.map(l=>{const p=l.physician_id?physMap[l.physician_id]:null;
let time=l.contact_time||'';let notes=l.notes||'';
if(!time&&notes.startsWith('[')){const m=notes.match(/^\[(\d{1,2}:\d{2})\]\s*/);if(m){time=m[1];notes=notes.slice(m[0].length);}}
const preview=notes.length>120?notes.slice(0,120)+'...':notes;
const nameDisplay=p?`${p.first_name||''} ${p.last_name||''}`.trim():(l.practice_location_id?getLocationLabel(l.practice_location_id):'Location Note');
const clickFn=l.physician_id?`viewPhysician('${l.physician_id}')`:l.practice_location_id?`viewLocation('${l.practice_location_id}')`:''
return`<li class="physician-item" onclick="${clickFn}">
<div class="name">${nameDisplay}</div>
<div class="practice">${l.contact_date}${time?' '+time:''}${l.author?' - '+l.author:''}</div>
<div style="font-size:0.75rem;color:#666;margin-top:0.25rem;">${preview}</div>
</li>`;}).join('');
$('physicianCount').textContent=filtered.length+' of '+allLogs.length+' activities';
$('mainContent').innerHTML=`<div class="section"><div class="section-header"><h3>Activity Log</h3><div style="font-size:0.8rem;color:#666;">${filtered.length} entries${search?' matching "'+search+'"':''}</div></div>
${filtered.length===0?'<div class="empty-notice">No activity found.</div>':
'<div class="contact-entries">'+filtered.map(e=>{const phys=e.physician_id?physMap[e.physician_id]:null;const canEdit=!!e.physician_id;return renderLogEntry(e,{physName:phys?fmtName(phys):null,editable:canEdit,editFn:`editNoteFromActivity('${e.id}','${e.physician_id}')`,deleteFn:`deleteNoteFromActivity('${e.id}','${e.physician_id}')`,full:true,showTimestamp:true});}).join('')+'</div>'}
</div>`;
}catch(e){console.error('Activity view error:',e);$('physicianList').innerHTML='<li class="loading">Error loading activity</li>';$('mainContent').innerHTML='<div class="empty-state"><h2>Activity</h2><p>Error loading. Try again.</p></div>';}
}

// --- Tasks view ---
async function renderTasksView(){
$('physicianCount').textContent='Tasks & Reminders';
const today = new Date().toISOString().split('T')[0];
try {
const{data:reminders,error}=await db.from('contact_logs').select('*').not('reminder_date','is',null).order('reminder_date',{ascending:true});
if(error)throw error;
const physMap={};physicians.forEach(p=>physMap[p.id]=p);
_taskDetailLogs={};reminders.forEach(r=>_taskDetailLogs[r.id]=r);
if(!reminders||reminders.length===0){
$('mainContent').innerHTML=`<div class="section"><div class="section-header"><h3>Tasks &amp; Reminders</h3></div><div class="empty-notice">No follow-up reminders set. Add a reminder when logging a contact note.</div></div>`;
return;
}
const OPEN_DATE='2099-12-31';
const openTasks=reminders.filter(r=>r.reminder_date===OPEN_DATE);
const datedR=reminders.filter(r=>r.reminder_date!==OPEN_DATE);
const overdue=datedR.filter(r=>r.reminder_date<today);
const upcoming=datedR.filter(r=>r.reminder_date>=today);
let html=`<div class="section"><div class="section-header"><h3>Tasks &amp; Reminders</h3><div style="font-size:0.8rem;color:#666;">${reminders.length} total${overdue.length>0?` — <span style="color:#dc2626;font-weight:600;">${overdue.length} overdue</span>`:''}${openTasks.length>0?` — ${openTasks.length} open`:''}</div></div>`;
if(overdue.length>0){
html+=`<div style="margin-bottom:1rem;"><div style="font-size:0.75rem;font-weight:700;color:#dc2626;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:0.5rem;padding-bottom:0.25rem;border-bottom:2px solid #fca5a5;">⚠️ Overdue (${overdue.length})</div><div class="contact-entries">`;
overdue.forEach(r=>{
const phys=r.physician_id?physMap[r.physician_id]:null;const physName=phys?fmtName(phys):(r.practice_location_id?getLocationLabel(r.practice_location_id):'Location Note');
const emailLink=phys?.email?` <a href="mailto:${phys.email}" style="color:#0a4d3c;font-size:0.75rem;">✉️ Email</a>`:'';
const tm=(r.notes||'').match(/^\[(\d{1,2}:\d{2}(?:\s*[APap][Mm])?)\]\s*/);
let displayNotes=tm?r.notes.replace(tm[0],''):(r.notes||'');
const taskMatch=displayNotes.match(/\s*\|\s*\[Task:\s*(.*?)\]$/);const taskNote=taskMatch?taskMatch[1].trim():'';if(taskMatch)displayNotes=displayNotes.slice(0,taskMatch.index).trim();
const preview=displayNotes.length>120?displayNotes.substring(0,120)+'...':displayNotes;
const editFn=r.physician_id?`editNoteFromActivity('${r.id}','${r.physician_id}')`:''
const delFn=r.physician_id?`deleteNoteFromActivity('${r.id}','${r.physician_id}').then(()=>renderTasksView())`:''
html+=`<div class="contact-entry" style="border-left-color:#dc2626;background:#fff5f5;display:flex;gap:0.5rem;align-items:flex-start;cursor:pointer;" onclick="openTaskDetailModal('${r.id}')"><button onclick="event.stopPropagation();completeReminder('${r.id}').then(()=>renderTasksView())" title="Mark complete" style="background:none;border:2px solid #dc2626;color:#dc2626;border-radius:50%;width:24px;height:24px;min-width:24px;cursor:pointer;font-size:0.8rem;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:0.15rem;">✓</button><div style="flex:1;"><div style="font-weight:600;color:#dc2626;">${physName}${emailLink}</div><div style="font-size:0.75rem;color:#dc2626;font-weight:600;">Due ${r.reminder_date} — OVERDUE</div>${taskNote?`<div style="font-size:0.85rem;font-weight:600;color:#92400e;background:#fef3c7;padding:0.2rem 0.5rem;border-radius:4px;margin-top:0.25rem;">📋 ${taskNote}</div>`:''}<div style="font-size:0.85rem;color:#333;margin-top:0.2rem;">${preview}</div><div style="font-size:0.7rem;color:#999;margin-top:0.2rem;">Note from ${r.contact_date}${r.author?' by '+r.author:''}</div>${editFn||delFn?`<div style="display:flex;gap:0.5rem;margin-top:0.4rem;">${editFn?`<button class="icon-btn" onclick="event.stopPropagation();${editFn}" title="Edit note & reminder date" style="font-size:0.85rem;">✏️ Edit</button>`:''}${delFn?`<button class="icon-btn" onclick="event.stopPropagation();${delFn}" title="Delete" style="font-size:0.85rem;color:#dc2626;">🗑️ Delete</button>`:''}</div>`:''}</div></div>`;
});
html+='</div></div>';
}
if(upcoming.length>0){
const byDate={};upcoming.forEach(r=>{if(!byDate[r.reminder_date])byDate[r.reminder_date]=[];byDate[r.reminder_date].push(r);});
Object.entries(byDate).forEach(([date,dayR])=>{
const d=new Date(date+'T12:00:00');const label=d.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'});
const isToday=date===today;
html+=`<div style="margin-bottom:0.75rem;"><div style="font-size:0.75rem;font-weight:700;color:#92400e;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:0.5rem;padding-bottom:0.25rem;border-bottom:2px solid #fcd34d;">${isToday?'📅 TODAY — ':''}${label}</div><div class="contact-entries">`;
dayR.forEach(r=>{
const phys=r.physician_id?physMap[r.physician_id]:null;const physName=phys?fmtName(phys):(r.practice_location_id?getLocationLabel(r.practice_location_id):'Location Note');
const emailLink=phys?.email?` <a href="mailto:${phys.email}" onclick="event.stopPropagation()" style="color:#0a4d3c;font-size:0.75rem;">✉️ Email</a>`:'';
const tm=(r.notes||'').match(/^\[(\d{1,2}:\d{2}(?:\s*[APap][Mm])?)\]\s*/);
let displayNotes=tm?r.notes.replace(tm[0],''):(r.notes||'');
const taskMatch=displayNotes.match(/\s*\|\s*\[Task:\s*(.*?)\]$/);const taskNote=taskMatch?taskMatch[1].trim():'';if(taskMatch)displayNotes=displayNotes.slice(0,taskMatch.index).trim();
const preview=displayNotes.length>120?displayNotes.substring(0,120)+'...':displayNotes;
const editFn=r.physician_id?`editNoteFromActivity('${r.id}','${r.physician_id}')`:''
const delFn=r.physician_id?`deleteNoteFromActivity('${r.id}','${r.physician_id}').then(()=>renderTasksView())`:''
html+=`<div class="contact-entry" style="border-left-color:#f59e0b;display:flex;gap:0.5rem;align-items:flex-start;cursor:pointer;" onclick="openTaskDetailModal('${r.id}')"><button onclick="event.stopPropagation();completeReminder('${r.id}').then(()=>renderTasksView())" title="Mark complete" style="background:none;border:2px solid #f59e0b;color:#92400e;border-radius:50%;width:24px;height:24px;min-width:24px;cursor:pointer;font-size:0.8rem;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:0.15rem;">✓</button><div style="flex:1;"><div style="font-weight:600;color:#0a4d3c;">${physName}${emailLink}</div>${taskNote?`<div style="font-size:0.85rem;font-weight:600;color:#92400e;background:#fef3c7;padding:0.2rem 0.5rem;border-radius:4px;margin-top:0.25rem;">📋 ${taskNote}</div>`:''}<div style="font-size:0.85rem;color:#333;margin-top:0.2rem;">${preview}</div><div style="font-size:0.7rem;color:#999;margin-top:0.2rem;">Note from ${r.contact_date}${r.author?' by '+r.author:''}</div>${editFn||delFn?`<div style="display:flex;gap:0.5rem;margin-top:0.4rem;">${editFn?`<button class="icon-btn" onclick="event.stopPropagation();${editFn}" title="Edit note & reminder date" style="font-size:0.85rem;">✏️ Edit</button>`:''}${delFn?`<button class="icon-btn" onclick="event.stopPropagation();${delFn}" title="Delete" style="font-size:0.85rem;color:#dc2626;">🗑️ Delete</button>`:''}</div>`:''}</div></div>`;
});
html+='</div></div>';
});
}
if(openTasks.length>0){
html+=`<div style="margin-bottom:0.75rem;"><div style="font-size:0.75rem;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:0.5rem;padding-bottom:0.25rem;border-bottom:2px solid #d1d5db;">📌 Open Tasks — no due date (${openTasks.length})</div><div class="contact-entries">`;
openTasks.forEach(r=>{
const phys=r.physician_id?physMap[r.physician_id]:null;const physName=phys?fmtName(phys):(r.practice_location_id?getLocationLabel(r.practice_location_id):'Location Note');
const emailLink=phys?.email?` <a href="mailto:${phys.email}" onclick="event.stopPropagation()" style="color:#0a4d3c;font-size:0.75rem;">✉️ Email</a>`:'';
const tm=(r.notes||'').match(/^\[(\d{1,2}:\d{2}(?:\s*[APap][Mm])?)\]\s*/);
let displayNotes=tm?r.notes.replace(tm[0],''):(r.notes||'');
const taskMatch=displayNotes.match(/\s*\|\s*\[Task:\s*(.*?)\]$/);const taskNote=taskMatch?taskMatch[1].trim():'';if(taskMatch)displayNotes=displayNotes.slice(0,taskMatch.index).trim();
const preview=displayNotes.length>120?displayNotes.substring(0,120)+'...':displayNotes;
const editFn=r.physician_id?`editNoteFromActivity('${r.id}','${r.physician_id}')`:''
const delFn=r.physician_id?`deleteNoteFromActivity('${r.id}','${r.physician_id}').then(()=>renderTasksView())`:''
html+=`<div class="contact-entry" style="border-left-color:#6b7280;display:flex;gap:0.5rem;align-items:flex-start;cursor:pointer;" onclick="openTaskDetailModal('${r.id}')"><button onclick="event.stopPropagation();completeReminder('${r.id}').then(()=>renderTasksView())" title="Mark complete" style="background:none;border:2px solid #6b7280;color:#6b7280;border-radius:50%;width:24px;height:24px;min-width:24px;cursor:pointer;font-size:0.8rem;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:0.15rem;">✓</button><div style="flex:1;"><div style="font-weight:600;color:#0a4d3c;">${physName}${emailLink}</div>${taskNote?`<div style="font-size:0.85rem;font-weight:600;color:#92400e;background:#fef3c7;padding:0.2rem 0.5rem;border-radius:4px;margin-top:0.25rem;">📋 ${taskNote}</div>`:''}<div style="font-size:0.85rem;color:#333;margin-top:0.2rem;">${preview}</div><div style="font-size:0.7rem;color:#999;margin-top:0.2rem;">Note from ${r.contact_date}${r.author?' by '+r.author:''}</div>${editFn||delFn?`<div style="display:flex;gap:0.5rem;margin-top:0.4rem;">${editFn?`<button class="icon-btn" onclick="event.stopPropagation();${editFn}" title="Edit note & reminder date" style="font-size:0.85rem;">✏️ Edit</button>`:''}${delFn?`<button class="icon-btn" onclick="event.stopPropagation();${delFn}" title="Delete" style="font-size:0.85rem;color:#dc2626;">🗑️ Delete</button>`:''}</div>`:''}</div></div>`;
});
html+='</div></div>';
}
html+='</div>';
$('mainContent').innerHTML=html;
}catch(e){console.error('Tasks view error:',e);$('mainContent').innerHTML='<div class="section"><div class="section-header"><h3>Tasks</h3></div><div class="empty-notice">Error loading tasks</div></div>';}
}

// --- Dashboard view ---
async function renderDashboard(){
const{data:allLogs,error}=await db.from('contact_logs').select('*').order('contact_date',{ascending:false});
const logs=allLogs||[];
const now=new Date();const today=now.toISOString().slice(0,10);
const weekAgo=new Date(now-7*86400000).toISOString().slice(0,10);
const monthAgo=new Date(now-30*86400000).toISOString().slice(0,10);
const thisWeek=logs.filter(l=>l.contact_date>=weekAgo).length;
const thisMonth=logs.filter(l=>l.contact_date>=monthAgo).length;
const tierCounts={};physicians.forEach(p=>{const t=p.priority||'Unset';tierCounts[t]=(tierCounts[t]||0)+1;});
const tierHTML=Object.entries(tierCounts).sort((a,b)=>a[0].localeCompare(b[0])).map(([t,c])=>`<div style="display:flex;justify-content:space-between;padding:0.5rem 0;border-bottom:1px solid #f0f0f0;"><span>${t==='Unset'?'Unset':'P'+t}</span><strong>${c}</strong></div>`).join('');
const specCounts={};physicians.forEach(p=>{const s=p.specialty||'Unset';specCounts[s]=(specCounts[s]||0)+1;});
const specHTML=Object.entries(specCounts).sort((a,b)=>b[1]-a[1]).map(([s,c])=>`<div style="display:flex;justify-content:space-between;padding:0.5rem 0;border-bottom:1px solid #f0f0f0;"><span>${s}</span><strong>${c}</strong></div>`).join('');
const cityCounts={};physicians.forEach(p=>{const loc=getPrimaryLoc(p.id);const c=loc.city||'Unknown';cityCounts[c]=(cityCounts[c]||0)+1;});
const cityHTML=Object.entries(cityCounts).sort((a,b)=>b[1]-a[1]).slice(0,15).map(([c,n])=>`<div style="display:flex;justify-content:space-between;padding:0.5rem 0;border-bottom:1px solid #f0f0f0;"><span>${c}</span><strong>${n}</strong></div>`).join('');
const contactCounts={};logs.forEach(l=>{contactCounts[l.physician_id]=(contactCounts[l.physician_id]||0)+1;});
const physMap={};physicians.forEach(p=>physMap[p.id]=p);
const mostContacted=Object.entries(contactCounts).sort((a,b)=>b[1]-a[1]).slice(0,10).map(([id,c])=>{const p=physMap[id];return p?`<div style="display:flex;justify-content:space-between;padding:0.5rem 0;border-bottom:1px solid #f0f0f0;cursor:pointer;" onclick="setView('physicians');viewPhysician('${id}')"><span>${p.first_name} ${p.last_name}</span><strong>${c}</strong></div>`:'';}).join('');
const contacted=new Set(logs.map(l=>l.physician_id));
const neverContacted=physicians.filter(p=>!contacted.has(p.id));
const neverHTML=neverContacted.slice(0,10).map(p=>`<div style="padding:0.5rem 0;border-bottom:1px solid #f0f0f0;cursor:pointer;" onclick="setView('physicians');viewPhysician('${p.id}')">${p.first_name} ${p.last_name} <span style="font-size:0.75rem;color:#999;">${p.priority?'P'+p.priority:'No priority'}</span></div>`).join('');
const card=(title,content)=>`<div style="background:white;padding:1.25rem;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,0.1);"><h4 style="color:#0a4d3c;margin-bottom:0.75rem;font-size:1rem;">${title}</h4>${content}</div>`;
const stat=(label,val,color)=>`<div style="background:white;padding:1.25rem;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,0.1);text-align:center;"><div style="font-size:2rem;font-weight:700;color:${color||'#0a4d3c'};">${val}</div><div style="font-size:0.75rem;color:#999;margin-top:0.25rem;">${label}</div></div>`;
$('mainContent').innerHTML=`
<div style="margin-bottom:1rem;"><h2 style="color:#0a4d3c;font-size:1.5rem;">Territory Dashboard</h2></div>
<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:0.75rem;margin-bottom:1rem;">
${stat('Providers',physicians.length)}
${stat('Practices',practices.length)}
${stat('Locations',practiceLocations.length)}
${stat('Total Contacts',logs.length)}
${stat('This Week',thisWeek,'#f97316')}
${stat('This Month',thisMonth,'#0ea5e9')}
</div>
<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:0.75rem;">
${card('By Tier',tierHTML)}
${card('By Specialty',specHTML)}
${card('By City (Top 15)',cityHTML)}
${card('Most Contacted',mostContacted)}
${card('Never Contacted ('+neverContacted.length+')',neverHTML||'<div style="color:#10b981;padding:0.5rem 0;">All physicians contacted!</div>')}
</div>`;
$('physicianCount').textContent='Territory Dashboard';
}

// --- Map view ---
let territoryMap=null;
const geocodeCache=(function(){try{return JSON.parse(localStorage.getItem('geocodeCache')||'{}');}catch(e){return {};}})();
function saveGeocodeCache(){try{localStorage.setItem('geocodeCache',JSON.stringify(geocodeCache));}catch(e){}}
let territoryMapCache=null;
function getMapDataVersion(){return practiceLocations.length+'_'+physicians.length+'_'+Object.keys(physicianAssignments).length;}
function buildMarkerPopup(loc,practiceName,physNames,addr){
return '<strong>'+(practiceName||loc.label||'Office')+'</strong><br>'
+addr+'<br>'
+(physNames?'<em>'+physNames+'</em><br>':'')
+'<a href="https://maps.apple.com/?q='+encodeURIComponent(addr)+'" target="_blank" style="color:#0a4d3c;">Get Directions</a>';
}
async function renderMapView(){
const search=($('searchInput').value||'').toLowerCase().trim();
$('mainContent').innerHTML='<div style="position:relative;height:calc(100vh - 2rem);"><div id="mapContainer" style="height:100%;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);"></div><button onclick="locateOnMap()" style="position:absolute;top:0.75rem;right:0.75rem;z-index:1000;background:white;border:2px solid #0a4d3c;color:#0a4d3c;padding:0.5rem 0.75rem;border-radius:8px;font-size:0.85rem;font-weight:600;cursor:pointer;box-shadow:0 2px 4px rgba(0,0,0,0.2);">📍 My Location</button></div>';
if(territoryMap){territoryMap.remove();territoryMap=null;}
territoryMap=L.map('mapContainer').setView([25.76,-80.19],11);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'OpenStreetMap',maxZoom:18}).addTo(territoryMap);
territoryMap.on('locationerror',()=>showToast('Location access denied or unavailable','error'));
const version=getMapDataVersion();
if(!search&&territoryMapCache&&territoryMapCache.version===version){
territoryMapCache.markers.forEach(m=>{L.marker([m.lat,m.lng]).addTo(territoryMap).bindPopup(m.popup);});
$('physicianCount').textContent='Territory Map ('+territoryMapCache.markers.length+' locations, cached)';
if(territoryMapCache.bounds.length>1)territoryMap.fitBounds(territoryMapCache.bounds,{padding:[30,30]});
else if(territoryMapCache.bounds.length===1)territoryMap.setView(territoryMapCache.bounds[0],15);
return;
}
const filteredLocIds=new Set();
if(search){
const filteredPhys=getFilteredPhysicians(search);
filteredPhys.forEach(p=>{(physicianAssignments[p.id]||[]).forEach(a=>{if(a.practice_location_id)filteredLocIds.add(a.practice_location_id);});});
practiceLocations.filter(l=>l.address&&l.city).forEach(l=>{
if([l.address,l.city,l.zip,l.phone,l.fax,l.label,l.practices?.name||''].some(v=>(v||'').toLowerCase().includes(search)))filteredLocIds.add(l.id);
});
}
const locs=practiceLocations.filter(l=>l.address&&l.city&&(!search||filteredLocIds.has(l.id)));
$('physicianCount').textContent=search?'Map: "'+search+'" ('+locs.length+' locations)':'Territory Map ('+locs.length+' locations)';
if(search&&territoryMapCache&&territoryMapCache.version===version){
const subset=territoryMapCache.markers.filter(m=>filteredLocIds.has(m.locId));
const bounds=[];
subset.forEach(m=>{L.marker([m.lat,m.lng]).addTo(territoryMap).bindPopup(m.popup);bounds.push([m.lat,m.lng]);});
$('physicianCount').textContent='Map: "'+search+'" ('+subset.length+' locations)';
if(bounds.length>1)territoryMap.fitBounds(bounds,{padding:[30,30]});
else if(bounds.length===1)territoryMap.setView(bounds[0],15);
return;
}
let plotted=0;
const statusEl=document.createElement('div');
statusEl.style.cssText='position:absolute;top:10px;right:10px;z-index:1000;background:white;padding:0.5rem 1rem;border-radius:8px;font-size:0.8rem;box-shadow:0 2px 4px rgba(0,0,0,0.2);';
document.getElementById('mapContainer').appendChild(statusEl);
const uncachedCount=locs.filter(l=>!geocodeCache[l.address+', '+l.city+', FL '+(l.zip||'')]).length;
statusEl.textContent=uncachedCount?'Geocoding '+uncachedCount+' new addresses...':'Loading '+locs.length+' locations...';
const bounds=[];
const builtMarkers=[];
for(const loc of locs){
const addr=loc.address+', '+loc.city+', FL '+(loc.zip||'');
const practiceName=loc.practices?.name||practices.find(p=>p.id===loc.practice_id)?.name||'';
const assignedPhys=physicians.filter(p=>(physicianAssignments[p.id]||[]).some(a=>a.practice_location_id===loc.id));
const physNames=assignedPhys.map(p=>p.first_name+' '+p.last_name).join(', ');
try{
let coords=geocodeCache[addr];
if(!coords){
const r=await fetch('https://nominatim.openstreetmap.org/search?format=json&q='+encodeURIComponent(addr)+'&limit=1');
const d=await r.json();
if(d&&d[0]){coords={lat:parseFloat(d[0].lat),lng:parseFloat(d[0].lon)};geocodeCache[addr]=coords;saveGeocodeCache();}
await new Promise(ok=>setTimeout(ok,300));
}
if(coords){
const popup=buildMarkerPopup(loc,practiceName,physNames,addr);
L.marker([coords.lat,coords.lng]).addTo(territoryMap).bindPopup(popup);
bounds.push([coords.lat,coords.lng]);
builtMarkers.push({lat:coords.lat,lng:coords.lng,popup,locId:loc.id});
plotted++;
}
}catch(e){console.log('Geocode error for '+addr,e);}
if(uncachedCount)statusEl.textContent='Plotted '+plotted+' of '+locs.length+'...';
}
statusEl.textContent=plotted+' locations mapped'+(search?' for "'+search+'"':'');
setTimeout(()=>statusEl.remove(),3000);
if(bounds.length>1)territoryMap.fitBounds(bounds,{padding:[30,30]});
else if(bounds.length===1)territoryMap.setView(bounds[0],15);
else territoryMap.invalidateSize();
if(!search)territoryMapCache={version,markers:builtMarkers,bounds};
}

let myLocationMarker = null;
function locateOnMap() {
if (!territoryMap) { showToast('Open the map first', 'info'); return; }
if (!navigator.geolocation) { showToast('Geolocation not supported by this browser', 'error'); return; }
showToast('Getting your location…', 'info');
navigator.geolocation.getCurrentPosition(pos => {
const latlng = [pos.coords.latitude, pos.coords.longitude];
if (myLocationMarker) myLocationMarker.remove();
const icon = L.divIcon({className:'', html:'<div style="width:18px;height:18px;background:#2563eb;border:3px solid white;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,0.4);"></div>', iconSize:[18,18], iconAnchor:[9,9]});
myLocationMarker = L.marker(latlng, {icon}).addTo(territoryMap).bindPopup('<strong>Your Location</strong>').openPopup();
territoryMap.setView(latlng, 13);
}, err => {
showToast('Could not get location: ' + err.message, 'error');
}, {enableHighAccuracy: true, timeout: 10000});
}
