// Tidbit 서버 — Node.js + Express + SQLite (better-sqlite3)
// 라즈베리파이에서: npm install && node server.js
const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const app = express();
const dbPath = process.env.DB_PATH || path.join(__dirname, 'tidbit.db');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });   // DB 폴더 없으면 생성
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');           // 동시 접근 안정성

db.exec(`
CREATE TABLE IF NOT EXISTS items(
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  page         TEXT NOT NULL,              -- garden | tank
  x            REAL,
  y            REAL,
  img          INTEGER,                    -- 그림 번호(1~30)
  text         TEXT,
  author       TEXT,                       -- songi | bung
  source       TEXT,
  hits         INTEGER DEFAULT 0,
  scale        REAL DEFAULT 1,
  seen_songi   INTEGER DEFAULT 0,
  seen_bung    INTEGER DEFAULT 0,
  archived     INTEGER DEFAULT 0,
  date         TEXT,
  archived_date TEXT,
  created_at   INTEGER
);
CREATE TABLE IF NOT EXISTS settings(k TEXT PRIMARY KEY, v TEXT);
`);

app.use(express.json());
app.use(express.static(__dirname));        // index.html + public/ 서빙

function rowToItem(r){
  const seen=[];
  if(r.seen_songi) seen.push('songi');
  if(r.seen_bung)  seen.push('bung');
  return { id:r.id, x:r.x, y:r.y, img:r.img, text:r.text, author:r.author,
           source:r.source, hits:r.hits, scale:r.scale, seen, date:r.date };
}
const onlyPage = p => (p==='tank' ? 'tank' : 'garden');
const onlyUser = u => (u==='bung' ? 'bung' : 'songi');

// 목록 (활성만)
app.get('/api/items', (req,res)=>{
  const page=onlyPage(req.query.page);
  const rows=db.prepare(
    'SELECT * FROM items WHERE page=? AND archived=0 ORDER BY created_at ASC').all(page);
  res.json(rows.map(rowToItem));
});

// 심기
app.post('/api/items', (req,res)=>{
  const b=req.body||{};
  const page=onlyPage(b.page), author=onlyUser(b.author);
  if(!b.text || !b.img) return res.status(400).json({error:'text/img required'});
  const info=db.prepare(`INSERT INTO items
    (page,x,y,img,text,author,source,hits,scale,seen_songi,seen_bung,archived,date,created_at)
    VALUES (@page,@x,@y,@img,@text,@author,@source,0,1,@ss,@sb,0,@date,@ts)`).run({
      page, x:Math.round(b.x||0), y:Math.round(b.y||0), img:b.img,
      text:String(b.text).slice(0,500), author, source:(b.source||'').slice(0,200),
      ss: author==='songi'?1:0, sb: author==='bung'?1:0,
      date:b.date||'', ts:Date.now()
    });
  if(b.source) db.prepare(
    `INSERT INTO settings(k,v) VALUES('lastsource',?)
     ON CONFLICT(k) DO UPDATE SET v=excluded.v`).run(b.source);
  const row=db.prepare('SELECT * FROM items WHERE id=?').get(info.lastInsertRowid);
  res.json(rowToItem(row));
});

// 이동 / 크기 변경
app.patch('/api/items/:id', (req,res)=>{
  const id=+req.params.id, b=req.body||{};
  const cur=db.prepare('SELECT * FROM items WHERE id=?').get(id);
  if(!cur) return res.status(404).json({error:'not found'});
  db.prepare('UPDATE items SET x=?,y=?,scale=? WHERE id=?').run(
    b.x!=null?Math.round(b.x):cur.x,
    b.y!=null?Math.round(b.y):cur.y,
    b.scale!=null?b.scale:cur.scale, id);
  res.json({ok:true});
});

// 조회 기록(상대가 열면 hit +1, 본 사람 seen 처리)
app.post('/api/items/:id/view', (req,res)=>{
  const id=+req.params.id, me=onlyUser((req.body||{}).me);
  const cur=db.prepare('SELECT * FROM items WHERE id=?').get(id);
  if(!cur) return res.status(404).json({error:'not found'});
  const col = me==='songi' ? 'seen_songi' : 'seen_bung';
  if(cur.author!==me) db.prepare(`UPDATE items SET hits=hits+1, ${col}=1 WHERE id=?`).run(id);
  else                db.prepare(`UPDATE items SET ${col}=1 WHERE id=?`).run(id);
  const row=db.prepare('SELECT * FROM items WHERE id=?').get(id);
  res.json(rowToItem(row));
});

// 뽑기(삭제) → 아카이브 보관(archived=1)
app.delete('/api/items/:id', (req,res)=>{
  const id=+req.params.id;
  db.prepare('UPDATE items SET archived=1, archived_date=? WHERE id=?')
    .run(req.query.date||'', id);
  res.json({ok:true});
});

// 최근 출처
app.get('/api/lastsource', (req,res)=>{
  const r=db.prepare("SELECT v FROM settings WHERE k='lastsource'").get();
  res.json({ source: r ? r.v : '' });
});

// (선택) 아카이브 목록 — DB에만 저장, 필요하면 조회
app.get('/api/archive', (req,res)=>{
  const page=onlyPage(req.query.page);
  const rows=db.prepare(
    'SELECT * FROM items WHERE page=? AND archived=1 ORDER BY id DESC').all(page);
  res.json(rows.map(r=>({...rowToItem(r), archived_date:r.archived_date})));
});

const PORT=process.env.PORT||3000;
app.listen(PORT, ()=>console.log(`Tidbit server running on http://0.0.0.0:${PORT}`));
