import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import pg from 'pg';

const now = () => new Date().toISOString();
const id = () => crypto.randomUUID();

export class Store {
  constructor(databaseUrl) {
    this.pool = databaseUrl ? new pg.Pool({ connectionString: databaseUrl }) : null;
    this.memory = {
      rooms: [
        { id: id(), name: 'CC1', description: 'Centro de Cómputo 1', idle_timeout_minutes: 5, screenshot_interval_seconds: 3, welcome_message: 'Bienvenido al centro de cómputo' },
        { id: id(), name: 'Laboratorio A', description: 'Edificio principal', idle_timeout_minutes: 5, screenshot_interval_seconds: 5, welcome_message: 'Bienvenido' }
      ], computers: [], sessions: [], commands: [], audits: [], admins: []
    };
  }

  async init({ adminUser, adminPassword }) {
    const hash = await bcrypt.hash(adminPassword, 12);
    if (!this.pool) {
      this.memory.admins.push({ username: adminUser, password_hash: hash, role: 'SUPER_ADMIN' });
      this.seedDemo();
      return;
    }
    await this.pool.query(`INSERT INTO admin_users(username,password_hash,role) VALUES($1,$2,'SUPER_ADMIN') ON CONFLICT(username) DO NOTHING`, [adminUser, hash]);
    for (const room of this.memory.rooms) await this.pool.query(`INSERT INTO rooms(name,description) VALUES($1,$2) ON CONFLICT(name) DO NOTHING`, [room.name, room.description]);
  }

  seedDemo() {
    const statuses = ['IN_SESSION', 'LOCKED', 'OFFLINE', 'IDLE', 'IN_SESSION', 'ERROR'];
    for (let i = 1; i <= 12; i++) {
      const room = this.memory.rooms[i > 8 ? 1 : 0];
      this.memory.computers.push({ id: id(), uuid: id(), name: `PC-${String(i).padStart(2,'0')}`, room_id: room.id, room_name: room.name, ip_address: `192.168.${i > 8 ? 2 : 1}.${20+i}`, status: statuses[(i-1)%statuses.length], current_student: statuses[(i-1)%statuses.length] === 'IN_SESSION' ? `2232010${String(i).padStart(2,'0')}` : null, client_version: i % 5 ? '1.0.6' : '1.0.4', last_seen: i % 6 === 3 ? new Date(Date.now()-120000).toISOString() : now(), screenshot_url: null });
    }
  }

  async adminByName(username) {
    if (!this.pool) return this.memory.admins.find(x => x.username === username);
    return (await this.pool.query('SELECT * FROM admin_users WHERE username=$1',[username])).rows[0];
  }
  async rooms() {
    if (!this.pool) return this.memory.rooms;
    return (await this.pool.query('SELECT * FROM rooms ORDER BY name')).rows;
  }
  async computers() {
    if (!this.pool) return this.memory.computers;
    return (await this.pool.query(`SELECT c.*,r.name room_name,(SELECT storage_reference FROM screenshots s WHERE s.computer_id=c.id ORDER BY capture_time DESC LIMIT 1) screenshot_url FROM computers c JOIN rooms r ON r.id=c.room_id ORDER BY r.name,c.name`)).rows;
  }
  async dashboard() {
    const computers = await this.computers();
    const normalized = computers.map(c => Date.now()-new Date(c.last_seen||0).getTime()>45000 ? {...c,status:'OFFLINE'} : c);
    return { total: normalized.length, online: normalized.filter(c=>c.status!=='OFFLINE').length, inSession: normalized.filter(c=>c.status==='IN_SESSION').length, locked: normalized.filter(c=>c.status==='LOCKED').length, offline: normalized.filter(c=>c.status==='OFFLINE').length, activeUsers: normalized.filter(c=>c.current_student).length };
  }
  async register(data, tokenHash) {
    if (!this.pool) {
      let computer = this.memory.computers.find(c=>c.uuid===data.uuid);
      const room = this.memory.rooms.find(r=>r.name===data.room) || { id:id(), name:data.room, description:'' };
      if (!this.memory.rooms.includes(room)) this.memory.rooms.push(room);
      if (!computer) { computer={id:id(),...data,room_id:room.id,room_name:room.name,ip_address:data.ip,status:'LOCKED',client_version:data.version,last_seen:now(),registration_token_hash:tokenHash}; this.memory.computers.push(computer); }
      return computer;
    }
    const room=(await this.pool.query(`INSERT INTO rooms(name) VALUES($1) ON CONFLICT(name) DO UPDATE SET name=EXCLUDED.name RETURNING id,name`,[data.room])).rows[0];
    return (await this.pool.query(`INSERT INTO computers(uuid,name,room_id,ip_address,mac_address,client_version,registration_token_hash,last_seen) VALUES($1,$2,$3,$4,$5,$6,$7,now()) ON CONFLICT(uuid) DO UPDATE SET name=$2,room_id=$3,ip_address=$4,mac_address=$5,client_version=$6,last_seen=now(),updated_at=now() RETURNING *`,[data.uuid,data.name,room.id,data.ip||null,data.mac||null,data.version,tokenHash])).rows[0];
  }
  async computer(idValue) { return (await this.computers()).find(c=>c.id===idValue || c.uuid===idValue); }
  async heartbeat(computerId, data) {
    if (!this.pool) { const c=await this.computer(computerId); if (!c) return null; Object.assign(c,{status:data.status,current_student:data.student||null,ip_address:data.ip||c.ip_address,client_version:data.version||c.client_version,last_seen:now()}); return c; }
    return (await this.pool.query(`UPDATE computers SET status=$2,current_student=$3,ip_address=COALESCE($4,ip_address),client_version=COALESCE($5,client_version),last_seen=now(),updated_at=now() WHERE id=$1 RETURNING *`,[computerId,data.status,data.student||null,data.ip||null,data.version||null])).rows[0];
  }
  async loginSession(computerId, studentNumber, offlineMode=false, eventId=null, loginTime=now()) {
    if (!/^[0-9-]+$/.test(studentNumber) || (studentNumber==='1' && !offlineMode)) throw new Error('Expediente inválido');
    const c=await this.computer(computerId); if(!c) throw new Error('Equipo no registrado');
    if (!this.pool) { const s={id:id(),student_number:studentNumber,computer_id:c.id,computer_name:c.name,room_id:c.room_id,room_name:c.room_name,login_time:loginTime,logout_time:null,duration_seconds:null,session_status:'ACTIVE',offline_mode:offlineMode,client_event_id:eventId}; this.memory.sessions.unshift(s); await this.heartbeat(c.id,{status:'IN_SESSION',student:studentNumber}); return s; }
    await this.pool.query('INSERT INTO students(student_number) VALUES($1) ON CONFLICT DO NOTHING',[studentNumber]);
    const s=(await this.pool.query(`INSERT INTO sessions(student_number,computer_id,room_id,login_time,offline_mode,client_event_id) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(client_event_id) DO UPDATE SET client_event_id=EXCLUDED.client_event_id RETURNING *`,[studentNumber,c.id,c.room_id,loginTime,offlineMode,eventId])).rows[0];
    await this.heartbeat(c.id,{status:'IN_SESSION',student:studentNumber}); return s;
  }
  async logoutSession(sessionId, logoutTime=now()) {
    if (!this.pool) { const s=this.memory.sessions.find(x=>x.id===sessionId); if(!s)return null;s.logout_time=logoutTime;s.duration_seconds=Math.max(0,Math.round((new Date(logoutTime)-new Date(s.login_time))/1000));s.session_status='ENDED';await this.heartbeat(s.computer_id,{status:'LOCKED'});return s; }
    const s=(await this.pool.query(`UPDATE sessions SET logout_time=$2,duration_seconds=GREATEST(0,EXTRACT(EPOCH FROM ($2::timestamptz-login_time))::integer),session_status='ENDED',updated_at=now() WHERE id=$1 RETURNING *`,[sessionId,logoutTime])).rows[0]; if(s) await this.heartbeat(s.computer_id,{status:'LOCKED'}); return s;
  }
  async sessions(search='') {
    if (!this.pool) return this.memory.sessions.filter(s=>!search||JSON.stringify(s).toLowerCase().includes(search.toLowerCase()));
    return (await this.pool.query(`SELECT s.*,c.name computer_name,r.name room_name FROM sessions s JOIN computers c ON c.id=s.computer_id JOIN rooms r ON r.id=s.room_id WHERE $1='' OR s.student_number ILIKE $2 OR c.name ILIKE $2 OR r.name ILIKE $2 ORDER BY login_time DESC LIMIT 500`,[search,`%${search}%`])).rows;
  }
  async createCommand(computerId,type,payload,admin) {
    const allowed=['LOCK','UNLOCK','BLOCK_INPUT','RESTORE_INPUT','CHANGE_BACKGROUND','REQUEST_SCREENSHOT','UPDATE_CLIENT','REFRESH_CONFIG']; if(!allowed.includes(type)) throw new Error('Comando no permitido');
    const command={id:id(),computer_id:computerId,type,payload:payload||{},status:'PENDING',created_by:admin,created_at:now()};
    if (!this.pool) this.memory.commands.push(command); else await this.pool.query(`INSERT INTO commands(id,computer_id,type,payload,created_by) VALUES($1,$2,$3,$4,$5)`,[command.id,computerId,type,command.payload,admin]);
    await this.audit(admin,type,computerId,'QUEUED'); return command;
  }
  async saveScreenshot(computerId,storageReference) { const c=await this.computer(computerId);if(!c)return null;if(!this.pool){c.screenshot_url=storageReference;return{storage_reference:storageReference};}return (await this.pool.query(`INSERT INTO screenshots(computer_id,capture_time,storage_reference) VALUES($1,now(),$2) RETURNING *`,[computerId,storageReference])).rows[0]; }
  async audit(admin,action,computerId,result,details={}) { if(!this.pool){this.memory.audits.unshift({id:this.memory.audits.length+1,admin_username:admin,action,computer_id:computerId,timestamp:now(),result,details});return;} await this.pool.query(`INSERT INTO audit_logs(admin_username,action,computer_id,result,details) VALUES($1,$2,$3,$4,$5)`,[admin,action,computerId||null,result,details]); }
  async audits() { if(!this.pool)return this.memory.audits; return (await this.pool.query('SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT 500')).rows; }
  async close(){ await this.pool?.end(); }
}
