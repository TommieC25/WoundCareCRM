// === js/data.js === Data loading, migrations, contact log fetching
async function loadAllData() {
try {
updateSyncIndicators('syncing');
const { data: physData, error: physError } = await db
.from('physicians')
.select('*')
.order('last_name', { ascending: true });
if (physError) throw physError;
physicians = physData || [];
const { data: practData, error: practError } = await db
.from('practices')
.select('*')
.order('name', { ascending: true });
if (!practError) {
practices = practData || [];
}
const { data: locData, error: locError } = await db
.from('practice_locations')
.select('*, practices(name)')
.order('city', { ascending: true });
if (!locError) {
practiceLocations = locData || [];
}
const { data: assignData, error: assignError } = await db
.from('physician_location_assignments')
.select('*, practice_locations(*, practices(name))');
if (!assignError) {
physicianAssignments = {};
(assignData || []).forEach(a => {
if (!physicianAssignments[a.physician_id]) {
physicianAssignments[a.physician_id] = [];
}
physicianAssignments[a.physician_id].push(a);
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

async function runVolumeMigration() {
if (localStorage.getItem('volumeMigration20260217')) return;
const volData = {
'Amy|DeGirolamo': 95, 'Mario Adrian|Cala': 84, 'Nathalie|Mendez': 84,
'Michelle|Detweiler': 90, 'Kimberly|Bullock': 74, 'James A.|Green': 76,
'Pritesh|Patel': 87, 'Pollyanna|Reeves': 76, 'Jignesh|Desai': 82,
'Ashley|Bowles': 88, 'Alan|MacGill': 95, 'Nathan D.|Vela': 92,
'Kyle|Kinmon': 90, 'Jacqueline M.|Brill': 85, 'Richard|Seda': 75,
'Jaime|Carbonell': 85, 'Bamidele|Olupona': 78, 'Julio C.|Ortiz': 80,
'Robert|Garnet': 80, 'Naila|Esmail': 72, 'Tamara D.|Fishman': 77,
'Jim|François': 75, 'Charlton|Adler': 72, 'Shanika L.|Hill': 93,
'Ashot|Oganesyan': 78, 'Juliette|Perez': 88, 'Katherine|Machado': 83,
'Alexandra M.|Andes': 96, 'Holly|Seigle': 86, 'Carlo A.|Messina': 75,
'Christina Pena|Garcia': 70, 'Neil H.|Strauss': 100, 'Daniel|Pero': 72,
'Tiffany|Cerda': 85, 'Frankie|Kirk': 80, 'Joshua P.|Daly': 85,
'Jean|Louis-Charles': 80, 'Xavier|Sanchez': 81, 'Aldo M.|Gonzalez': 81,
'Eric|Schorr': 75, 'Brett|Fried': 75, 'Stephanie|Garzon': 82,
'Robyn|Hall': 78, 'Jonathan M.|Cutler': 80, 'Vishnu|Seecharan': 78,
'Suzanne|Fuchs': 78
};
let updated = 0;
for (const p of physicians) {
const key = `${p.first_name}|${p.last_name}`;
if (volData[key] !== undefined && p.proj_vol != String(volData[key])) {
const { error } = await db.from('physicians').update({ proj_vol: String(volData[key]) }).eq('id', p.id);
if (!error) updated++;
else console.warn('Volume migration failed for', key, error);
}
}
if (updated > 0) {
await loadAllData();
showToast(`Volume data updated for ${updated} physician(s)`, 'info');
}
localStorage.setItem('volumeMigration20260217', 'done');
console.log(`Volume migration complete: ${updated} updated`);
}

async function runASMigration() {
if (localStorage.getItem('asMigration20260217')) return;
const asPhysicians = new Set([
'Neil H.|Strauss','Alexandra M.|Andes','Amy|DeGirolamo','Alan|MacGill',
'Shanika L.|Hill','Nathan D.|Vela','Michelle|Detweiler','Kyle|Kinmon',
'Juliette|Perez','Ashley|Bowles','Pritesh|Patel','Holly|Seigle',
'Jacqueline M.|Brill','Jaime|Carbonell','Tiffany|Cerda','Joshua P.|Daly',
'Mario Adrian|Cala','Nathalie|Mendez','Katherine|Machado','Jignesh|Desai',
'Stephanie|Garzon','Xavier|Sanchez','Aldo M.|Gonzalez','Julio C.|Ortiz',
'Robert|Garnet','Frankie|Kirk','Jean|Louis-Charles','Jonathan M.|Cutler',
'Bamidele|Olupona','Ashot|Oganesyan','Robyn|Hall','Vishnu|Seecharan',
'Suzanne|Fuchs','Tamara D.|Fishman','James A.|Green','Pollyanna|Reeves',
'Richard|Seda','Jim|François','Carlo A.|Messina','Eric|Schorr',
'Brett|Fried','Kimberly|Bullock','Naila|Esmail','Charlton|Adler',
'Daniel|Pero','Christina Pena|Garcia'
]);
let updated = 0;
for (const p of physicians) {
const key = `${p.first_name}|${p.last_name}`;
if (asPhysicians.has(key) && !p.advanced_solution) {
const { error } = await db.from('physicians').update({ advanced_solution: true }).eq('id', p.id);
if (!error) { p.advanced_solution = true; updated++; }
else console.warn('AS migration failed for', key, error);
}
}
if (updated > 0) {
await loadAllData();
showToast(`Advanced Solution set for ${updated} physician(s)`, 'info');
}
localStorage.setItem('asMigration20260217', 'done');
console.log(`AS migration complete: ${updated} updated`);
}

async function loadContactLogs(physicianId) {
try {
const { data, error } = await db
.from('contact_logs')
.select('*')
.eq('physician_id', physicianId)
.order('contact_date', { ascending: false })
.order('created_at', { ascending: false });
if (error) throw error;
contactLogs[physicianId] = data || [];
} catch (error) {
console.error('Error loading contact logs:', error);
}
}
