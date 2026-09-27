---
description: Show the OfficeCode 2D office dashboard URL and live status
---

Pastikan sidecar OfficeCode jalan, lalu jawab user dengan URL dashboard dan
status sekilas. Cara cek:

1. `curl http://127.0.0.1:8787/api/health` — kalau gagal, sidecar belum jalan.
   Nyalakan dengan `npm run dev` di repo OfficeCode (atau plugin
   `.opencode/plugins/office-dashboard.js` menyalakannya otomatis).
2. Ambil status: `/api/office` (meja terisi), `/api/runs` (state run),
   `/api/queue` (antrean), `/api/budgets` (spend est. vs cap).
3. Balas singkat Bahasa Indonesia: tampilkan `🏢 Office dashboard → http://127.0.0.1:8787`
   plus 1-2 baris status (berapa aktif, antre, spend). Jangan ubah state apa pun.
