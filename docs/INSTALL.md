# Instalasi OfficeCode

Panduan instalasi plugin global OpenCode, pemakaian lintas proyek, update, dan uninstall ada di [README](../README.md#instal-sebagai-plugin-global-opencode).

Untuk penggunaan sehari-hari, jalankan `npm ci` dan `npm run install:opencode` sekali dari checkout OfficeCode, lalu buka ulang OpenCode. Server dashboard menyala otomatis ketika plugin dimuat. Perintah `/dashboard` hanya menampilkan URL dan status; `npm run dev` tidak diperlukan.

## Mode pengembangan manual

Jika ingin mengembangkan UI atau API tanpa menjalankan model, gunakan driver mock dari root repo:

```powershell
# Windows PowerShell
$env:OFFICECODE_DRIVER = "mock"
npm run dev
```

```bash
# macOS / Linux
OFFICECODE_DRIVER=mock npm run dev
```

Dashboard manual tersedia di `http://127.0.0.1:8787` secara default dan dihentikan dengan `Ctrl+C`. Mode manual tidak terikat ke siklus hidup OpenCode. Jalankan `npm test` untuk memeriksa build dan suite pengujian.
