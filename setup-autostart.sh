#!/data/data/com.termux/files/usr/bin/bash
# ==============================================================
# Script Konfigurasi Auto-Start Server AnimeIn di Android TV Box
# Menggunakan Termux:Boot agar server otomatis menyala saat TV on
# ==============================================================

echo "======================================================"
echo "⚡ Mengonfigurasi Auto-Start AnimeIn di Android TV Box"
echo "======================================================"

# 1. Pastikan Node.js terpasang
if ! command -v node &> /dev/null; then
    echo "📦 Menginstal Node.js..."
    pkg update -y
    pkg install -y nodejs-lts
fi

# 2. Dapatkan direktori saat ini
APP_DIR="$(pwd)"

# 3. Buat folder ~/.termux/boot untuk Termux:Boot
mkdir -p ~/.termux/boot

# 4. Tulis skrip startup
cat << EOF > ~/.termux/boot/start-animein.sh
#!/data/data/com.termux/files/usr/bin/bash
# Mencegah CPU Android tidur saat memutar di background
termux-wake-lock

cd "${APP_DIR}"
node server.js > ~/animein-server.log 2>&1 &
EOF

chmod +x ~/.termux/boot/start-animein.sh

# 5. Jalankan sekarang juga di latar belakang
termux-wake-lock
nohup node server.js > ~/animein-server.log 2>&1 &

echo "------------------------------------------------------"
echo "✅ SUKSES! Auto-Start Berhasil Dikonfigurasi!"
echo "📺 Server AnimeIn otomatis aktif setiap TV Box dinyalakan."
echo "🌐 Status Server Saat Ini: http://127.0.0.1:5000"
echo "📝 Log Server tersimpan di: ~/animein-server.log"
echo "======================================================"
