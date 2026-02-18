// === js/init.js === Constants, DB client, global state, core utilities, DOMContentLoaded
const SUPABASE_URL = 'https://xhdjywibdjzbczfjmctp.supabase.co';
// Google Sheet: Field Routing (persistent reference, auto-republishes)
// View: https://docs.google.com/spreadsheets/d/1zcVCVIciyScC3IcclfuBy4T4ogdcNSBVlxn6ZmYeiG0/edit?gid=150527751
// CSV: https://docs.google.com/spreadsheets/d/e/2PACX-1vSgKpcd74ISyaPdczn444-3z14Cmy7hObV3h5zY73q0lswJxlPeWIgaSGntQ1HKQUduefWDAz07rAwd/pub?gid=150527751&single=true&output=csv
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhoZGp5d2liZGp6YmN6ZmptY3RwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk3NzE4MTYsImV4cCI6MjA4NTM0NzgxNn0.vHAfeYTVbu2Isu5AoFONvzrtJ2sS3YwF00QRe3LNrbU';
const { createClient } = window.supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const $=id=>document.getElementById(id);
async function withSave(btnId,label,fn){const btn=$(btnId);if(btn.classList.contains('saving'))return;btn.textContent='Saving...';btn.classList.add('saving');try{updateSyncIndicators('syncing');await fn();btn.textContent='Saved!';btn.classList.remove('saving');btn.classList.add('saved');updateSyncIndicators('synced');}catch(e){console.error('Save error:',e);showToast('Error: '+e.message,'error');btn.textContent=label;btn.classList.remove('saving');updateSyncIndicators('error');throw e;}}
async function dbDel(table,id,msg,after){if(!confirm(msg))return;try{updateSyncIndicators('syncing');const{error}=await db.from(table).delete().eq('id',id);if(error)throw error;await after();showToast('Deleted','success');updateSyncIndicators('synced');}catch(e){console.error('Delete error:',e);showToast('Error: '+e.message,'error');updateSyncIndicators('error');}}
function setFields(map){for(const[id,val]of Object.entries(map))$(id).value=val;}

// --- Global state ---
let physicians = [];
let practices = [];
let practiceLocations = [];
let physicianAssignments = {};
let contactLogs = {};
let currentPhysician = null;
let currentPractice = null;
let currentView = 'physicians';
let sortBy = 'name';
let editMode = false;
let editingContactId = null;
let editingLocationId = null;
let editingPracticeId = null;
let selectedPracticeId = null;
let selectedLocationIds = [];
let cachedLatestActivity = {};

document.addEventListener('DOMContentLoaded', async () => {
setToday();
await loadAllData();
await runVolumeMigration();
await runASMigration();
setupRealtimeSubscription();
// Prevent background scroll when modals are open (iPad fix)
document.querySelectorAll('.modal').forEach(modal => {
modal.addEventListener('touchmove', function(e) {
const content = modal.querySelector('.modal-content');
if (content && content.contains(e.target)) return;
e.preventDefault();
}, { passive: false });
});
});

function setToday() {
const today = new Date();
const yyyy = today.getFullYear();
const mm = String(today.getMonth() + 1).padStart(2, '0');
const dd = String(today.getDate()).padStart(2, '0');
const hh = String(today.getHours()).padStart(2, '0');
const min = String(today.getMinutes()).padStart(2, '0');
$('contactDate').value = `${yyyy}-${mm}-${dd}`;
$('contactTime').value = `${hh}:${min}`;
}

function showToast(message, type = 'info') {
const container = $('toastContainer');
const toast = document.createElement('div');
toast.className = `toast ${type}`;
toast.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:0.5rem;';
const msg = document.createElement('span');
msg.textContent = message;
toast.appendChild(msg);
if (type === 'error') {
const closeBtn = document.createElement('button');
closeBtn.textContent = '\u00d7';
closeBtn.style.cssText = 'background:none;border:none;color:white;font-size:1.5rem;cursor:pointer;padding:0 0.25rem;flex-shrink:0;';
closeBtn.onclick = () => toast.remove();
toast.appendChild(closeBtn);
}
container.appendChild(toast);
const duration = type === 'error' ? 10000 : 3000;
setTimeout(() => toast.remove(), duration);
}

function updateConnectionStatus(status) {
const el = $('connectionStatus');
el.className = `connection-status ${status}`;
el.textContent = status === 'connected' ? 'Connected - Real-time sync active' :
status === 'syncing' ? 'Syncing...' : 'Disconnected - Working offline';
el.classList.remove('hidden');
if (status === 'connected') {
setTimeout(() => el.classList.add('hidden'), 2000);
}
}

function updateSyncIndicators(status) {
const classes = { synced: 'synced', syncing: 'syncing', error: 'error' };
$('mobileSyncIndicator').className = `sync-indicator ${classes[status] || 'synced'}`;
$('desktopSyncIndicator').className = `sync-indicator ${classes[status] || 'synced'}`;
}
