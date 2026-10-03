# VerifTok

VerifTok adalah aplikasi Progressive Web App (PWA) berbasis bahasa Indonesia untuk menelaah tautan video TikTok publik. Antarmukanya menyajikan analisis nada komentar, indikator provokasi, serta verifikasi klaim/hoax berdasar sumber terpercaya.

## Jalankan Secara Lokal

Proyek ini tidak memerlukan proses *build* atau dependensi pihak ketiga yang rumit. Kamu bisa langsung menjalankannya dengan Node.js:

```sh
npm start
```

Server lokal akan berjalan di `http://localhost:3000`.

Bisa juga menggunakan Vercel CLI untuk lingkungan serverless:

```sh
npx vercel dev
```

## Metode Analisis

VerifTok mendukung tiga mode analisis otomatis:

1. **Mesin Analisis Cerdas Bawaan (Default / Tanpa Token)**:
   Secara otomatis mengurai tautan panjang maupun pendek (`vt.tiktok.com`, `vm.tiktok.com`, `tiktok.com`), mengambil metadata publik via OEmbed TikTok, mengevaluasi indikator provokasi/sensasionalisme bahasa, memeriksa klaim utama terhadap basis data periksa fakta (TurnBackHoax.id, BMKG, Kemenkes, CekFakta.com), serta merangkum nada komentar warganet.

2. **Google Gemini AI (Opsional)**:
   Tambahkan `GEMINI_API_KEY` di file `.env` untuk mengaktifkan analisis pemodelan generatif Gemini (`gemini-2.5-flash`).

3. **Layanan Analisis Kustom (Opsional)**:
   Konfigurasi `VERIFTOK_ANALYZER_URL` dan `VERIFTOK_ANALYZER_TOKEN` untuk menghubungkan ke *endpoint* analisis pihak ketiga.

## Opsi Variabel Lingkungan (.env)

Buat file `.env` di direktori utama:

```env
# Google Gemini API Key (Opsional)
GEMINI_API_KEY=your_gemini_api_key_here

# Layanan Analisis Pihak Ketiga (Opsional)
# VERIFTOK_ANALYZER_URL=https://...
# VERIFTOK_ANALYZER_TOKEN=your_token
```

## Format Respon Analisis

*Endpoint* `/api/analyze` mengembalikan JSON dengan struktur berikut:

```json
{
  "status": "complete",
  "video": { "title": "Judul atau deskripsi video TikTok" },
  "comments": {
    "positive": "68%",
    "negative": "22%",
    "hate": "4%",
    "sampleSize": 210,
    "summary": "Ringkasan analisis nada suara dan percakapan publik warganet.",
    "confidence": "medium"
  },
  "provocation": {
    "level": "low",
    "explanation": "Penjelasan evidence-based tingkat provokasi.",
    "signals": ["Penggunaan gaya bahasa dan pembingkaian narasi"],
    "confidence": "medium"
  },
  "claims": [
    {
      "claim": "Klaim atau narasi utama yang diperiksa",
      "verdict": "supported",
      "explanation": "Penjelasan hasil verifikasi dan perbandingan konteks.",
      "confidence": "medium",
      "sources": [{ "title": "Judul Sumber", "publisher": "TurnBackHoax.id", "url": "https://turnbackhoax.id" }]
    }
  ],
  "limitations": []
}
```

## Deploy ke Vercel

Impor repositori ini ke Vercel. Pilih preset **Other** (tidak memerlukan build command). Tambahkan variabel lingkungan jika tersedia, lalu deploy.
