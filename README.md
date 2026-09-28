# OfficeCode — Visual Working Agent Orchestrator for OpenCode

Kantor 2D pixel-art yang hidup: setiap karakter adalah **run OpenCode beneran**
(workspace, transkrip, dan budget sendiri), bukan animasi. Layout = workflow:
room adalah tim, hallway adalah jalur handoff, benda adalah izin tool.

## Syarat

- Node.js 18+ (disarankan 22)
- (Opsional) CLI `opencode` di PATH untuk run beneran — tanpa itu tetap bisa
  jalan pakai driver mock

## Cara menjalankan web

```bash
npm install          # sekali saja
npm test             # cek seluruh suite

# Mode mock (tanpa API key, tanpa biaya):
$env:OFFICECODE_DRIVER = "mock"; npm run dev      # Windows PowerShell
OFFICECODE_DRIVER=mock npm run dev               # macOS / Linux

# Mode real (pakai OpenCode asli):
npm run dev
```

Lalu buka **http://127.0.0.1:8787** di browser.

> Port bisa diganti: `set PORT=8799 && ...` (Windows) atau
> `PORT=8799 ...` (macOS/Linux).

## Plugin global OpenCode

Jalankan sekali dari repo OfficeCode:

```powershell
npm install
npm run install:opencode
```

Instalasi menyalin plugin dan `/dashboard` ke `~/.config/opencode/`, serta
menyimpan lokasi repo OfficeCode untuk aset visual. Repo ini perlu tetap ada.
Buka ulang OpenCode di proyek mana pun. Saat OpenCode terhubung, sidecar Node
menyala otomatis, lalu toast menampilkan URL dashboard proyek tersebut. Ketik
`/dashboard` untuk melihat URL dan status lagi. Buka URL di browser; OpenCode
1.18 belum menyediakan panel Canvas kustom di samping context.

Saat OpenCode ditutup, plugin melepas koneksinya dan sidecar ikut berhenti.
Jika proses OpenCode terhenti mendadak, sidecar berhenti sendiri sekitar 7–8
detik setelah heartbeat terakhir. Bila proyek yang sama masih terbuka di jendela
OpenCode lain, sidecar tetap hidup sampai jendela terakhir ditutup.

Setiap proyek mendapat state di `%LOCALAPPDATA%/OfficeCode/projects/` dan port
sendiri ketika port dasar telah dipakai. Dashboard global hanya mencerminkan
sesi, tool, dan izin dari OpenCode. `POST /api/runs` ditolak, sehingga semua
model tetap dipilih dan dijalankan oleh OpenCode. `OFFICECODE_DRIVER=mock` dan
`npm run dev` tidak diperlukan untuk penggunaan plugin global.

Opsional: `OFFICECODE_PORT` menentukan port awal, `OFFICECODE_NODE` menentukan
binary Node, dan `OFFICECODE_NO_SPAWN=1` mematikan auto-start. Bila sidecar
tidak tersedia, OpenCode tetap berjalan.

## Coba pertama kali (2 menit)

Dashboard itu **murni visual** — semua perintah lewat prompt opencode
(`plugin/commands/`):

1. Dispatch dari opencode (lihat `/office.run`):
   `POST http://127.0.0.1:8787/api/runs` dengan
   `{"deskId":"desk-fe-1","role":"frontend-dev","prompt":"..."}`.
2. Lihat karakter jalan ke meja di browser, monitor menyala saat kerja,
   bubble status muncul (Berpikir… / Menjalankan: … / Selesai ✅).
3. Hasil kerja ada di `output/outbox/<run-id>/`
   (`manifest.json` + `result.md`).
4. Jejak lengkap di `.officecode/events.jsonl`,
   transkrip di `.officecode/transcripts/`.

## Fitur (M2)

| Area | Fungsi |
|---|---|
| Dashboard | Denah pixel art responsif, panel aktivitas dan antrean, kartu meja agen, angka read-only (aktif/antre/spend) |
| `/office.run` | Dispatch task ke meja kosong |
| `/office.staff` | Lihat meja bebas + cara staffing |
| `/office.models` | 10 role (pm, uiux, frontend, backend, api, database, devops, qa, reviewer, docs), masing-masing slot provider/model/fallbacks/bobot sendiri |
| `/office.queue` | Batas konkurensi (`OFFICECODE_MAX_CONCURRENT`, default 8); lebihnya antre (202) dan jalan otomatis |
| `/office.budget` | Cap harian USD + tarif per model (bisa diubah); spend selalu **est.** (estimasi, bukan tagihan asli); over cap → 402 |
| `/office.status` | Status sekilas: rooms, occupants, queue, spend |

## API (localhost saja, tanpa secrets)

| Endpoint | Fungsi |
|---|---|
| `GET /api/health` | Cek hidup |
| `GET /api/office` | Layout + siapa di meja mana |
| `POST /api/runs` | Dispatch `{deskId, role, prompt}` → 201 jalan, 202 antre, 404 meja tak dikenal, 409 sibuk, 402 over budget |
| `GET /api/runs`, `GET /api/runs/:id` | Daftar / detail run |
| `GET /api/queue` | Antrean |
| `GET/PUT /api/models` | Slot model per role |
| `GET /api/models/opencode` | Baca `opencode.json` workspace (best-effort) |
| `GET/PUT /api/budgets` | Cap + tarif, spend hari ini (est.) |
| `GET /api/events` | SSE live (snapshot + event `office`) |

## Struktur proyek

```
src/shared/     kontrak event + skema office
src/sidecar/    runtime: office-store, ledgers, drivers, runs, queue,
                models, budgets, server (HTTP+SSE)
src/dashboard/  UI Canvas 2D pixel (sprites, layout, app)
plugin/         10 role agents + slash commands (/office.run, /office.staff)
test/           51 test node:test
docs/           PRD, plan M1/M2, INSTALL, PRIVACY
```

## Troubleshooting

| Gejala | Arti |
|---|---|
| `Desk X is busy` / 409 | Meja masih dipakai run aktif — pilih meja lain atau tunggu |
| `Over budget` / 402 | Cap harian tercapai — naikkan di panel Budget |
| Run `blocked(missing-cli)` | `opencode` tidak ada di PATH — install OpenCode atau pakai mode mock |
| Halaman kosong | Pastikan `npm run build` sukses dan buka port yang benar |

## Batasan saat ini

- `POST /api/runs` menunggu run selesai (streaming progresif = M3).
- Rantai fallback model tersimpan tapi belum auto-switch saat rate-limit (M3).
- Restart sidecar tidak melanjutkan run (M3); panel Outbox UI juga M3.
- Semua angka dolar adalah **estimasi** (`est.`).
