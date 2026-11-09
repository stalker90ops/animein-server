#!/data/data/com.termux/files/usr/bin/bash
# ==============================================================
# Script Otomatis Menjalankan Server AnimeIn di Android TV Box
# ==============================================================

echo "======================================================"
echo "🚀 Memulai AnimeIn Server Lokal di Android TV Box"
echo "======================================================"

# Pastikan Node.js terpasang di Termux
if ! command -v node &> /dev/null; then
    echo "📦 Memasang Node.js ke Termux..."
    pkg update -y
    pkg install -y nodejs
fi

# Pastikan dependencies express & cors terpasang
if [ ! -d "node_modules" ]; then
    echo "📦 Memasang dependencies Express & CORS..."
    npm install --omit=dev
fi

# Tampilkan info IP lokal perangkat
IP_LOCAL=$(ifconfig wlan0 2>/dev/null | grep 'inet ' | awk '{print $2}' | sed 's/addr://')
if [ -z "$IP_LOCAL" ]; then
    IP_LOCAL="127.0.0.1"
fi

echo "------------------------------------------------------"
echo "✅ Server Siap Berjalan!"
echo "📺 Akses di Android TV (Aplikasi APK) : http://127.0.0.1:5000"
echo "📱 Akses di HP / Tablet lain (Browser): http://${IP_LOCAL}:5000"
echo "------------------------------------------------------"
echo "Tekan Ctrl + C untuk menghentikan server."
echo "======================================================"

# Jalankan server
node server.js
