// === js/views.js === Activity view, Tasks view, Dashboard view, Map view

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
filtered.map(l=>{const p=physMap[l.physician_id]||{};
let time=l.contact_time||'';let notes=l.notes||'';
if(!time&&notes.startsWith('[')){const m=notes.match(/^\[(\d{1,2}:\d{2})\]\s*/);if(m){time=m[1];notes=notes.slice(m[0].length);}}
const preview=notes.length>120?notes.slice(0,120)+'...':notes;
return`<li class="physician-item" onclick="viewPhysician('${l.physician_id}')">
<div class="name">${p.first_name||''} ${p.last_name||''}</div>
<div class="practice">${l.contact_date}${time?' '+time:''}${l.author?' - '+l.author:''}</div>
<div style="font-size:0.75rem;color:#666;margin-top:0.25rem;">${preview}</div>
</li>`;}).join('');
$('physicianCount').textContent=filtered.length+' of '+allLogs.length+' activities';
$('mainContent').innerHTML=`<div class="section"><div class="section-header"><h3>Activity Log</h3><div style="font-size:0.8rem;color:#666;">${filtered.length} entries${search?' matching "'+search+'"':''}</div></div>
${filtered.length===0?'<div class="empty-notice">No activity found.</div>':
'<div class="contact-entries">'+filtered.map(e=>{const phys=physMap[e.physician_id];return renderLogEntry(e,{physName:phys?fmtName(phys):'Unknown',editable:true,editFn:`editNoteFromActivity('${e.id}','${e.physician_id}')`,deleteFn:`deleteNoteFromActivity('${e.id}','${e.physician_id}')`,full:true,showTimestamp:true});}).join('')+'</div>'}
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
if(!reminders||reminders.length===0){
$('mainContent').innerHTML=`<div class="section"><div class="section-header"><h3>Tasks &amp; Reminders</h3></div><div class="empty-notice">No follow-up reminders set. Add a reminder when logging a contact note.</div></div>`;
return;
}
const overdue=reminders.filter(r=>r.reminder_date<today);
const upcoming=reminders.filter(r=>r.reminder_date>=today);
let html=`<div class="section"><div class="section-header"><h3>Tasks &amp; Reminders</h3><div style="font-size:0.8rem;color:#666;">${reminders.length} total${overdue.length>0?` — <span style="color:#dc2626;font-weight:600;">${overdue.length} overdue</span>`:''}</div></div>`;
if(overdue.length>0){
html+=`<div style="margin-bottom:1rem;"><div style="font-size:0.75rem;font-weight:700;color:#dc2626;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:0.5rem;padding-bottom:0.25rem;border-bottom:2px solid #fca5a5;">⚠️ Overdue (${overdue.length})</div><div class="contact-entries">`;
overdue.forEach(r=>{
const phys=physMap[r.physician_id];const physName=phys?fmtName(phys):'Unknown';
const emailLink=phys?.email?` <a href="mailto:${phys.email}" style="color:#0a4d3c;font-size:0.75rem;">✉️ Email</a>`:'';
const tm=(r.notes||'').match(/^\[(\d{1,2}:\d{2}(?:\s*[APap][Mm])?)\]\s*/);
const displayNotes=tm?r.notes.replace(tm[0],''):(r.notes||'');
const preview=displayNotes.length>120?displayNotes.substring(0,120)+'...':displayNotes;
html+=`<div class="contact-entry" style="border-left-color:#dc2626;background:#fff5f5;display:flex;gap:0.5rem;align-items:flex-start;cursor:pointer;" onclick="viewPhysician('${r.physician_id}')">
<div style="display:flex;flex-direction:column;gap:0.25rem;flex-shrink:0;margin-top:0.1rem;">
<button onclick="event.stopPropagation();completeReminder('${r.id}').then(()=>renderTasksView())" title="Mark complete" style="background:none;border:2px solid #dc2626;color:#dc2626;border-radius:50%;width:24px;height:24px;cursor:pointer;font-size:0.8rem;display:flex;align-items:center;justify-content:center;">✓</button>
<button onclick="event.stopPropagation();openEditTaskModal('${r.id}')" title="Edit task" style="background:none;border:2px solid #9ca3af;color:#6b7280;border-radius:50%;width:24px;height:24px;cursor:pointer;font-size:0.75rem;display:flex;align-items:center;justify-content:center;">✏️</button>
</div>
<div style="flex:1;"><div style="font-weight:600;color:#dc2626;">${physName}${emailLink}</div>
<div style="font-size:0.75rem;color:#dc2626;font-weight:600;">Due ${r.reminder_date} — OVERDUE</div>
<div style="font-size:0.85rem;color:#333;margin-top:0.25rem;">${preview}</div>
<div style="font-size:0.7rem;color:#999;margin-top:0.2rem;">Note from ${r.contact_date}${r.author?' by '+r.author:''}</div>
</div></div>`;
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
const phys=physMap[r.physician_id];const physName=phys?fmtName(phys):'Unknown';
const emailLink=phys?.email?` <a href="mailto:${phys.email}" onclick="event.stopPropagation()" style="color:#0a4d3c;font-size:0.75rem;">✉️ Email</a>`:'';
const tm=(r.notes||'').match(/^\[(\d{1,2}:\d{2}(?:\s*[APap][Mm])?)\]\s*/);
const displayNotes=tm?r.notes.replace(tm[0],''):(r.notes||'');
const preview=displayNotes.length>120?displayNotes.substring(0,120)+'...':displayNotes;
html+=`<div class="contact-entry" style="border-left-color:#f59e0b;display:flex;gap:0.5rem;align-items:flex-start;cursor:pointer;" onclick="viewPhysician('${r.physician_id}')">
<div style="display:flex;flex-direction:column;gap:0.25rem;flex-shrink:0;margin-top:0.1rem;">
<button onclick="event.stopPropagation();completeReminder('${r.id}').then(()=>renderTasksView())" title="Mark complete" style="background:none;border:2px solid #f59e0b;color:#92400e;border-radius:50%;width:24px;height:24px;cursor:pointer;font-size:0.8rem;display:flex;align-items:center;justify-content:center;">✓</button>
<button onclick="event.stopPropagation();openEditTaskModal('${r.id}')" title="Edit task" style="background:none;border:2px solid #9ca3af;color:#6b7280;border-radius:50%;width:24px;height:24px;cursor:pointer;font-size:0.75rem;display:flex;align-items:center;justify-content:center;">✏️</button>
</div>
<div style="flex:1;"><div style="font-weight:600;color:#0a4d3c;">${physName}${emailLink}</div>
<div style="font-size:0.85rem;color:#333;margin-top:0.25rem;">${preview}</div>
<div style="font-size:0.7rem;color:#999;margin-top:0.2rem;">Note from ${r.contact_date}${r.author?' by '+r.author:''}</div>
</div></div>`;
});
html+='</div></div>';
});
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
const tierHTML=Object.entries(tierCounts).sort((a,b)=>a[0].localeCompare(b[0])).map(([t,c])=>`<div style="display:flex;justify-content:space-between;padding:0.5rem 0;border-bottom:1px solid #f0f0f0;"><span>Tier ${t}</span><strong>${c}</strong></div>`).join('');
const specCounts={};physicians.forEach(p=>{const s=p.specialty||'Unset';specCounts[s]=(specCounts[s]||0)+1;});
const specHTML=Object.entries(specCounts).sort((a,b)=>b[1]-a[1]).map(([s,c])=>`<div style="display:flex;justify-content:space-between;padding:0.5rem 0;border-bottom:1px solid #f0f0f0;"><span>${s}</span><strong>${c}</strong></div>`).join('');
const cityCounts={};physicians.forEach(p=>{const loc=getPrimaryLoc(p.id);const c=loc.city||'Unknown';cityCounts[c]=(cityCounts[c]||0)+1;});
const cityHTML=Object.entries(cityCounts).sort((a,b)=>b[1]-a[1]).slice(0,15).map(([c,n])=>`<div style="display:flex;justify-content:space-between;padding:0.5rem 0;border-bottom:1px solid #f0f0f0;"><span>${c}</span><strong>${n}</strong></div>`).join('');
const contactCounts={};logs.forEach(l=>{contactCounts[l.physician_id]=(contactCounts[l.physician_id]||0)+1;});
const physMap={};physicians.forEach(p=>physMap[p.id]=p);
const mostContacted=Object.entries(contactCounts).sort((a,b)=>b[1]-a[1]).slice(0,10).map(([id,c])=>{const p=physMap[id];return p?`<div style="display:flex;justify-content:space-between;padding:0.5rem 0;border-bottom:1px solid #f0f0f0;cursor:pointer;" onclick="setView('physicians');viewPhysician('${id}')"><span>${p.first_name} ${p.last_name}</span><strong>${c}</strong></div>`:'';}).join('');
const contacted=new Set(logs.map(l=>l.physician_id));
const neverContacted=physicians.filter(p=>!contacted.has(p.id));
const neverHTML=neverContacted.slice(0,10).map(p=>`<div style="padding:0.5rem 0;border-bottom:1px solid #f0f0f0;cursor:pointer;" onclick="setView('physicians');viewPhysician('${p.id}')">${p.first_name} ${p.last_name} <span style="font-size:0.75rem;color:#999;">Tier ${p.priority||'?'}</span></div>`).join('');
const card=(title,content)=>`<div style="background:white;padding:1.25rem;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,0.1);"><h4 style="color:#0a4d3c;margin-bottom:0.75rem;font-size:1rem;">${title}</h4>${content}</div>`;
const stat=(label,val,color)=>`<div style="background:white;padding:1.25rem;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,0.1);text-align:center;"><div style="font-size:2rem;font-weight:700;color:${color||'#0a4d3c'};">${val}</div><div style="font-size:0.75rem;color:#999;margin-top:0.25rem;">${label}</div></div>`;
$('mainContent').innerHTML=`
<div style="margin-bottom:1rem;"><h2 style="color:#0a4d3c;font-size:1.5rem;">Territory Dashboard</h2></div>
<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:0.75rem;margin-bottom:1rem;">
${stat('Physicians',physicians.length)}
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
