import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..','..');
const computerSchema=z.object({uuid:z.string().uuid(),name:z.string().min(1).max(80),room:z.string().min(1).max(80),ip:z.string().optional(),mac:z.string().optional(),version:z.string().min(1)});
const heartbeatSchema=z.object({status:z.enum(['OFFLINE','LOCKED','IN_SESSION','IDLE','ERROR','UPDATING','UPDATE_FAILED']),student:z.string().regex(/^[0-9-]+$/).nullable().optional(),ip:z.string().optional(),version:z.string().optional()});

export function createApp({store,jwtSecret,registrationSecret,connections=new Map()}) {
  const app=express(); app.disable('x-powered-by');
  app.use(helmet({contentSecurityPolicy:{directives:{defaultSrc:["'self'"],imgSrc:["'self'",'data:','blob:'],styleSrc:["'self'","'unsafe-inline'"],scriptSrc:["'self'"]}}}));
  app.use(express.json({limit:'300kb'})); app.use('/uploads',express.static(path.join(root,'server','uploads')));
  const admin=(roles=['SUPER_ADMIN','ADMIN','VIEWER'])=>(req,res,next)=>{try{const t=(req.headers.authorization||'').replace(/^Bearer /,'');req.admin=jwt.verify(t,jwtSecret);if(!roles.includes(req.admin.role))return res.status(403).json({error:'Permisos insuficientes'});next();}catch{return res.status(401).json({error:'Autenticación requerida'});}};
  const client=async(req,res,next)=>{const c=await store.computer(req.params.id);if(!c)return res.status(404).json({error:'Equipo no registrado'});const token=req.headers['x-client-token'];if(!token||!(await bcrypt.compare(token,c.registration_token_hash)))return res.status(401).json({error:'Cliente no autorizado'});req.computer=c;next();};

  app.get('/api/health',(_,res)=>res.json({ok:true,time:new Date().toISOString()}));
  app.post('/api/auth/login',async(req,res)=>{const user=await store.adminByName(String(req.body.username||''));if(!user||!(await bcrypt.compare(String(req.body.password||''),user.password_hash)))return res.status(401).json({error:'Credenciales inválidas'});await store.audit(user.username,'LOGIN_ADMIN',null,'SUCCESS');res.json({token:jwt.sign({sub:user.username,username:user.username,role:user.role},jwtSecret,{expiresIn:'8h'}),role:user.role,username:user.username});});
  app.post('/api/clients/register',async(req,res)=>{if(req.headers['x-registration-secret']!==registrationSecret)return res.status(401).json({error:'Secreto de registro inválido'});const parsed=computerSchema.safeParse(req.body);if(!parsed.success)return res.status(400).json({error:'Datos inválidos',details:parsed.error.issues});const token=crypto.randomBytes(32).toString('base64url');const c=await store.register(parsed.data,await bcrypt.hash(token,10));res.status(201).json({computerId:c.id,clientToken:token,settings:{heartbeatSeconds:10,idleMinutes:5,screenshotSeconds:3}});});
  app.post('/api/clients/:id/heartbeat',client,async(req,res)=>{const parsed=heartbeatSchema.safeParse(req.body);if(!parsed.success)return res.status(400).json({error:'Heartbeat inválido'});const c=await store.heartbeat(req.computer.id,parsed.data);res.json({ok:true,serverTime:new Date().toISOString(),settings:{heartbeatSeconds:10}});});
  app.post('/api/clients/:id/sessions',client,async(req,res)=>{try{const student=String(req.body.studentNumber||'');const s=await store.loginSession(req.computer.id,student,Boolean(req.body.offlineMode),req.body.eventId||null,req.body.loginTime);res.status(201).json(s);}catch(e){res.status(400).json({error:e.message});}});
  app.post('/api/clients/:id/sessions/:sessionId/logout',client,async(req,res)=>{const s=await store.logoutSession(req.params.sessionId,req.body.logoutTime);if(!s)return res.status(404).json({error:'Sesión no encontrada'});res.json(s);});
  app.post('/api/clients/:id/sync',client,async(req,res)=>{const accepted=[];for(const event of req.body.events||[]){try{if(event.type==='LOGIN')accepted.push((await store.loginSession(req.computer.id,event.studentNumber,true,event.id,event.timestamp)).id);else if(event.type==='LOGOUT'&&event.sessionId){await store.logoutSession(event.sessionId,event.timestamp);accepted.push(event.id);}}catch{}}res.json({accepted});});
  app.post('/api/clients/:id/command-result',client,async(req,res)=>{await store.audit(req.computer.name,`CLIENT_${req.body.type}`,req.computer.id,req.body.result||'UNKNOWN');res.json({ok:true});});
  app.post('/api/clients/:id/screenshot',client,async(req,res)=>{try{const bytes=Buffer.from(String(req.body.jpegBase64||''),'base64');if(bytes.length<4||bytes.length>180000||bytes[0]!==0xff||bytes[1]!==0xd8)return res.status(400).json({error:'Miniatura JPEG inválida o demasiado grande'});const name=`screen-${req.computer.id}.jpg`;await fs.writeFile(path.join(root,'server','uploads',name),bytes);await store.saveScreenshot(req.computer.id,`/uploads/${name}?t=${Date.now()}`);res.status(201).json({ok:true});}catch{return res.status(400).json({error:'No se pudo procesar la miniatura'});}});

  app.get('/api/dashboard',admin(),async(_,res)=>res.json(await store.dashboard()));
  app.get('/api/rooms',admin(),async(_,res)=>res.json(await store.rooms()));
  app.get('/api/computers',admin(),async(_,res)=>res.json(await store.computers()));
  app.get('/api/sessions',admin(),async(req,res)=>res.json(await store.sessions(String(req.query.search||''))));
  app.get('/api/audit',admin(),async(_,res)=>res.json(await store.audits()));
  app.post('/api/commands',admin(['SUPER_ADMIN','ADMIN']),async(req,res)=>{const ids=Array.isArray(req.body.computerIds)?req.body.computerIds:[];if(ids.length>200)return res.status(400).json({error:'Máximo 200 equipos'});try{const commands=[];for(const computerId of ids){const cmd=await store.createCommand(computerId,req.body.type,req.body.payload,req.admin.username);commands.push(cmd);const ws=connections.get(computerId);if(ws?.readyState===1){ws.send(JSON.stringify({kind:'command',command:cmd}));}}res.status(202).json(commands);}catch(e){res.status(400).json({error:e.message});}});
  app.get('/api/me',admin(),(req,res)=>res.json(req.admin));
  app.use(express.static(path.join(root,'admin')));
  app.get('*splat',(_,res)=>res.sendFile(path.join(root,'admin','index.html')));
  app.use((err,_req,res,_next)=>{console.error(err);res.status(500).json({error:'Error interno'});});
  return app;
}
