# Home Sweet Home Survive OBT2 API v2 BY NONGCHE

API ของ **Home Sweet Home Survive OBT2** แบบใหม่ ใช้ **MongoDB** เป็นฐานข้อมูลจริง
และพร้อมDeploy บน **Render** (อ่าน `PORT` จาก environment, มี `render.yaml`, graceful shutdown)

> เปลี่ยนจาก v1 (JSON file storage) มาเป็นโครงสร้างแบบ layered:
> `routes → services → repositories → MongoDB`

---

## 1. โครงสร้างใหม่

```
HSH_Survive_OBT2_API/
├─ server.js                  entry point: connect DB → listen → SIGTERM graceful shutdown
├─ package.json               dependencies: express, mongodb
├─ render.yaml                Render Blueprint
├─ .env.example               ตัวแปรทั้งหมด
├─ scripts/
│  └─ seed.js                 นำเข้าข้อมูล static JSON เข้า MongoDB
├─ src/
│  ├─ app.js                  Express app factory (JSON body, CORS, error middleware)
│  ├─ config/index.js         อ่าน env ทั้งหมด
│  ├─ db/
│  │  ├─ index.js             MongoClient singleton + indexes
│  │  └─ memory.js            in-memory adapter (ใช้เฉพาะทดสอบเครื่องตัวเอง)
│  ├─ repositories/           ชั้นเข้าถึงข้อมูลล้วน ๆ
│  │  ├─ player.repo.js       players (+ atomic currency debit)
│  │  ├─ session.repo.js      sessions
│  │  ├─ catalog.repo.js      products/items/stores/bundles/taglists/pots/templates
│  │  ├─ settings.repo.js     server settings
│  │  └─ log.repo.js          telemetry logs
│  ├─ services/               ตรรกะธุรกิจ
│  │  ├─ auth.service.js
│  │  ├─ player.service.js
│  │  ├─ savedata.service.js
│  │  ├─ store.service.js
│  │  └─ extras.service.js
│  ├─ middlewares/
│  │  ├─ auth.js              requireGame / requireAdmin
│  │  └─ error.js
│  ├─ routes/
│  │  ├─ index.js             mounted both /... and /hshs/...
│  │  ├─ player.routes.js
│  │  ├─ store.routes.js
│  │  ├─ extras.routes.js
│  │  └─ system.routes.js
│  └─ utils/
└─ data/
   ├─ static/                 ข้อมูลของเกม (seed เข้า MongoDB)
   └─ custom/bundles.json     ของขายเอง (seed เข้า MongoDB)
```

### MongoDB collections

| Collection | เนื้อหา |
|---|---|
| `players` | บัญชีผู้เล่น, เงิน, inventory, progression, ban, ประวัติซื้อ |
| `sessions` | session_token (มี TTL index ลบอัตโนมัติ) |
| `products` | รายการสินค้า 2,060 รายการ |
| `items` | item catalogue 2,451 รายการ |
| `stores` | shelf ของร้านค้า 6 ชั้น |
| `bundles` | ของที่ขายเอง (แก้ผ่าน Admin API ได้ ไม่ต้องแตะไฟล์) |
| `taglists`, `pots`, `templates` | ข้อมูลเสริมของเกม |
| `settings` | เวอร์ชัน/สถานะเซิร์ฟเวอร์ |
| `logs` | telemetry จาก logapi |

---

## 2. รันบน Render

1. สร้าง **MongoDB Atlas** cluster (ฟรีก็ได้) แล้วได้ connection string
2. Push โปรเจกต์นี้ขึ้น GitHub
3. ใน Render เลือก **New → Blueprint** แล้วชี้ที่ repo (อ่าน `render.yaml`)
4. ใส่ `MONGODB_URI` ในหน้า Render Dashboard (ตัวอื่นมีค่า default ใน blueprint แล้ว)
5. รอ deploy เสร็จ แล้วเปิด `https://<service>.onrender.com/api/health`

**Environment variables**

| ตัวแปร | ค่า | หมายเหตุ |
|---|---|---|
| `PORT` | Render ตั้งให้เอง | local default 18080 |
| `MONGODB_URI` | `mongodb+srv://...` | **บังคับ** บน Render |
| `MONGO_DB_NAME` | `hshs_obt2` | |
| `ADMIN_KEY` | สุ่มโดย Render | ใช้เรียก `/api/admin/*` |
| `CORS_ORIGIN` | `*` | เปลี่ยนเป็น domain จริงได้ |
| `NODE_ENV` | `production` | |
| `DB_DRIVER` | `mongo` | `memory` = ทดสอบโดยไม่มี MongoDB |

Deploy แบบ manual (ไม่ใช้ blueprint):

- Build Command: `npm install`
- Start Command: `npm start`
- Health Check Path: `/api/health`

### นำเข้าข้อมูล static เข้า MongoDB (ทำครั้งแรก)

```bat
npm run seed
```

หรือบน Render Shell: `node scripts/seed.js`

> ถ้าไม่รัน seed ระบบจะอ่านไฟล์ `data/static/*` แทนได้ (fallback) แต่แนะนำให้ seed
> เพื่อให้แก้ไขรายการสินค้าผ่าน MongoDB ได้และไม่พึ่งพา filesystem ของ Render

---

## 3. รันเครื่องตัวเอง

```bat
npm install
start.bat
```

หรือไม่มี MongoDB ทดสอบอย่างเดียว:

```bat
set DB_DRIVER=memory
npm start
```

> `DB_DRIVER=memory` ข้อมูลจะหายเมื่อปิดเซิร์ฟเวอร์ ใช้ทดสอบเท่านั้น

---

## 4. Endpoint

ทุก endpoint ใช้ได้ทั้งแบบปกติและมี `/hshs` นำหน้า เช่น
`/live/player/authen` = `/hshs/live/player/authen`

### Player — mount `/live/player`

| Method | Path |
|---|---|
| POST | `/authen` |
| POST/GET | `/inventory/getAll` |
| POST | `/inventory/addItem`, `/inventory/removeItem` |
| POST/GET | `/characterslot/get`, `/playerstat/get`, `/curserelic/get`, `/getban` |
| POST | `/characterslot/edit`, `/profile/edit`, `/sticker/edit` |
| POST | `/savedata/get`, `/savedata/save` |
| POST/GET | `/gameplay/checkversion`, `/gameplay/authenstatus`, `/gameplay/endgamestatus` |
| POST | `/gameplay/callback`, `/gameplay/endgameresult`, `/logout` |

### Store — mount `/live`

`/productlisting/list`, `/item/listall`, `/store/list`, `/store/productlisting/list/tag`,
`/store/purchase`, `/store/admin/reload`, `/store/debug/balance`

### อื่น ๆ

`/live/immortal/*`, `/live/lootboxgo/api/*`, `/live/bonus/api/get_bonus_data`,
`/live/mailbox/get`, `/live/gacha/static/api/banner`, `/live/treasure/api/progress/get`,
`/logapi/v1/*`

### ระบบ / Admin — mount `/api`

| Method | Path | หมายเหตุ |
|---|---|---|
| GET | `/health` | มี `driver`, `database`, `players` |
| GET | `/players` | สรุปบัญชี |
| POST | `/admin/grant` | เพิ่มเงิน/ของให้ผู้เล่น |
| PUT | `/admin/bundles` | แก้ของขายเองใน MongoDB |
| POST | `/admin/bundles/reload` | reload จาก `data/custom/bundles.json` |
| PUT | `/admin/settings` | เปลี่ยนเวอร์ชัน/ maintenance |
| GET | `/admin/logs` | ดู telemetry |

ส่ง admin key ผ่าน header `X-Admin-Key: <ADMIN_KEY>`

---

## 5. ของขายเอง

แก้ใน MongoDB โดยตรง หรือเรียก Admin API:

```bat
curl -X PUT http://localhost:18080/api/admin/bundles ^
  -H "X-Admin-Key: hshs-admin" -H "Content-Type: application/json" ^
  -d "{\"bundles\":[{\"enabled\":true,\"shortCode\":\"Bundle_RIN_Starter\",\"title\":\"RIN Starter\",\"items\":[{\"shortCode\":\"Default_Gacha\",\"amount\":5}],\"currency\":\"coin\",\"price\":1000,\"shelf\":\"recommend_store\"}]}"
```

สกุล: `coin` (1), `amethyst` (2), `amulet` (4) — 3/5 ปฏิเสธ (ของจริง)

---

## 6. ผลทดสอบ

ทดสอบด้วย in-memory driver **18/18 ผ่าน**: health สองแบบ, authen, seed เงิน,
ร้านค้า 1,991 สินค้า, ซื้อของจริง + หักเงิน atomic, savedata, inventory,
lootbox, immortal, logapi, taglist, admin bundles/settings

---

## 7. หมายเหตุ

- ไม่แตะโปรเจกต์ HSHO Online เดิม
- ทุก response เป็น `{ status, data, error }` (ยกเว้น static catalogue ที่คืน raw JSON เหมือนของเดิม)
- session เก็บใน MongoDB → login อยู่ได้แม้ Render restart
- เงินถูกหักด้วย `findOneAndUpdate` + `$gte` filter → ป้องกันกดซื้อซ้ำ/ติดลบ
