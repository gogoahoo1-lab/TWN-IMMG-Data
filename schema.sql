-- ============================================================
-- STARLUX Galactic Lounge — Complete Schema
-- Run this in Supabase SQL Editor (once) to set up all tables
-- ============================================================

-- ============================================================
-- 1. CHANNELS (聊天頻道)
-- ============================================================
create table if not exists channels (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  icon text,
  color text,
  terminal text,
  sort_order int default 0,
  created_at timestamptz default now()
);

-- ============================================================
-- 2. MESSAGES (聊天訊息)
-- ============================================================
create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid references channels(id) on delete cascade,
  sender_name text not null,
  sender_role text,
  content text not null,
  created_at timestamptz default now()
);

create index if not exists idx_messages_channel_time on messages(channel_id, created_at);

-- ============================================================
-- 3. SEATS (座位狀態)
-- ============================================================
create table if not exists seats (
  terminal text not null,
  code text not null,
  zone text not null,
  seat_type text default 'chair',   -- chair, sofa, workstation, bar, shower
  status text not null default 'avail',  -- avail, seated, dirty, cleaning, blocked
  passenger_name text,
  flight_no text,
  destination text,
  destination_name text,
  std text,
  party_size int,
  class text,
  vip boolean default false,
  entry_time timestamptz,
  updated_at timestamptz default now(),
  updated_by text,
  primary key (terminal, code)
);

-- ============================================================
-- 4. FLIGHTS (TDX 班表快取)
-- ============================================================
create table if not exists flights (
  flight_no text primary key,
  destination text,
  destination_name text,
  std text,
  terminal text,
  status text,
  updated_at timestamptz default now()
);

-- ============================================================
-- 5. REALTIME PUBLICATIONS
-- ============================================================
alter publication supabase_realtime add table channels;
alter publication supabase_realtime add table messages;
alter publication supabase_realtime add table seats;
alter publication supabase_realtime add table flights;

-- ============================================================
-- 6. ROW LEVEL SECURITY (Prototype — 上線前務必收緊)
-- ============================================================
alter table channels enable row level security;
alter table messages enable row level security;
alter table seats enable row level security;
alter table flights enable row level security;

create policy "allow all channels" on channels for all using (true) with check (true);
create policy "allow all messages" on messages for all using (true) with check (true);
create policy "allow all seats" on seats for all using (true) with check (true);
create policy "allow all flights" on flights for all using (true) with check (true);

-- ============================================================
-- 7. SEED — 聊天頻道
-- ============================================================
insert into channels (slug, name, icon, color, terminal, sort_order) values
  ('t1-counter',  'T1 劃位櫃檯', '櫃', '#B57A24', 'T1', 1),
  ('t2-counter',  'T2 劃位櫃檯', '櫃', '#B57A24', 'T2', 2),
  ('cleaning',    '清潔組',      '清', '#6BA688', null, 3),
  ('catering',    '餐飲組',      '餐', '#4A6FA5', null, 4),
  ('supervisor',  '值班主管',    '主', '#7A5E3E', null, 5)
on conflict (slug) do nothing;

-- ============================================================
-- 8. SEED — T1 座位（42 席：沙發 12 + 用餐 12 + 工作 9 + 吧檯 4 + 淋浴 4 + 額外 1）
-- ============================================================
insert into seats (terminal, code, zone, seat_type) values
  ('T1','A-01','A','sofa'),('T1','A-02','A','sofa'),('T1','A-03','A','sofa'),('T1','A-04','A','sofa'),
  ('T1','A-05','A','sofa'),('T1','A-06','A','sofa'),('T1','A-07','A','sofa'),('T1','A-08','A','sofa'),
  ('T1','A-09','A','sofa'),('T1','A-10','A','sofa'),('T1','A-11','A','sofa'),('T1','A-12','A','sofa'),
  ('T1','B-01','B','chair'),('T1','B-02','B','chair'),('T1','B-03','B','chair'),('T1','B-04','B','chair'),
  ('T1','B-05','B','chair'),('T1','B-06','B','chair'),('T1','B-07','B','chair'),('T1','B-08','B','chair'),
  ('T1','B-09','B','chair'),('T1','B-10','B','chair'),('T1','B-11','B','chair'),('T1','B-12','B','chair'),
  ('T1','C-01','C','workstation'),('T1','C-02','C','workstation'),('T1','C-03','C','workstation'),
  ('T1','C-04','C','workstation'),('T1','C-05','C','workstation'),('T1','C-06','C','workstation'),
  ('T1','C-07','C','workstation'),('T1','C-08','C','workstation'),('T1','C-09','C','workstation'),
  ('T1','D-01','D','bar'),('T1','D-02','D','bar'),('T1','D-03','D','bar'),('T1','D-04','D','bar'),
  ('T1','S-01','D','shower'),('T1','S-02','D','shower'),('T1','S-03','D','shower'),('T1','S-04','D','shower')
on conflict do nothing;

-- ============================================================
-- 9. SEED — T2 座位（複製 T1 配置）
-- ============================================================
insert into seats (terminal, code, zone, seat_type)
  select 'T2', code, zone, seat_type from seats where terminal = 'T1'
on conflict do nothing;

-- ============================================================
-- 10. SEED — 航班（真實 STARLUX 航線；TDX Edge Function 部署後會自動 upsert 覆蓋）
-- ============================================================
insert into flights (flight_no, destination, destination_name, std, terminal) values
  ('JX121','HKG','香港','09:55','T1'),
  ('JX741','KUL','吉隆坡','10:15','T1'),
  ('JX761','SGN','胡志明市','10:40','T1'),
  ('JX781','MNL','馬尼拉','11:05','T1'),
  ('JX801','HND','東京羽田','11:30','T1'),
  ('JX711','BKK','曼谷','11:55','T1'),
  ('JX723','CGK','雅加達','12:20','T1'),
  ('JX731','SIN','新加坡','12:45','T1'),
  ('JX102','ICN','首爾仁川','13:10','T1'),
  ('JX2','LAX','洛杉磯','10:20','T2'),
  ('JX50','SFO','舊金山','10:50','T2'),
  ('JX820','FUK','福岡','11:15','T2'),
  ('JX804','KIX','大阪關西','11:40','T2'),
  ('JX860','NRT','東京成田','12:05','T2')
on conflict (flight_no) do nothing;

-- ============================================================
-- Done. 檢查：select count(*) from seats;  → 應為 84
-- ============================================================
