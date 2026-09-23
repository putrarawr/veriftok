const TIKTOK_HOSTS = new Set(['tiktok.com', 'www.tiktok.com', 'm.tiktok.com', 'vm.tiktok.com', 'vt.tiktok.com']);

function json(res, status, payload) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.status(status).send(JSON.stringify(payload));
}

function isTikTokUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && TIKTOK_HOSTS.has(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

function validReport(report) {
  if (!report || !['complete', 'partial'].includes(report.status)) return false;
  if (report.claims != null && (!Array.isArray(report.claims) || report.claims.some((claim) => {
    if (!claim || typeof claim !== 'object' || typeof claim.claim !== 'string') return true;
    return claim.sources != null && (!Array.isArray(claim.sources) || claim.sources.some((source) => !source || typeof source !== 'object' || typeof source.url !== 'string'));
  }))) return false;
  if (report.limitations != null && (!Array.isArray(report.limitations) || report.limitations.some((item) => typeof item !== 'string'))) return false;
  if (report.comments != null && typeof report.comments !== 'object') return false;
  if (report.provocation != null && typeof report.provocation !== 'object') return false;
  return true;
}

module.exports = async function analyze(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return json(res, 405, { code: 'METHOD_NOT_ALLOWED', message: 'Gunakan metode POST.' });
  }

  const url = typeof req.body?.url === 'string' ? req.body.url.trim() : '';
  if (!isTikTokUrl(url)) {
    return json(res, 422, { code: 'INVALID_TIKTOK_URL', message: 'Masukkan tautan HTTPS dari tiktok.com, vm.tiktok.com, atau vt.tiktok.com.' });
  }

  const analyzerUrl = process.env.VERIFTOK_ANALYZER_URL;
  const analyzerToken = process.env.VERIFTOK_ANALYZER_TOKEN;
  if (!analyzerUrl || !analyzerToken) {
    return json(res, 503, {
      code: 'PROVIDER_UNCONFIGURED',
      message: 'Konektor analisis belum dikonfigurasi. Setelah layanan analisis dihubungkan di Vercel, coba lagi. VerifTok tidak menyimpan riwayat tautan.',
    });
  }

  let endpoint;
  try {
    endpoint = new URL(analyzerUrl);
    if (endpoint.protocol !== 'https:') throw new Error('HTTPS is required');
  } catch {
    return json(res, 500, { code: 'PROVIDER_CONFIGURATION_ERROR', message: 'URL layanan analisis harus berupa alamat HTTPS yang valid.' });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);
  try {
    const upstream = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${analyzerToken}`,
      },
      body: JSON.stringify({ url }),
      signal: controller.signal,
      cache: 'no-store',
    });
    if (!upstream.ok) {
      return json(res, 502, { code: 'PROVIDER_ERROR', message: 'Layanan analisis belum dapat memeriksa video ini. Coba lagi nanti.' });
    }
    const report = await upstream.json();
    if (!validReport(report)) {
      return json(res, 502, { code: 'PROVIDER_INVALID_RESPONSE', message: 'Layanan analisis mengirim hasil dengan format yang tidak dikenali.' });
    }
    return json(res, 200, report);
  } catch (error) {
    if (error?.name === 'AbortError') {
      return json(res, 504, { code: 'PROVIDER_TIMEOUT', message: 'Layanan analisis terlalu lama merespons. VerifTok tidak menyimpan riwayat tautan; coba lagi sebentar.' });
    }
    return json(res, 502, { code: 'PROVIDER_ERROR', message: 'Layanan analisis tidak dapat dijangkau. Coba lagi nanti.' });
  } finally {
    clearTimeout(timeout);
  }
};
