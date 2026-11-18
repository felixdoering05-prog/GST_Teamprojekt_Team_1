const MODULES = [
  'overview', 'buildings', 'structure', 'sensors', 'energy', 'analysis', 'assistant',
  'issues', 'documents', 'settings', 'bim', 'coordination', 'maintenance',
];
const FULL = Object.fromEntries(MODULES.map(name => [name, 'edit']));
const READ_ONLY = Object.fromEntries(MODULES.map(name => [name, name==='maintenance'?'none':name==='coordination'?'edit':'read']));
const DEFAULT_ROLES = [
  { key: 'management', name: 'Management', sort: 0, canManageMembers: true, permissions: FULL },
  { key: 'employee', name: 'Employee', sort: 1, canManageMembers: false, permissions: FULL },
  { key: 'maintenance', name: 'Maintenance', sort: 2, canManageMembers: false, permissions: READ_ONLY },
];
const isOwner = access => access?.is_owner === true;
const can = (access, module, action = 'read') => isOwner(access)
  || (access?.role?.permissions?.[module] === 'edit'
    || (action === 'read' && access?.role?.permissions?.[module] === 'read'));

async function initTeamPermissions(db) {
  await db.query(`CREATE TABLE IF NOT EXISTS app_building_roles (
    id SERIAL PRIMARY KEY,
    building_id INTEGER NOT NULL REFERENCES app_buildings(id) ON DELETE CASCADE,
    role_key TEXT NOT NULL,
    name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 80),
    sort_order INTEGER NOT NULL,
    permissions JSONB NOT NULL,
    can_manage_members BOOLEAN NOT NULL DEFAULT false,
    is_system BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(building_id,role_key),
    UNIQUE(building_id,sort_order)
  )`);
  await db.query('ALTER TABLE app_building_members ADD COLUMN IF NOT EXISTS role_id INTEGER REFERENCES app_building_roles(id) ON DELETE SET NULL');
  await db.query('CREATE INDEX IF NOT EXISTS app_building_roles_order_idx ON app_building_roles(building_id,sort_order,id)');
  await db.query("UPDATE app_building_roles SET permissions=permissions-'schedule' WHERE permissions ? 'schedule'");
}

async function ensureBuildingRoles(db, buildingID) {
  const exists = await db.query(`SELECT EXISTS(SELECT 1 FROM app_buildings WHERE id=$1) AS present,
    (SELECT COUNT(*) FROM app_building_roles WHERE building_id=$1 AND role_key IN ('management','employee','maintenance')) AS system_count,
    EXISTS(SELECT 1 FROM app_building_members WHERE building_id=$1 AND role_id IS NULL) AS unassigned`, [buildingID]);
  if (!exists.rows[0]?.present) return [];
  if (Number(exists.rows[0].system_count)<DEFAULT_ROLES.length) {
   for (const role of DEFAULT_ROLES) {
    await db.query(`INSERT INTO app_building_roles(building_id,role_key,name,sort_order,permissions,can_manage_members,is_system)
      VALUES($1,$2,$3,$4,$5,$6,true) ON CONFLICT(building_id,role_key) DO NOTHING`,
    [buildingID, role.key, role.name, role.sort, JSON.stringify(role.permissions), role.canManageMembers]);
   }
  }
  if (exists.rows[0].unassigned) {
   const employee = (await db.query("SELECT id FROM app_building_roles WHERE building_id=$1 AND role_key='employee'", [buildingID])).rows[0];
   if (employee) await db.query('UPDATE app_building_members SET role_id=$2 WHERE building_id=$1 AND role_id IS NULL', [buildingID, employee.id]);
  }
  await db.query("UPDATE app_building_roles SET permissions=permissions||'{\"maintenance\":\"none\"}'::jsonb WHERE building_id=$1 AND role_key='maintenance' AND NOT (permissions ? 'maintenance')",[buildingID]);
  await db.query("UPDATE app_building_roles SET permissions=permissions||'{\"maintenance\":\"edit\"}'::jsonb WHERE building_id=$1 AND role_key IN ('management','employee') AND NOT (permissions ? 'maintenance')",[buildingID]);
  return (await db.query('SELECT id,role_key,name,sort_order,permissions,can_manage_members,is_system FROM app_building_roles WHERE building_id=$1 ORDER BY sort_order,id', [buildingID])).rows;
}

async function buildingAccess(db, buildingID, userID) {
  const building = (await db.query('SELECT id,user_id FROM app_buildings WHERE id=$1', [buildingID])).rows[0];
  if (!building) return null;
  if (Number(building.user_id) === Number(userID)) return { building_id: Number(building.id), owner_id: Number(building.user_id), is_owner: true, role: null };
  let member = (await db.query(`SELECT m.role_id,r.id,r.role_key,r.name,r.sort_order,r.permissions,r.can_manage_members
    FROM app_building_members m LEFT JOIN app_building_roles r ON r.id=m.role_id
    WHERE m.building_id=$1 AND m.user_id=$2 AND m.status='accepted'`, [buildingID, userID])).rows[0];
  if(member&&!member.role_id){await ensureBuildingRoles(db,buildingID);member=(await db.query(`SELECT m.role_id,r.id,r.role_key,r.name,r.sort_order,r.permissions,r.can_manage_members
    FROM app_building_members m LEFT JOIN app_building_roles r ON r.id=m.role_id
    WHERE m.building_id=$1 AND m.user_id=$2 AND m.status='accepted'`,[buildingID,userID])).rows[0];}
  if (!member) return null;
  return { building_id: Number(building.id), owner_id: Number(building.user_id), is_owner: false, role: member };
}

function moduleForBuildingPath(parts) {
  const area = parts[2] || '';
  // The invitation endpoint validates the signed-in account and a pending invitation itself.
  if (['members','roles','team','team-access','invitation'].includes(area)) return null;
  if (area === 'documents') return 'documents';
  if (area === 'maintenance') return 'maintenance';
  if (area === 'plan-conversion') return 'settings';
  if (area === 'structure') return 'structure';
  if (['telemetry','sensor-devices','devices','sensors'].includes(area)) return 'sensors';
  if (area === 'energy') return 'energy';
  if (area === 'analysis') return 'analysis';
  if (area === 'assistant') return 'assistant';
  if (area === 'issues') return 'issues';
  if (area === 'messages') return 'coordination';
  if (area === 'weather') return 'settings';
  if (!area) return 'buildings';
  return 'settings';
}

async function resolveDocumentBuilding(db, documentID) {
  const row = (await db.query('SELECT building_id FROM app_documents WHERE id=$1', [documentID])).rows[0];
  return row?.building_id ?? null;
}

function scopedAccessMiddleware(db) {
  return async (req, res, next) => {
    try {
      const parts = req.path.split('/').filter(Boolean);
      let buildingID = null, module = null;
      const action = ['GET','HEAD','OPTIONS'].includes(req.method) ? 'read' : 'edit';
      if (parts[0] === 'buildings' && /^\d+$/.test(parts[1] || '')) {
        buildingID = Number(parts[1]);
        if(req.teamScope&&!req.teamScope.buildingIDs.includes(buildingID))return res.status(404).json({error:'Gebäude nicht in diesem Team gefunden.'});
        module = moduleForBuildingPath(parts);
        if (!module) return next();
      } else if (parts[0] === 'documents' && /^\d+$/.test(parts[1] || '')) {
        buildingID = await resolveDocumentBuilding(db, Number(parts[1]));
        const suffix = parts[2] || '';
        module = suffix === 'rooms' && parts[4] === 'name' ? 'structure'
          : suffix === 'georeference' ? 'buildings'
          : ['sensor-overlay','sensor-placement'].includes(suffix) ? 'sensors'
          : ['model-state','model-command','model-index','map-view','placement-check'].includes(suffix) ? 'bim'
            : suffix === 'analysis' ? 'analysis' : 'documents';
      } else if (parts[0] === 'sensor-devices' && parts[1]) {
        buildingID = (await db.query('SELECT building_id FROM app_sensor_devices WHERE id=$1 AND revoked=false', [parts[1]])).rows[0]?.building_id ?? null;
        module = 'sensors';
      } else if (parts[0] === 'twin' || parts[0] === 'twin-functions') {
        return next(); // Entity operations apply their own record-level scope checks.
      } else if (parts[0] === 'issues' && req.query.building_id) {
        if (/^\d+$/.test(String(req.query.building_id))) { buildingID = Number(req.query.building_id); module = 'issues'; }
      } else if (parts[0] === 'issues' && action === 'read' && !req.query.building_id) {
        return next(); // The overview endpoint filters rows to buildings with issue-read access.
      }
      if(req.teamScope&&buildingID!==null&&!req.teamScope.buildingIDs.includes(Number(buildingID)))return res.status(404).json({error:'Gebäude nicht in diesem Team gefunden.'});
      if (buildingID && module) {
        const access = await buildingAccess(db, buildingID, req.account.id);
        if (!access) return res.status(404).json({ error: 'Gebäude nicht gefunden.' });
        if (!can(access, module, action)) return res.status(403).json({ error: 'Dafür hast du in diesem Gebäude keine Berechtigung.' });
        req.buildingAccess = access;
        req.requiredModule = module;
      }
      next();
    } catch (error) { next(error); }
  };
}

module.exports = { MODULES, DEFAULT_ROLES, can, initTeamPermissions, ensureBuildingRoles, buildingAccess, scopedAccessMiddleware };

