// === js/data.js === Data loading, migrations, contact log fetching
async function loadAllData() {
try {
updateSyncIndicators('syncing');
const [physRes, practRes, locRes, assignRes] = await Promise.all([
  db.from('providers').select('*').order('last_name', { ascending: true }),
  db.from('practices').select('*').order('name', { ascending: true }),
  db.from('practice_locations').select('*, practices(name)').order('city', { ascending: true }),
  db.from('provider_location_assignments').select('*, practice_locations(*, practices(name))'),
]);
if (physRes.error) throw physRes.error;
physicians = physRes.data || [];
if (!practRes.error) practices = practRes.data || [];
if (!locRes.error) practiceLocations = locRes.data || [];
if (!assignRes.error) {
physicianAssignments = {};
(assignRes.data || []).forEach(a => {
if (!physicianAssignments[a.provider_id]) physicianAssignments[a.provider_id] = [];
physicianAssignments[a.provider_id].push(a);
});
}
territoryMapCache=null;
renderList();
updateSyncIndicators('synced');
updateConnectionStatus('connected');
} catch (error) {
console.error('Error loading data:', error);
updateSyncIndicators('error');
showToast('Error loading data: ' + error.message, 'error');
}
}

async function loadContactLogs(physicianId) {
try {
const { data, error } = await db
.from('contact_logs')
.select('*')
.eq('provider_id', physicianId)
.order('contact_date', { ascending: false })
.order('created_at', { ascending: false });
if (error) throw error;
contactLogs[physicianId] = data || [];
} catch (error) {
console.error('Error loading contact logs:', error);
}
}
