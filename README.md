# OfficeCode

OfficeCode menampilkan aktivitas sesi [OpenCode](https://opencode.ai/) sebagai kantor pixel art di browser. Plugin global memantulkan sesi, tool, dan permintaan izin dari OpenCode ke dashboard lokal. **Model tetap dipilih dan dijalankan oleh OpenCode**; dashboard tidak menjalankan model sendiri.

## Persyaratan

- OpenCode CLI terpasang dan perintah `opencode` dapat dijalankan dari terminal. Integrasi ini diuji dengan OpenCode 1.18.33.
- Node.js 18 atau lebih baru dan npm. Node.js 22 atau lebih baru disarankan.
- Git untuk mengambil dan memperbarui repo.

Instalasi di bawah telah diuji di Windows. Script memakai path Node.js lintas platform, tetapi macOS dan Linux belum diuji langsung.

## Instal sebagai plugin global OpenCode

Jalankan di PowerShell, Terminal, atau shell lain:

```bash
git clone https://github.com/ReBioNC/OfficeCode.git
cd OfficeCode
npm ci
npm run install:opencode
```

`install:opencode` membangun dashboard, lalu memasang plugin dan command `/dashboard` ke direktori konfigurasi global OpenCode (`~/.config/opencode/`). Jika file tujuan sudah ada, installer menyimpan salinannya dengan akhiran `.bak`. **Jangan pindahkan atau hapus checkout OfficeCode setelah instalasi**: plugin global memakai hasil build dari folder tersebut.

Tutup dan buka ulang OpenCode setelah instalasi. Tidak perlu menjalankan `npm run dev` atau mengatur `OFFICECODE_DRIVER` untuk penggunaan plugin global.

## Pakai di proyek mana pun

Masuk ke folder proyek yang ingin dipantau, lalu buka OpenCode:

```bash
cd /path/ke/proyek
opencode
```

Saat OpenCode memuat proyek, plugin menyalakan server dashboard secara otomatis. Toast OpenCode menampilkan alamat lokalnya. Ketik `/dashboard` di OpenCode untuk melihat URL dan status lagi, lalu buka URL tersebut di browser. Port dapat berbeda antarproyek; gunakan URL dari toast atau `/dashboard`, bukan asumsi port `8787`.

`/dashboard` hanya menampilkan informasi. Dashboard global bersifat visual: endpoint `POST /api/runs` ditolak dalam mode plugin, sehingga tugas dan model dijalankan melalui OpenCode.

Saat OpenCode ditutup, dashboard ikut berhenti. Jika OpenCode berhenti mendadak, lease kedaluwarsa dan dashboard biasanya berhenti sekitar 7–8 detik setelah heartbeat terakhir. Bila proyek yang sama masih terbuka di jendela OpenCode lain, dashboard tetap berjalan sampai jendela terakhir ditutup.

## Lokasi file

| Sistem | Plugin dan command global | Data dashboard per proyek |
|---|---|---|
| Windows | `%USERPROFILE%\.config\opencode\plugins\office-dashboard.js` dan `commands\dashboard.md` | `%LOCALAPPDATA%\OfficeCode\projects\` |
| macOS / Linux | `~/.config/opencode/plugins/office-dashboard.js` dan `commands/dashboard.md` | `~/.local/share/OfficeCode/projects/` |

Jika `XDG_CONFIG_HOME` diatur, installer memakai `$XDG_CONFIG_HOME/opencode/`. Data dashboard dapat berisi judul sesi, nama tool, dan riwayat aktivitas OpenCode. Server hanya mendengarkan `127.0.0.1`; dashboard tidak menyimpan API key atau menghubungi provider model. Detailnya ada di [docs/PRIVACY.md](docs/PRIVACY.md).

## Memperbarui

Untuk mengambil perubahan OfficeCode dan memasang ulang plugin global:

```bash
cd /path/ke/OfficeCode
git pull
npm ci
npm run install:opencode
```

Memperbarui aplikasi OpenCode tidak memerlukan instal ulang OfficeCode. Jika versi OpenCode mendatang mengubah API plugin, integrasi ini mungkin perlu diperbarui. Setelah update, buka OpenCode dan cek `/dashboard`.

## Menonaktifkan atau menghapus

Tutup OpenCode terlebih dahulu. Untuk menonaktifkan plugin global sementara, ganti nama `office-dashboard.js` di direktori plugin global menjadi `office-dashboard.js.disabled`, lalu buka ulang OpenCode. Untuk menghapus sepenuhnya, hapus file plugin, `office-dashboard.json` di direktori yang sama, dan `commands/dashboard.md`. Jika installer membuat file `.bak` dari instalasi sebelumnya, pulihkan file itu bila masih diperlukan.

Repo ini juga memiliki plugin tingkat proyek di `.opencode/plugins/office-dashboard.js`. Saat membuka repo OfficeCode sendiri, nonaktifkan file tingkat proyek itu juga jika ingin menjalankan OpenCode tanpa dashboard.

## Pengembangan lokal

Mode ini terpisah dari plugin global. Untuk menjalankan server secara manual tanpa memanggil model:

```powershell
# Windows PowerShell
$env:OFFICECODE_DRIVER = "mock"
npm run dev
```

```bash
# macOS / Linux
OFFICECODE_DRIVER=mock npm run dev
```

Buka `http://127.0.0.1:8787` dan tekan `Ctrl+C` untuk menghentikan server manual. Server yang dijalankan dengan `npm run dev` **tidak** mengikuti siklus hidup OpenCode. Jalankan `npm test` untuk membangun proyek dan menjalankan suite pengujian.

## Pemecahan masalah

| Gejala | Langkah |
|---|---|
| `/dashboard` tidak dikenal | Jalankan `npm run install:opencode`, lalu buka ulang OpenCode. |
| Toast tidak menampilkan URL | Pastikan Node.js ada di `PATH`, checkout OfficeCode belum dipindahkan, dan `npm run build` berhasil. |
| URL lama tidak bisa dibuka | Buka OpenCode dari folder proyek yang sama; dashboard akan menyala saat plugin dimuat. |
| Port berbeda dari `8787` | Normal. Plugin memilih port lain jika perlu; lihat URL dari toast atau `/dashboard`. |
| Server tetap hidup setelah OpenCode ditutup | Cek `GET /api/health`. Sidecar lama yang dibuat sebelum fitur lease (`leaseManaged` tidak ada) perlu dihentikan sekali secara manual. |

## Struktur singkat

| Folder | Isi |
|---|---|
| `src/sidecar/` | Server HTTP lokal, state kantor, dan API mirror |
| `src/dashboard/` | UI Canvas pixel art |
| `.opencode/plugins/` | Sumber plugin OpenCode |
| `.opencode/commands/` | Command `/dashboard` tingkat proyek |
| `scripts/` | Build, installer global, dan helper URL |
| `test/` | Pengujian Node.js |
