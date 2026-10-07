import http from 'node:http';
import crypto from 'node:crypto';
import { WebSocketServer } from 'ws';
import bcrypt from 'bcryptjs';
import { Store } from './store.js';
import { createApp } from './app.js';

const generatedAdminPassword=crypto.randomBytes(12).toString('base64url');
if(process.env.DATABASE_URL&&!process.env.ADMIN_PASSWORD)throw new Error('ADMIN_PASSWORD es obligatorio al usar PostgreSQL');
const env={port:Number(process.env.PORT||8080),jwtSecret:process.env.JWT_SECRET||crypto.randomBytes(32).toString('hex'),registrationSecret:process.env.REGISTRATION_SECRET||crypto.randomBytes(24).toString('base64url'),adminUser:process.env.ADMIN_USER||'admin',adminPassword:process.env.ADMIN_PASSWORD||generatedAdminPassword};
if(!process.env.DATABASE_URL)console.log(`Modo demo temporal · usuario admin · contraseña ${generatedAdminPassword}`);
const store=new Store(process.env.DATABASE_URL); await store.init(env);
const connections=new Map(); const server=http.createServer(createApp({store,...env,connections}));
const wss=new WebSocketServer({server,path:'/client-hub',maxPayload:300*1024});
wss.on('connection',async(ws,req)=>{try{const url=new URL(req.url,'http://localhost');const computer=await store.computer(url.searchParams.get('computerId'));const token=url.searchParams.get('token');if(!computer||!token||!(await bcrypt.compare(token,computer.registration_token_hash)))return ws.close(1008,'No autorizado');connections.set(computer.id,ws);ws.send(JSON.stringify({kind:'connected',serverTime:new Date().toISOString()}));ws.on('close',()=>connections.delete(computer.id));}catch{ws.close(1011,'Error');}});
const offlineTimer=setInterval(async()=>{for(const c of await store.computers())if(c.status!=='OFFLINE'&&Date.now()-new Date(c.last_seen||0).getTime()>45000)await store.heartbeat(c.id,{status:'OFFLINE'});},15000);offlineTimer.unref();
server.listen(env.port,()=>console.log(`Centro Control listo en http://localhost:${env.port}`));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{clearInterval(offlineTimer);wss.close();server.close();await store.close();process.exit(0);});
