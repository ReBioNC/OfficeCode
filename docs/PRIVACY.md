# Privasi dan penyimpanan lokal

OfficeCode hanya mendengarkan `127.0.0.1`. Plugin global memantulkan metadata sesi OpenCode, seperti judul sesi, nama tool, status kerja, dan permintaan izin, ke server dashboard lokal. Data dashboard dan log aktivitas disimpan per proyek di `%LOCALAPPDATA%\OfficeCode\projects\` pada Windows atau `~/.local/share/OfficeCode/projects/` pada macOS/Linux. Judul sesi atau metadata tool dapat memuat informasi sensitif; periksa data tersebut sebelum membagikannya.

Dashboard browser tidak menyimpan API key dan tidak memanggil provider model. Dalam mode plugin global, model tetap dipilih dan dijalankan oleh OpenCode; endpoint dispatch mandiri dinonaktifkan. Proses lokal lain pada komputer yang sama dapat mengakses server HTTP lokal selama dashboard berjalan, sehingga jangan mengekspos port itu ke jaringan publik.

Mode pengembangan manual (`npm run dev`) terpisah. Mode ini menyimpan state di `<workspace>/.officecode/` dan hasil run di `<workspace>/output/outbox/`. Jika driver mock digunakan, tidak ada panggilan model. Tanpa driver mock, API run manual dapat menjalankan OpenCode CLI dan mengikuti konfigurasi provider OpenCode pengguna.
