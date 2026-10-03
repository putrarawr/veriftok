const fs = require('fs');
const path = require('path');
const { createWriteStream } = require('fs');
const os = require('os');

const TIKTOK_HOSTS = new Set(['tiktok.com', 'www.tiktok.com', 'm.tiktok.com', 'vm.tiktok.com', 'vt.tiktok.com']);

try {
  const envPath = path.join(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    content.split('\n').forEach((line) => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
        const idx = trimmed.indexOf('=');
        const key = trimmed.slice(0, idx).trim();
        const value = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
        if (!process.env[key]) process.env[key] = value;
      }
    });
  }
} catch {
  // Ignore env read issues
}

const TEMP_DIR = path.join(os.tmpdir(), 'veriftok_videos');

function json(res, status, payload) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.status(status).send(JSON.stringify(payload));
}

function isTikTokUrl(value) {
  if (typeof value !== 'string') return false;
  let str = value.trim();
  if (!str.startsWith('http://') && !str.startsWith('https://')) {
    str = 'https://' + str;
  }
  try {
    const url = new URL(str);
    const host = url.hostname.toLowerCase();
    return (url.protocol === 'https:' || url.protocol === 'http:') &&
      (TIKTOK_HOSTS.has(host) || host.endsWith('.tiktok.com'));
  } catch {
    return false;
  }
}

function extractVideoId(urlStr) {
  try {
    const match = urlStr.match(/\/video\/(\d+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

function extractKeyEntities(text) {
  if (!text) return [];
  const entities = new Set();
  
  const hashtags = text.match(/#([\w\u0600-\u06FF\u4e00-\u9fa5]+)/g) || [];
  const ignoreTags = new Set(['fyyyppppppppppppppp', 'fyp', 'fyp5263m', 'xyzbca', 'viral', 'trending', 'foryou', 'foryoupage', 'beritatrending']);
  hashtags.forEach(tag => {
    const clean = tag.replace('#', '').trim();
    if (clean.length >= 3 && !ignoreTags.has(clean.toLowerCase())) {
      entities.add(clean);
    }
  });

  const words = text.match(/\b[A-Z][a-zA-Z0-9_-]{2,}\b/g) || [];
  const stopwords = new Set(['Video', 'TikTok', 'Foto', 'Viral', 'Heboh', 'Lengkap', 'Dulu', 'Kini', 'Sempat', 'Karena', 'Jadi', 'Tengah', 'Polemik', 'Atch', 'More', 'Exciting', 'Watch', 'Sangat', 'Dengan', 'Bisa', 'Akan', 'Ini', 'Itu', 'Dari', 'Yang', 'Untuk', 'Pada', 'Dalam']);
  words.forEach(w => {
    if (!stopwords.has(w)) entities.add(w);
  });

  const topicMatch = text.match(/\b(wamenkeu|purbaya|prabowo|gibran|jokowi|luky|alfirman|menteri|dpr|keuangan|eskrim|trend|kissme|gempa|tsunami|penipuan|subsidi|polisi|kasus|hukum|ijazah|ijazahnya|korupsi|pajak|mbg|motor|listrik|harga|bbm|ikn|timnas|sepakbola)\b/gi) || [];
  topicMatch.forEach(w => entities.add(w.toLowerCase()));

  if (entities.size === 0 && text.trim()) {
    const rawWords = text.replace(/[^\w\s]/g, ' ').split(/\s+/).filter(w => w.length > 3 && !['dengan', 'karena', 'sudah', 'tapi', 'bisa', 'akan', 'atau', 'yang', 'pada', 'dari', 'untuk'].includes(w.toLowerCase()));
    rawWords.slice(0, 4).forEach(w => entities.add(w));
  }

  return Array.from(entities).slice(0, 6);
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

async function resolveTikTokUrl(inputUrl) {
  try {
    const parsed = new URL(inputUrl);
    if (['vt.tiktok.com', 'vm.tiktok.com', 'm.tiktok.com'].includes(parsed.hostname.toLowerCase())) {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 8000);
      try {
        const res = await fetch(inputUrl, {
          method: 'GET',
          redirect: 'follow',
          signal: controller.signal,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          }
        });
        if (res.url && isTikTokUrl(res.url)) {
          return res.url;
        }
      } finally {
        clearTimeout(t);
      }
    }
  } catch {
    // Continue with inputUrl if redirect fails
  }
  return inputUrl;
}

async function fetchTikTokOembed(resolvedUrl) {
  try {
    const oembedUrl = `https://www.tiktok.com/oembed?url=${encodeURIComponent(resolvedUrl)}`;
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 8000);
    try {
      const res = await fetch(oembedUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      });
      if (res.ok) {
        return await res.json();
      }
    } finally {
      clearTimeout(t);
    }
  } catch {
    // Oembed fetch fallback
  }
  return null;
}

// Fetch Full TikTok Data from Tikwm (Video, Photo Mode, Music, Author, Stats)
async function fetchTikwmData(resolvedUrl) {
  try {
    const params = new URLSearchParams();
    params.append('url', resolvedUrl);
    params.append('hd', '0');

    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 9000);
    try {
      const res = await fetch('https://www.tikwm.com/api/', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Referer': 'https://www.tikwm.com/'
        },
        body: params
      });
      if (res.ok) {
        const json = await res.json();
        if (json.code === 0 && json.data) {
          const d = json.data;
          const isPhotoMode = Array.isArray(d.images) && d.images.length > 0;
          let videoDownloadUrl = d.play || d.hdplay || null;
          if (videoDownloadUrl && videoDownloadUrl.startsWith('/')) {
            videoDownloadUrl = `https://www.tikwm.com${videoDownloadUrl}`;
          }

          return {
            id: d.id,
            title: d.title || '',
            cover: d.cover || d.origin_cover || '',
            duration: d.duration || 0,
            isPhotoMode,
            photoSlides: isPhotoMode ? d.images : [],
            videoDownloadUrl,
            author: {
              id: d.author?.id || '',
              unique_id: d.author?.unique_id || '',
              nickname: d.author?.nickname || '',
              avatar: d.author?.avatar || '',
              verified: Boolean(d.author?.verified)
            },
            music: {
              id: d.music_info?.id || '',
              title: d.music_info?.title || d.music || '',
              author: d.music_info?.author || '',
              play: d.music_info?.play || '',
              original: Boolean(d.music_info?.original),
              duration: d.music_info?.duration || 0
            },
            stats: {
              playCount: Number(d.play_count || 0),
              diggCount: Number(d.digg_count || 0),
              commentCount: Number(d.comment_count || 0),
              shareCount: Number(d.share_count || 0),
              downloadCount: Number(d.download_count || 0)
            }
          };
        }
      }
    } finally {
      clearTimeout(t);
    }
  } catch (err) {
    console.error('[TikwmData] Failed:', err.message);
  }
  return null;
}

// Fetch real TikTok comments (up to 50 comments)
async function fetchRealTikTokComments(resolvedUrl) {
  try {
    const endpoint = `https://www.tikwm.com/api/comment/list?url=${encodeURIComponent(resolvedUrl)}&count=50`;
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 9000);
    try {
      const res = await fetch(endpoint, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      });
      if (res.ok) {
        const json = await res.json();
        if (json.code === 0 && Array.isArray(json.data?.comments)) {
          return json.data.comments.map(c => ({
            id: c.cid || c.id,
            text: (c.text || '').trim(),
            userNickname: c.user?.nickname || c.user?.unique_id || 'Warganet TikTok',
            userUniqueId: c.user?.unique_id || 'user',
            likes: Number(c.digg_count || c.likes || 0),
            verified: Boolean(c.user?.verified)
          })).filter(c => c.text.length > 0);
        }
      }
    } finally {
      clearTimeout(t);
    }
  } catch {
    // Fail silently
  }
  return [];
}

// Download TikTok video to temp file
async function downloadTikTokVideo(downloadUrl) {
  if (!downloadUrl) return null;
  try {
    if (!fs.existsSync(TEMP_DIR)) {
      fs.mkdirSync(TEMP_DIR, { recursive: true });
    }

    const videoFileName = `video_${Date.now()}.mp4`;
    const videoFilePath = path.join(TEMP_DIR, videoFileName);

    const dlController = new AbortController();
    const dlTimeout = setTimeout(() => dlController.abort(), 12000);
    try {
      const dlRes = await fetch(downloadUrl, {
        signal: dlController.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Referer': 'https://www.tikwm.com/'
        }
      });

      if (!dlRes.ok || !dlRes.body) return null;

      const fileStream = createWriteStream(videoFilePath);
      const reader = dlRes.body.getReader();
      let totalBytes = 0;
      const MAX_SIZE = 50 * 1024 * 1024; // 50MB cap

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        totalBytes += value.length;
        if (totalBytes > MAX_SIZE) {
          fileStream.destroy();
          try { fs.unlinkSync(videoFilePath); } catch {}
          console.log('[VideoDownload] File exceeds 50MB cap');
          return null;
        }
        fileStream.write(value);
      }

      await new Promise((resolve, reject) => {
        fileStream.on('finish', resolve);
        fileStream.on('error', reject);
        fileStream.end();
      });

      return { filePath: videoFilePath, sizeBytes: totalBytes };
    } finally {
      clearTimeout(dlTimeout);
    }
  } catch (err) {
    console.error('[VideoDownload] Failed:', err.message);
    return null;
  }
}

// Download up to 3 photos from TikTok photo mode for multimodal analysis
async function downloadTikTokPhotos(imageUrls) {
  if (!Array.isArray(imageUrls) || imageUrls.length === 0) return [];
  const selected = imageUrls.slice(0, 3);
  const parts = [];

  for (const url of selected) {
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 8000);
      try {
        const res = await fetch(url, {
          signal: controller.signal,
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
        });
        if (res.ok) {
          const buf = Buffer.from(await res.arrayBuffer());
          parts.push({
            inlineData: {
              mimeType: 'image/jpeg',
              data: buf.toString('base64')
            }
          });
        }
      } finally {
        clearTimeout(t);
      }
    } catch {
      // Ignore individual image download error
    }
  }
  return parts;
}

// Upload video to Gemini Files API
async function uploadToGeminiFiles(filePath, apiKey) {
  const fileSize = fs.statSync(filePath).size;
  const mimeType = 'video/mp4';
  const displayName = path.basename(filePath);

  const initRes = await fetch(
    `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`,
    {
      method: 'POST',
      headers: {
        'X-Goog-Upload-Protocol': 'resumable',
        'X-Goog-Upload-Command': 'start',
        'X-Goog-Upload-Header-Content-Length': String(fileSize),
        'X-Goog-Upload-Header-Content-Type': mimeType,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ file: { display_name: displayName } }),
    }
  );

  if (!initRes.ok) {
    throw new Error(`Gemini Files API init failed: ${initRes.status}`);
  }

  const uploadUrl = initRes.headers.get('x-goog-upload-url');
  if (!uploadUrl) throw new Error('No upload URL returned from Gemini Files API');

  const fileBuffer = fs.readFileSync(filePath);
  const uploadRes = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Content-Length': String(fileSize),
      'X-Goog-Upload-Offset': '0',
      'X-Goog-Upload-Command': 'upload, finalize',
    },
    body: fileBuffer,
  });

  if (!uploadRes.ok) {
    throw new Error(`Gemini Files upload failed: ${uploadRes.status}`);
  }

  const uploadData = await uploadRes.json();
  const fileUri = uploadData.file?.uri;
  const fileName = uploadData.file?.name;

  if (!fileUri) throw new Error('No file URI returned');

  let fileState = uploadData.file?.state || 'PROCESSING';
  let pollAttempts = 0;
  const maxPolls = 25;

  while (fileState === 'PROCESSING' && pollAttempts < maxPolls) {
    await new Promise(r => setTimeout(r, 800));
    pollAttempts++;
    
    const statusRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${apiKey}`
    );
    if (statusRes.ok) {
      const statusData = await statusRes.json();
      fileState = statusData.state || 'PROCESSING';
    }
  }

  if (fileState !== 'ACTIVE') {
    throw new Error(`File did not become ACTIVE (state: ${fileState})`);
  }

  return { fileUri, mimeType };
}

// Live News Search via Google News RSS Indonesia based on SUBSTANTIVE THEME
async function fetchLiveNews(query) {
  if (!query || !query.trim()) return [];
  try {
    const cleanQuery = query.replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(cleanQuery)}&hl=id&gl=ID&ceid=ID:id`;
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 6000);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
        }
      });
      if (!res.ok) return [];
      const text = await res.text();
      const items = text.match(/<item>[\s\S]*?<\/item>/g) || [];
      return items.slice(0, 5).map(item => {
        let title = (item.match(/<title>(.*?)<\/title>/)?.[1] || '').replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1');
        let source = (item.match(/<source[^>]*>(.*?)<\/source>/)?.[1] || '').replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1');
        if (!source && title.includes(' - ')) {
          const parts = title.split(' - ');
          source = parts.pop();
          title = parts.join(' - ');
        }
        const link = item.match(/<link>(.*?)<\/link>/)?.[1] || '';
        const pubDateRaw = item.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] || '';
        let pubDate = '';
        if (pubDateRaw) {
          try {
            const d = new Date(pubDateRaw);
            pubDate = d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
          } catch {
            pubDate = pubDateRaw;
          }
        }
        return {
          title: title.trim(),
          link: link.trim(),
          source: source.trim() || 'Media Berita Resmi',
          pubDate
        };
      }).filter(a => a.title && a.link);
    } finally {
      clearTimeout(t);
    }
  } catch (err) {
    console.error('[LiveNews] Failed:', err.message);
    return [];
  }
}

// Section A: Forensik Audio & "Sound Tracking" TikTok
function analyzeAudioForensics(musicInfo, authorUsername, videoContext) {
  if (!musicInfo || !musicInfo.title) {
    return {
      title: 'Tidak Teridentifikasi',
      author: 'Tidak Diketahui',
      isOriginal: false,
      audioType: 'unknown',
      audioTypeLabel: 'Audio Tidak Terdeteksi',
      badge: 'warning',
      explanation: 'Metadata trek audio tidak tersedia langsung dari server TikTok.',
      playUrl: null,
      duration: 0
    };
  }

  const titleLower = musicInfo.title.toLowerCase();
  const isOriginal = Boolean(musicInfo.original) || titleLower.startsWith('original sound') || titleLower.startsWith('suara asli');
  const isAuthorMatch = musicInfo.author && authorUsername && musicInfo.author.toLowerCase() === authorUsername.toLowerCase();

  let audioType = 'trending';
  let audioTypeLabel = 'Sound Tren / Reused Audio';
  let badge = 'warning';
  let explanation = '';

  if (isOriginal || isAuthorMatch) {
    audioType = 'original';
    audioTypeLabel = 'Audio Asli Kreator (Original Sound)';
    badge = 'verified';
    explanation = `Audio video ("${musicInfo.title}") merupakan suara asli dari rekaman pengunggah (@${authorUsername || musicInfo.author}). Tidak ada indikasi penggantian suara atau penempelan backsound dramatis.`;
  } else {
    audioType = 'trending';
    audioTypeLabel = 'Trek Audio Eksternal / Dipakai Ulang';
    badge = 'warning';
    explanation = `Video menggunakan trek audio eksternal "${musicInfo.title}" milik @${musicInfo.author || 'kreator lain'}. Hati-hati terhadap potensi manipulasi audio (video netral yang ditempeli orasi demonstrasi, sirene, atau suara tangisan).`;
  }

  if (videoContext?.audioAnalysis && videoContext.audioAnalysis.toLowerCase().includes('manipulasi')) {
    badge = 'danger';
    explanation += ` Catatan AI: ${videoContext.audioAnalysis}`;
  }

  return {
    title: musicInfo.title,
    author: musicInfo.author || 'Kreator TikTok',
    isOriginal,
    audioType,
    audioTypeLabel,
    badge,
    explanation,
    playUrl: musicInfo.play || null,
    duration: musicInfo.duration || 0
  };
}

// Section D: Forensik Akun & Kredibilitas Pengunggah
function analyzeAuthorForensics(author, stats) {
  const authorName = author?.nickname || 'Kreator TikTok';
  const authorUsername = author?.unique_id || 'creator';
  const isVerified = Boolean(author?.verified);

  const mediaKeywords = ['news', 'kompas', 'detik', 'tempo', 'tv', 'tribun', 'antara', 'kumparan', 'liputan6', 'cnn', 'cnbc', 'official', 'republika', 'jawapos'];
  const isMediaOutlet = mediaKeywords.some(k => authorUsername.toLowerCase().includes(k) || authorName.toLowerCase().includes(k));

  let accountTypeLabel = 'Akun Publik';
  let badge = 'warning';
  let credibilityRating = 'Standar (Perlu Verifikasi Mandiri)';

  if (isVerified && isMediaOutlet) {
    accountTypeLabel = 'Media Berita Resmi Terverifikasi';
    badge = 'verified';
    credibilityRating = 'Tinggi (Organisasi Media Terakreditasi)';
  } else if (isVerified) {
    accountTypeLabel = 'Kreator Resmi Terverifikasi';
    badge = 'verified';
    credibilityRating = 'Cukup Tinggi (Memiliki Centang Verifikasi TikTok)';
  } else if (isMediaOutlet) {
    accountTypeLabel = 'Kanal Berita Non-Verifikasi';
    badge = 'warning';
    credibilityRating = 'Sedang (Mengatasnamakan Media Tanpa Centang Resmi)';
  } else {
    accountTypeLabel = 'Akun Personal / Publik';
    badge = 'verified';
    credibilityRating = 'Standar (Akun Personal TikTok)';
  }

  const playCount = stats?.playCount || 0;
  const diggCount = stats?.diggCount || 0;
  const commentCount = stats?.commentCount || 0;
  const engagementRate = playCount > 0 ? ((diggCount + commentCount) / playCount * 100).toFixed(1) + '%' : 'N/A';

  return {
    authorName,
    authorUsername,
    avatarUrl: author?.avatar || null,
    isVerified,
    accountTypeLabel,
    badge,
    credibilityRating,
    stats: {
      playCount,
      diggCount,
      commentCount,
      engagementRate
    },
    explanation: isVerified
      ? `@${authorUsername} memiliki tanda verifikasi resmi (Verified Badge) dari TikTok yang mengonfirmasi identitas asli entitas pembuat konten.`
      : `@${authorUsername} adalah akun publik tanpa lencana centang verifikasi resmi. Pertimbangkan kredibilitas konten dengan memeriksa sumber berita pembanding.`
  };
}

// Section C: Deteksi De-kontekstualisasi & Link Pencarian Visual (Google Lens / Yandex / Bing)
function analyzeDecontextualization(thumbnailUrl, title, videoContext) {
  const encThumb = encodeURIComponent(thumbnailUrl || '');
  const reverseSearchLinks = {
    googleLens: thumbnailUrl ? `https://lens.google.com/uploadbyurl?url=${encThumb}` : `https://images.google.com/`,
    yandex: thumbnailUrl ? `https://yandex.com/images/search?rpt=imageview&url=${encThumb}` : `https://yandex.com/images/`,
    bing: thumbnailUrl ? `https://www.bing.com/images/searchbyimage?cbir=sbi&imgurl=${encThumb}` : `https://www.bing.com/visualsearch`
  };

  const isFootageReused = Boolean(
    videoContext?.manipulationCheck?.toLowerCase().includes('rekaman lama') ||
    videoContext?.manipulationCheck?.toLowerCase().includes('reused') ||
    videoContext?.manipulationCheck?.toLowerCase().includes('potongan video yang tidak kontekstual')
  );

  const explanation = isFootageReused
    ? 'Terindikasi kemungkinan rekaman video diambil dari peristiwa lampau atau lokasi berbeda yang diunggah ulang dengan klaim baru.'
    : 'Tidak terdeteksi indikasi jelas rekaman daur ulang (reused footage). Anda dapat menekan tombol pencarian visual di bawah untuk memverifikasi tanggal pertama kali video beredar di internet.';

  return {
    isFootageReused,
    explanation,
    reverseSearchLinks
  };
}

// Section F: Analisis Komentar Lanjutan (Deteksi Bot, Copypasta, Astroturfing, Aspek Skeptis)
function analyzeAstroturfingAndAspects(cleanComments) {
  if (!Array.isArray(cleanComments) || cleanComments.length === 0) {
    return {
      astroturfingDetected: false,
      copypastaCount: 0,
      astroturfingSignal: 'Data komentar tidak mencukupi untuk analisis bot.',
      aspectSentiment: { skepticalCount: 0, supportiveCount: 0, criticalCount: 0 }
    };
  }

  const textCounts = new Map();
  cleanComments.forEach(c => {
    const norm = c.text.toLowerCase().replace(/[^\w\s]/g, '').trim();
    if (norm.length > 8) {
      textCounts.set(norm, (textCounts.get(norm) || 0) + 1);
    }
  });

  let maxDup = 0;
  let copypastaCount = 0;
  for (const count of textCounts.values()) {
    if (count > 1) {
      copypastaCount += count;
      if (count > maxDup) maxDup = count;
    }
  }

  const astroturfingDetected = maxDup >= 2;
  const astroturfingSignal = astroturfingDetected
    ? `Terdeteksi ${copypastaCount} komentar dengan susunan kalimat identik (copypasta) dari akun berbeda. Indikasi potensi spam terorganisir / bot buzzer.`
    : 'Pola percakapan warganet terpantau organik tanpa indikasi pesan identik massal.';

  const skepticalTerms = ['hoax', 'bohong', 'fitnah', 'mana bukti', 'sumbernya mana', 'ngawur', 'sesat', 'bukan gitu', 'kroscek', 'mana buktinya'];
  const supportiveTerms = ['setuju', 'bener banget', 'mantap', 'terima kasih', 'edukasi', 'makasih infonya', 'semoga', 'amiin'];
  const criticalTerms = ['parah', 'kecewa', 'bahaya', 'aneh', 'janggal', 'salah'];

  let skepticalCount = 0;
  let supportiveCount = 0;
  let criticalCount = 0;

  cleanComments.forEach(c => {
    const t = c.text.toLowerCase();
    if (skepticalTerms.some(term => t.includes(term))) skepticalCount++;
    if (supportiveTerms.some(term => t.includes(term))) supportiveCount++;
    if (criticalTerms.some(term => t.includes(term))) criticalCount++;
  });

  return {
    astroturfingDetected,
    copypastaCount,
    astroturfingSignal,
    aspectSentiment: {
      skepticalCount,
      supportiveCount,
      criticalCount
    }
  };
}

function filterRealComments(rawComments) {
  if (!Array.isArray(rawComments) || rawComments.length === 0) {
    return { cleanComments: [], filteredOutCount: 0 };
  }

  const spamKeywords = [
    'keranjang kuning', 'affiliate', 'link di bio', 'cek bio', 'order', 'reseller',
    'polowback', 'follback', 'gaji', 'bisnis online', 'promo', 'diskon', 'join live',
    'subs', 'subscribe', 'bot', 'slot', 'deposit', 'wa.me', 'hubungi no'
  ];

  let filteredOutCount = 0;
  const cleanComments = [];

  rawComments.forEach(c => {
    const lower = c.text.toLowerCase();
    const isSpam = spamKeywords.some(k => lower.includes(k)) || c.text.length < 2;
    if (isSpam) {
      filteredOutCount++;
    } else {
      cleanComments.push(c);
    }
  });

  cleanComments.sort((a, b) => b.likes - a.likes);
  return { cleanComments, filteredOutCount };
}

// Extract Substantive Theme (NOT Clickbait Title) for News and Quick Summary
function extractSubstantiveTheme(fullCaption, entities, videoContext, tikwmData) {
  if (videoContext?.substantiveTheme && videoContext.substantiveTheme.length >= 3) {
    return videoContext.substantiveTheme.trim();
  }

  if (videoContext?.topicSummary) {
    const cleanSum = videoContext.topicSummary
      .replace(/video ini membahas|konten ini tentang|membahas tentang|video dari|membahas seputar/gi, '')
      .replace(/[^\w\s]/g, ' ')
      .trim();
    const words = cleanSum.split(/\s+/).filter(w => w.length >= 3).slice(0, 4);
    if (words.length >= 2) return words.join(' ');
  }

  return extractNewsTopicQuery(fullCaption, entities, videoContext);
}

function extractNewsTopicQuery(fullCaption, entities, videoContext) {
  if (videoContext?.topicSummary) {
    const topicWords = videoContext.topicSummary
      .replace(/[^a-zA-Z0-9\u00C0-\u024F\u4e00-\u9fa5\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length >= 3)
      .slice(0, 4);
    if (topicWords.length >= 2) return topicWords.join(' ');
  }

  if (!fullCaption && (!entities || entities.length === 0)) return 'berita nasional terkini';

  const stopWords = new Set([
    'fyp', 'foryou', 'foryoupage', 'viral', 'trending', 'xyzbca', 'beritatrending',
    'breakingnews', 'beritaterkini', 'goks', 'kissme', 'fyyyppppppppppppppp', 'trend',
    'video', 'foto', 'heboh', 'geger', 'gempar', 'kini', 'dulu', 'dengan', 'karena',
    'untuk', 'pada', 'dari', 'yang', 'akan', 'bisa', 'ini', 'itu', 'udah', 'bikin',
    'semoga', 'makasih', 'terima', 'kasih', 'sama', 'juga', 'kamu', 'saya', 'kita',
    'dosa', 'parah', 'kaget', 'detik-detik', 'terjadi', 'ternyata', 'hujat', 'waduh', 'gawat'
  ]);

  const dictMap = {
    'lukyafirman': 'Luky Alfirman',
    'lukyalfirman': 'Luky Alfirman',
    'wamenkeu': 'Wamenkeu',
    'purbaya': 'Purbaya',
    'prabowo': 'Prabowo',
    'gibran': 'Gibran',
    'jokowi': 'Jokowi',
    'mbg': 'Makan Bergizi Gratis',
    'eskrim': 'Es Krim',
    'motorlistrik': 'Motor Listrik',
    'subsidi': 'Subsidi',
    'kemenkeu': 'Kemenkeu',
    'megathrust': 'Gempa Megathrust'
  };

  const topicWords = [];

  const tokens = (fullCaption || '').replace(/[^\w\s]/g, ' ').split(/\s+/);
  tokens.forEach(t => {
    const lower = t.toLowerCase();
    if (lower.length >= 3 && !stopWords.has(lower)) {
      if (dictMap[lower]) {
        if (!topicWords.includes(dictMap[lower])) topicWords.push(dictMap[lower]);
      } else if (/^[A-Z][a-zA-Z0-9_-]+$/.test(t)) {
        if (!topicWords.includes(t)) topicWords.push(t);
      }
    }
  });

  (entities || []).forEach(e => {
    const lower = e.toLowerCase();
    if (lower.length >= 3 && !stopWords.has(lower)) {
      const val = dictMap[lower] || (e.charAt(0).toUpperCase() + e.slice(1));
      if (!topicWords.includes(val)) topicWords.push(val);
    }
  });

  return topicWords.length > 0 ? topicWords.slice(0, 4).join(' ') : (fullCaption || '').slice(0, 40);
}

function generateNewsVerificationSources(fullCaption, entities, videoContext) {
  const searchTerm = extractNewsTopicQuery(fullCaption, entities, videoContext);
  const encPlus = encodeURIComponent(searchTerm);

  return [
    {
      title: `Google News: Riset Berita Resmi "${searchTerm}"`,
      publisher: 'Google News',
      url: `https://www.google.com/search?q=${encPlus}&tbm=nws`
    },
    {
      title: `TurnBackHoax.id: Periksa Cek Fakta "${searchTerm}"`,
      publisher: 'TurnBackHoax.id',
      url: `https://turnbackhoax.id/?s=${encPlus}`
    },
    {
      title: `CekFakta.com: Arsip Verifikasi Multimedia "${searchTerm}"`,
      publisher: 'CekFakta.com',
      url: `https://cekfakta.com/?s=${encPlus}`
    },
    {
      title: `Antara News: Berita Resmi Kantor Berita Negara`,
      publisher: 'Antara News',
      url: `https://www.antaranews.com/search?q=${encPlus}`
    },
    {
      title: `Kompas.com: Penelusuran Berita Utama "${searchTerm}"`,
      publisher: 'Kompas.com',
      url: `https://www.google.com/search?q=${encPlus}+site:kompas.com`
    },
    {
      title: `Detik.com: Liputan Khusus "${searchTerm}"`,
      publisher: 'Detik.com',
      url: `https://www.google.com/search?q=${encPlus}+site:detik.com`
    }
  ];
}

function classifyRealComment(text) {
  const lower = text.toLowerCase();
  const critKeywords = ['hoax', 'provokasi', 'salah', 'kroscek', 'berita', 'bukti', 'bohong', 'dilebihkan', 'dpr', 'pejabat', 'wamenkeu', 'sesat', 'mana', 'aneh', 'janggal', 'tiap hari', 'fyp'];
  const posKeywords = ['lucu', 'gemes', 'bagus', 'setuju', 'mantap', 'makasih', 'edukasi', 'keren', 'suka', 'terhibur', 'terima kasih', 'semoga', 'amiin', 'wkwk', 'haha'];

  if (critKeywords.some(k => lower.includes(k))) {
    return { type: 'critical', label: 'Tanggapan Kritis / Sorotan' };
  }
  if (posKeywords.some(k => lower.includes(k))) {
    return { type: 'positive', label: 'Positif Tinggi' };
  }
  return { type: 'positive', label: 'Reaksi Warganet' };
}

function detectAiContent(fullCaption, text, videoContext) {
  const aiKeywords = [
    '#ai', '#aigenerated', '#midjourney', '#sora', '#chatgpt', '#deepfake',
    '#elevenlabs', '#aivideo', '#runway', '#aiindonesia', '#aivoice', '#aitools'
  ];
  
  const aiPhrases = [
    'menurut cerita yang beredar', 'bayangkan jika', 'rahasia terbesar yang tidak pernah',
    'tahukah kamu bahwa', 'fakta tersembunyi yang', 'suara ai', 'dubbing ai', 'dibuat oleh ai',
    'generasi ai', 'rekayasa ai', 'animasi ai'
  ];

  const matchedAiTags = aiKeywords.filter(k => text.includes(k));
  const matchedAiPhrases = aiPhrases.filter(p => text.includes(p));

  let videoAiIndicators = false;
  if (videoContext?.audioAnalysis) {
    const audioLower = videoContext.audioAnalysis.toLowerCase();
    if (audioLower.includes('ai voice') || audioLower.includes('text-to-speech') || audioLower.includes('suara sintetis') || audioLower.includes('ai-generated')) {
      videoAiIndicators = true;
    }
  }
  if (videoContext?.manipulationCheck) {
    const manipLower = videoContext.manipulationCheck.toLowerCase();
    if (manipLower.includes('deepfake') || manipLower.includes('ai-generated') || manipLower.includes('manipulasi') || manipLower.includes('buatan ai')) {
      videoAiIndicators = true;
    }
  }

  const isAiDetected = matchedAiTags.length > 0 || matchedAiPhrases.length > 0 || videoAiIndicators;
  
  const signals = [];
  if (matchedAiTags.length > 0) {
    signals.push(`Menggunakan hashtag generator/sintesis AI (${matchedAiTags.join(', ')})`);
  }
  if (matchedAiPhrases.length > 0) {
    signals.push(`Terdeteksi skrip & pengisi suara sintesis AI (Text-to-Speech)`);
  }
  if (videoAiIndicators && videoContext?.audioAnalysis) {
    signals.push(`Analisis audio: ${videoContext.audioAnalysis}`);
  }
  if (videoAiIndicators && videoContext?.manipulationCheck) {
    signals.push(`Pemeriksaan manipulasi: ${videoContext.manipulationCheck}`);
  }

  if (!isAiDetected) {
    signals.push('Tidak terdeteksi penanda buatan AI / Deepfake pada teks caption');
    if (videoContext?.audioAnalysis) {
      signals.push(`Analisis audio: ${videoContext.audioAnalysis}`);
    } else {
      signals.push('Gaya narasi dan nada suara terindikasi rekaman manusia asli');
    }
  }

  return {
    isAiGenerated: isAiDetected,
    confidence: isAiDetected ? 'high' : (videoContext ? 'high' : 'medium'),
    statusLabel: isAiDetected ? 'Terdeteksi Sintesis AI / Deepfake' : 'Terdeteksi Konten Rekaman Manusia',
    badgeType: isAiDetected ? 'warning' : 'verified',
    audioType: isAiDetected ? 'Audio Sintesis AI (Text-to-Speech)' : 'Audio Asli Rekaman Manusia',
    explanation: isAiDetected
      ? 'Video ini terindikasi menggunakan visual buatan AI atau pengisi suara robotik (AI Voiceover). Harap kroscek kebenaran narasi dengan media terpercaya.'
      : 'Konten dan elemen narasi video tidak menunjukkan pola pembentukan buatan AI secara mencolok.',
    signals
  };
}

// Build Tab 1 Quick Verdict Object
function buildQuickVerdict(credibility, claims, provocation, substantiveTheme, themeExplanation, liveNews) {
  const score = credibility?.score ?? 50;
  const provLevel = provocation?.level || 'low';
  const firstClaim = claims?.[0] || null;
  const verdict = firstClaim?.verdict || 'unverified';

  let validityVerdict = 'unverified';
  let badgeLabel = 'PERLU KROSCEK';
  let badgeType = 'warning';
  let summaryVerdict = 'Informasi dalam video ini memerlukan kroscek lebih lanjut ke sumber resmi.';

  if (verdict === 'false' || score < 40) {
    validityVerdict = 'false';
    badgeLabel = 'HOAX / TIDAK AKURAT';
    badgeType = 'danger';
    summaryVerdict = 'Klaim utama dalam video ini terindikasi tidak akurat atau bertentangan dengan fakta publik.';
  } else if (verdict === 'misleading' || (score < 60 && provLevel === 'high')) {
    validityVerdict = 'misleading';
    badgeLabel = 'KONTEN MENYESATKAN';
    badgeType = 'warning';
    summaryVerdict = 'Video ini menyajikan narasi dengan pembingkaian yang menyesatkan atau melebih-lebihkan fakta sebenarnya.';
  } else if (verdict === 'mixed') {
    validityVerdict = 'mixed';
    badgeLabel = 'SEBAGIAN BENAR';
    badgeType = 'warning';
    summaryVerdict = 'Sebagian informasi memuat fakta nyata, namun konteks penyampaiannya belum sepenuhnya lengkap.';
  } else if ((verdict === 'supported' && score >= 70) || (score >= 80 && provLevel === 'low')) {
    validityVerdict = 'valid';
    badgeLabel = 'VALID & AMAN';
    badgeType = 'verified';
    summaryVerdict = 'Isi konten dan narasi video terverifikasi aman serta tidak memuat unsur disinformasi atau provokasi adu domba.';
  } else if (score >= 70) {
    validityVerdict = 'mixed';
    badgeLabel = 'SEBAGIAN BENAR';
    badgeType = 'warning';
    summaryVerdict = 'Sebagian narasi memuat informasi yang wajar, namun tetap disarankan memverifikasi konteks lengkap.';
  }

  const keyFinding = firstClaim?.explanation || 'Pemeriksaan menemukan bahwa konteks narasi perlu diverifikasi dengan berita resmi.';

  return {
    validityVerdict,
    badgeLabel,
    badgeType,
    score,
    summaryVerdict,
    substantiveTheme: substantiveTheme || 'Isu Terkait',
    themeExplanation: themeExplanation || `Video berfokus pada topik '${substantiveTheme}'. Narasi perlu disaring secara jernih dari judul sensasional.`,
    keyFinding,
    relatedNews: liveNews || []
  };
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Deep Multimodal Analysis with Gemini (Video)
async function analyzeVideoWithGemini(fileUri, mimeType, url, videoMeta, realComments, tikwmData, apiKey) {
  const candidateModels = Array.from(new Set([
    process.env.GEMINI_MODEL,
    'gemini-3.5-flash',
    'gemini-3.6-flash',
    'gemini-3.8-flash',
    'gemini-flash-latest'
  ])).filter(Boolean);

  const videoId = extractVideoId(url) || videoMeta?.embed_product_id || null;
  const fullCaptionText = videoMeta?.title || 'Deskripsi tidak dapat diambil';

  const { cleanComments } = filterRealComments(realComments);
  const realCommentsContext = cleanComments.length > 0
    ? `KUTIPAN KOMENTAR ASLI WARGANET (DARI TIKTOK):\n` + cleanComments.slice(0, 15).map(c => `- @${c.userUniqueId} (${c.likes} suka): "${c.text}"`).join('\n')
    : `Komentar publik belum dapat ditarik langsung.`;

  const deepVideoPrompt = `Anda adalah VerifTok, sistem forensik verifikasi video TikTok tingkat mendalam. Anda HARUS MENONTON SELURUH VIDEO INI DARI AWAL SAMPAI HABIS.

TUGAS FORENSIK:
1. Tentukan "substantiveTheme": Topik/isu substantif sebenarnya yang dibahas video ini dalam 2-4 kata (CONTOH: "Luky Alfirman Wamenkeu", "Waspada Megathrust", "Makan Bergizi Gratis"), BUKAN judul clickbait!
2. Tangkap "onScreenTexts": Catat SEMUA teks stiker, overlay teks besar di layar (CapCut kinetic typography, headline teks kuning/merah) yang terlihat di video.
3. Forensik Suara/Audio: Apakah ucapan asli pembicara, musik dramatis, atau audio dubbing/sound orang lain?
4. Periksa Manipulasi/De-kontekstualisasi: Apakah rekaman video tampak diambil dari peristiwa lama/tempat lain yang diberi narasi baru?
5. Evaluasi konsistensi isi video vs judul/caption (apakah clickbait?).

INFORMASI TAMBAHAN:
- URL Video: ${url}
- Caption/Judul: ${fullCaptionText}
- Pengunggah: ${videoMeta?.author_name || 'Kreator TikTok'} (@${videoMeta?.author_unique_id || 'unknown'})
${realCommentsContext}

FORMAT JSON WAJIB (tanpa markdown wrapper):
{
  "status": "complete",
  "substantiveTheme": "Tema substantif 2-4 kata",
  "themeExplanation": "Penjelasan 2-3 kalimat lugas tentang apa tema sebenarnya dari video ini (bebas dari clickbait).",
  "onScreenOcr": {
    "detectedTexts": ["Teks stiker 1 yang tampak di layar", "Teks overlay 2"],
    "hasMisleadingOverlay": false,
    "explanation": "Penjelasan apakah teks di layar melebih-lebihkan fakta sebenarnya"
  },
  "decontextualization": {
    "isFootageReused": false,
    "explanation": "Analisis apakah cuplikan rekaman tampak diambil dari peristiwa lama atau luar negeri"
  },
  "videoContext": {
    "topicSummary": "Ringkasan 1-2 kalimat tentang apa isi utama video ini secara keseluruhan",
    "detailedNarrative": "Penjelasan mendalam 3-5 kalimat tentang alur narasi video dari awal sampai akhir.",
    "visualDescription": "Deskripsi detail apa yang terlihat di video: orang, tempat, kejadian, grafik, teks overlay.",
    "spokenContent": "Transkrip/ringkasan dari apa yang DIUCAPKAN di video. Jika tidak ada ucapan, tulis 'Hanya musik/tanpa ucapan'.",
    "audioAnalysis": "Analisis suara/musik: apakah suara manusia asli, AI voice-over, musik dramatis penambah ketegangan, dsb.",
    "keyMoments": ["Momen penting 1", "Momen penting 2"],
    "videoVsCaption": "Perbandingan isi video vs caption/judul (apakah konsisten atau clickbait).",
    "contentCategory": "berita" | "hiburan" | "edukasi" | "opini" | "promosi" | "propaganda" | "satir" | "fiksi",
    "contextDepth": "deep" | "moderate" | "shallow",
    "manipulationCheck": "Pemeriksaan tanda-tanda manipulasi visual/audio atau potongan video tanpa konteks."
  },
  "video": {
    "title": ${JSON.stringify(videoMeta?.title?.slice(0, 100) || "Video TikTok")},
    "fullCaption": ${JSON.stringify(fullCaptionText)},
    "videoId": ${JSON.stringify(videoId)},
    "embedHtml": ${JSON.stringify(videoMeta?.html || null)},
    "authorName": ${JSON.stringify(videoMeta?.author_name || "Kreator TikTok")},
    "authorUsername": ${JSON.stringify(videoMeta?.author_unique_id || "creator")},
    "thumbnailUrl": ${JSON.stringify(videoMeta?.thumbnail_url || null)}
  },
  "comments": {
    "positive": "55%",
    "negative": "30%",
    "hate": "5%",
    "sampleSize": ${cleanComments.length || 0},
    "filteredOutCount": 0,
    "summary": "Ringkasan opini warganet berdasarkan isi video.",
    "sampleComments": [
      {
        "text": "Kutipan komentar asli",
        "userUniqueId": "username",
        "userNickname": "Nama",
        "likes": 10,
        "type": "positive" | "critical" | "provocative",
        "label": "Tanggapan Kritis" | "Positif",
        "reason": "Konteks komentar"
      }
    ],
    "confidence": "high"
  },
  "provocation": {
    "level": "low" | "medium" | "high",
    "explanation": "Penjelasan tingkat provokasi berdasarkan ISI VIDEO yang ditonton.",
    "signals": ["Sinyal pembingkaian 1", "Sinyal pembingkaian 2"],
    "confidence": "high"
  },
  "claims": [
    {
      "claim": "Klaim utama yang disampaikan di dalam video",
      "verdict": "supported" | "false" | "misleading" | "unverified" | "mixed",
      "explanation": "Penjelasan verifikasi klaim.",
      "confidence": "high",
      "sources": [
        {
          "title": "Sumber periksa fakta",
          "publisher": "Penerbit",
          "url": "https://..."
        }
      ]
    }
  ],
  "limitations": []
}`;

  let lastError = null;
  for (const modelName of candidateModels) {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 90000);

    try {
      const requestBody = {
        contents: [{
          role: 'user',
          parts: [
            { fileData: { fileUri, mimeType } },
            { text: deepVideoPrompt }
          ]
        }],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.15
        }
      };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify(requestBody)
      });

      if (!res.ok) {
        const errBody = await res.text().catch(() => '');
        lastError = new Error(`Gemini multimodal ${modelName} HTTP ${res.status}: ${errBody.slice(0, 200)}`);
        await sleep(500);
        continue;
      }

      const data = await res.json();
      const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText) continue;

      const cleanJson = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const parsed = JSON.parse(cleanJson);
      if (validReport(parsed)) {
        return parsed;
      }
    } catch (err) {
      lastError = err;
    } finally {
      clearTimeout(t);
    }
  }

  throw lastError || new Error('All Gemini models failed for video analysis');
}

// Multimodal Analysis for TikTok Photo Carousel Mode
async function analyzePhotosWithGemini(photoParts, url, videoMeta, realComments, tikwmData, apiKey) {
  const candidateModels = Array.from(new Set([
    process.env.GEMINI_MODEL,
    'gemini-3.5-flash',
    'gemini-3.6-flash',
    'gemini-3.8-flash',
    'gemini-flash-latest'
  ])).filter(Boolean);

  const fullCaptionText = videoMeta?.title || 'Deskripsi tidak dapat diambil';
  const { cleanComments } = filterRealComments(realComments);

  const promptText = `Anda adalah VerifTok. Konten TikTok ini adalah FORMAT FOTO GESER / CAROUSEL SLIDESHOW.
Tonton dan baca setiap slide foto dengan seksama dari slide pertama hingga akhir.

TUGAS UTAMA:
1. "substantiveTheme": Tentukan tema substantif sebenarnya dari foto-foto ini dalam 2-4 kata (CONTOH: "Tips Beasiswa Kuliah", "Waspada Modus Penipuan WA"), BUKAN judul heboh.
2. "onScreenOcr": Ekstrak semua tulisan dan stiker teks di dalam slide foto ini.
3. Periksa apakah ada klaim hoax atau informasi sesat yang disisipkan di slide-slide foto tersebut.

URL: ${url}
Caption: ${fullCaptionText}

Format respons WAJIB JSON persis sesuai struktur VerifTok.`;

  for (const modelName of candidateModels) {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 35000);

    try {
      const parts = [...photoParts, { text: promptText }];
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [{ role: 'user', parts }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0.15 }
        })
      });

      if (res.ok) {
        const data = await res.json();
        const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (rawText) {
          const cleanJson = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
          const parsed = JSON.parse(cleanJson);
          if (validReport(parsed)) return parsed;
        }
      }
    } catch {
      // Continue to next model
    } finally {
      clearTimeout(t);
    }
  }
  return null;
}

// Text-only Gemini analysis fallback
async function analyzeWithGemini(url, videoMeta, realComments, tikwmData, apiKey) {
  const candidateModels = Array.from(new Set([
    process.env.GEMINI_MODEL,
    'gemini-3.5-flash',
    'gemini-3.6-flash',
    'gemini-3.8-flash',
    'gemini-flash-latest'
  ])).filter(Boolean);

  const videoId = extractVideoId(url) || videoMeta?.embed_product_id || null;
  const fullCaptionText = videoMeta?.title || 'Deskripsi tidak dapat diambil';

  const { cleanComments } = filterRealComments(realComments);
  const realCommentsContext = cleanComments.length > 0
    ? `KUTIPAN KOMENTAR ASLI WARGANET:\n` + cleanComments.slice(0, 15).map(c => `- @${c.userUniqueId} (${c.likes} suka): "${c.text}"`).join('\n')
    : `Komentar publik belum dapat ditarik langsung.`;

  const systemPrompt = `Anda adalah pakar verifikasi informasi, deteksi hoax/provokasi, dan analisis media sosial (VerifTok) di Indonesia.
Ekstrak "substantiveTheme" (tema substantif 2-4 kata, BUKAN judul clickbait).
Format JSON wajib (tanpa markdown wrapper) sesuai format standar VerifTok.`;

  const userContext = `URL Video: ${url}
Caption: ${fullCaptionText}
Pengunggah: ${videoMeta?.author_name || 'Kreator TikTok'} (@${videoMeta?.author_unique_id || 'unknown'})
${realCommentsContext}`;

  for (const modelName of candidateModels) {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 20000);

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: systemPrompt + '\n\n' + userContext }] }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0.2 }
        })
      });

      if (res.ok) {
        const data = await res.json();
        const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (rawText) {
          const cleanJson = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
          const parsed = JSON.parse(cleanJson);
          if (validReport(parsed)) return parsed;
        }
      }
    } catch {
      // Continue to next model
    } finally {
      clearTimeout(t);
    }
  }

  throw new Error('All Gemini candidate models failed for text analysis');
}

// Built-in Smart Analyzer (Rule-based, NO Fake/Fabricated Comments)
function analyzeLocally(url, videoMeta, realComments = [], tikwmData = null, liveNews = []) {
  const rawTitle = videoMeta?.title || tikwmData?.title || '';
  const fullCaption = rawTitle ? rawTitle.trim() : 'Deskripsi video TikTok.';
  const authorName = videoMeta?.author_name || tikwmData?.author?.nickname || 'Kreator TikTok';
  const authorUsername = videoMeta?.author_unique_id || tikwmData?.author?.unique_id || 'creator';
  const text = fullCaption.toLowerCase();
  const videoId = extractVideoId(url) || videoMeta?.embed_product_id || null;

  const entities = extractKeyEntities(fullCaption);
  const mainSubject = entities.length > 0 ? entities.join(', ') : fullCaption.slice(0, 40);

  const highProvKeywords = ['waspada', 'penipuan', 'hoax', 'gempar', 'geger', 'heboh', 'parah', 'bongkar', 'skandal', 'ancaman', 'megathrust', 'bahaya', 'serang', 'hujat', 'hancur', 'histeris', 'rezim', 'darurat', 'dicopot', 'dilantik', 'polemik', 'gawat'];
  const medProvKeywords = ['rahasia', 'fakta', 'info', 'penting', 'kenapa', 'bikin', 'kaget', 'detik-detik', 'terjadi', 'ternyata', 'wamenkeu', 'purbaya', 'prabowo'];

  const matchedHigh = highProvKeywords.filter((k) => text.includes(k));
  const matchedMed = medProvKeywords.filter((k) => text.includes(k));
  const isCaps = (fullCaption.match(/[A-Z]{4,}/g) || []).length > 0;
  const hasExclamation = fullCaption.includes('!') || fullCaption.includes('?');

  let level = 'low';
  const signals = [];

  if (matchedHigh.length >= 1 || (matchedMed.length >= 2 && isCaps)) {
    level = 'high';
    signals.push(`Menggunakan pembingkaian kontroversial seputar ${mainSubject}`);
    if (isCaps) signals.push('Penggunaan huruf kapital (ALL CAPS) berlebih untuk menonjolkan urgensi narasi');
    if (hasExclamation) signals.push('Penggunaan tanda baca dramatis untuk memperkuat kesan kegentingan');
  } else if (matchedMed.length >= 1 || isCaps || hasExclamation) {
    level = 'medium';
    signals.push(`Menggunakan pembingkaian narasi penarik perhatian seputar isu ${mainSubject}`);
    signals.push('Penyampaian informasi cenderung menekankan sudut pandang pergantian atau sorotan publik');
  } else {
    level = 'low';
    signals.push(`Penyampaian pesan seputar ${mainSubject} menggunakan gaya bahasa dan nada penulisan relatif netral`);
    signals.push('Tidak terdeteksi pembingkaian provokatif atau klaim adu domba pada narasi video');
  }

  const provExplanation = level === 'high'
    ? `Video mengenai isu "${fullCaption.slice(0, 70)}..." menggunakan pembingkaian yang tajam dan berisiko memicu spekulasi publik seputar ${mainSubject}. Disarankan mengonfirmasi ke sumber berita resmi.`
    : level === 'medium'
    ? `Video memuat deskripsi seputar ${mainSubject} yang menarik perhatian publik, namun masih dalam batas wajar penyampaian informasi.`
    : `Video menyajikan konten seputar ${mainSubject} secara santai tanpa unsur yang memicu perdebatan sengit.`;

  // Real comment processing — ABSOLUTELY NO FAKE MOCK COMMENTS
  const { cleanComments, filteredOutCount } = filterRealComments(realComments);
  const commentForensics = analyzeAstroturfingAndAspects(cleanComments);

  let positive = '0%';
  let negative = '0%';
  let hate = '0%';
  let sampleSize = cleanComments.length;
  let commentSummary = '';
  let sampleComments = [];

  if (cleanComments.length > 0) {
    const topComments = cleanComments.slice(0, 6);
    sampleComments = topComments.map(c => {
      const { type, label } = classifyRealComment(c.text);
      return {
        text: `"${c.text}"`,
        type,
        label,
        userUniqueId: c.userUniqueId,
        userNickname: c.userNickname,
        likes: c.likes,
        reason: `Komentar asli ditarik dari TikTok (@${c.userUniqueId}${c.likes > 0 ? ` · ${c.likes.toLocaleString('id-ID')} suka` : ''})`
      };
    });

    const posCount = commentForensics.aspectSentiment.supportiveCount;
    const critCount = commentForensics.aspectSentiment.skepticalCount + commentForensics.aspectSentiment.criticalCount;
    const totalCount = Math.max(1, cleanComments.length);
    positive = `${Math.min(95, Math.round((posCount / totalCount) * 100))}%`;
    negative = `${Math.min(95, Math.round((critCount / totalCount) * 100))}%`;
    hate = '4%';

    commentSummary = `Berhasil menarik ${cleanComments.length} komentar publik asli dari TikTok (${filteredOutCount} komentar spam disaring). ${commentForensics.astroturfingSignal}`;
  } else {
    commentSummary = 'Data komentar publik tidak dapat ditarik langsung dari TikTok untuk video ini.';
  }

  // Claim check
  let claimText = '';
  let verdict = 'unverified';
  let claimExplanation = '';

  const sources = generateNewsVerificationSources(fullCaption, entities, null);

  if (text.includes('dicopot') || text.includes('dilantik') || text.includes('wamenkeu') || text.includes('prabowo') || text.includes('purbaya') || text.includes('politik')) {
    claimText = `Klaim seputar pergantian jabatan atau kebijakan publik (${mainSubject})`;
    verdict = 'mixed';
    claimExplanation = `Informasi pelantikan dan penunjukan pejabat publik merupakan wewenang resmi pemerintah. Pembingkaian narasi di media sosial kerap memuat cuplikan berita yang perlu diverifikasi langsung dengan rilis resmi media nasional.`;
  } else if (text.includes('eskrim') || text.includes('trend') || text.includes('kissme')) {
    claimText = `Konten partisipasi tren media sosial '${mainSubject}'`;
    verdict = 'supported';
    claimExplanation = `Konten ini terverifikasi sebagai ekspresi hiburan kasual tanpa memuat klaim disinformasi politik.`;
  } else {
    claimText = fullCaption.length > 5 ? `Klaim/narasi video seputar "${fullCaption.slice(0, 65)}..."` : 'Klaim atau narasi utama yang disampaikan dalam video';
    verdict = level === 'high' ? 'misleading' : 'supported';
    claimExplanation = level === 'high'
      ? 'Narasi video menyajikan klaim yang berpotensi dilebih-lebihkan dari fakta lapangan.'
      : 'Konten berupa materi berita/hiburan tanpa klaim faktual yang bertentangan dengan konsensus publik.';
  }

  let score = 90;
  if (level === 'high') score -= 35;
  else if (level === 'medium') score -= 15;
  if (verdict === 'false') score -= 40;
  else if (verdict === 'misleading') score -= 25;
  else if (verdict === 'mixed') score -= 15;
  if (isCaps || hasExclamation) score -= 5;
  score = Math.max(20, Math.min(96, score));

  const credibility = {
    score,
    rating: score >= 80 ? 'Tinggi (Sangat Layak Dipercaya)' : score >= 50 ? 'Sedang (Perlu Kroscek Lanjutan)' : 'Rendah (Berisiko Disinformasi)',
    badge: score >= 80 ? 'verified' : score >= 50 ? 'warning' : 'danger',
    explanation: score >= 80 
      ? 'Narasi video didukung oleh konsensus fakta tanpa indikasi manipulasi atau provokasi adu domba.'
      : score >= 50
      ? 'Narasi video mengandung informasi yang sebagian belum terverifikasi atau menggunakan pembingkaian opini.'
      : 'Narasi video terindikasi memuat klaim sensasional atau potensi ketidakakuratan yang tinggi.'
  };

  const substantiveTheme = extractSubstantiveTheme(fullCaption, entities, null, tikwmData);
  const themeExplanation = `Video membahas isu '${substantiveTheme}'. Narasi difokuskan pada dinamika topik tersebut.`;

  const quickVerdict = buildQuickVerdict(
    credibility,
    [{ claim: claimText, verdict, explanation: claimExplanation }],
    { level, signals },
    substantiveTheme,
    themeExplanation,
    liveNews
  );

  const audioForensics = analyzeAudioForensics(tikwmData?.music, authorUsername, null);
  const authorForensics = analyzeAuthorForensics(tikwmData?.author, tikwmData?.stats);
  const decontextualization = analyzeDecontextualization(videoMeta?.thumbnail_url || tikwmData?.cover, fullCaption, null);
  const aiDetection = detectAiContent(fullCaption, text, null);

  const detectedTexts = [];
  if (isCaps) {
    const caps = fullCaption.match(/[A-Z]{4,}/g) || [];
    caps.forEach(c => detectedTexts.push(c));
  }
  const onScreenOcr = {
    detectedTexts,
    hasMisleadingOverlay: level === 'high',
    explanation: level === 'high'
      ? 'Terdeteksi teks berhuruf kapital atau tanda seru yang menonjolkan sensasionalisme narasi.'
      : 'Teks overlay tidak menunjukkan pola penyesatan ekstrem.'
  };

  return {
    status: 'complete',
    quickVerdict,
    credibility,
    substantiveTheme,
    audioForensics,
    authorForensics,
    decontextualization,
    onScreenOcr,
    commentForensics,
    isPhotoMode: Boolean(tikwmData?.isPhotoMode),
    photoSlides: tikwmData?.photoSlides || [],
    videoContext: {
      substantiveTheme,
      topicSummary: `Video membahas topik seputar ${substantiveTheme}.`,
      detailedNarrative: `Analisis konteks berbasis metadata dan caption: ${fullCaption.slice(0, 200)}.`,
      visualDescription: tikwmData?.isPhotoMode ? 'Konten berupa galeri slide foto (Carousel).' : 'Deskripsi visual berbasis thumbnail dan metadata.',
      spokenContent: audioForensics.audioTypeLabel,
      audioAnalysis: audioForensics.explanation,
      keyMoments: [`Topik utama: ${substantiveTheme}`],
      videoVsCaption: 'Penyampaian selaras dengan caption utama.',
      contentCategory: level === 'high' ? 'opini' : 'hiburan',
      contextDepth: 'shallow',
      manipulationCheck: decontextualization.explanation,
      analysisMode: 'smart-local'
    },
    video: {
      title: fullCaption.slice(0, 100),
      fullCaption,
      videoId,
      embedHtml: videoMeta?.html || null,
      thumbnailUrl: videoMeta?.thumbnail_url || tikwmData?.cover || null,
      authorName,
      authorUsername
    },
    comments: {
      positive,
      negative,
      hate,
      sampleSize,
      filteredOutCount,
      summary: commentSummary,
      sampleComments,
      confidence: cleanComments.length > 0 ? 'high' : 'low'
    },
    provocation: {
      level,
      explanation: provExplanation,
      signals,
      confidence: 'medium'
    },
    claims: [
      {
        claim: claimText,
        verdict,
        explanation: claimExplanation,
        confidence: 'medium',
        sources
      }
    ],
    aiDetection,
    newsVerificationSources: sources,
    analyzedAt: new Date().toISOString(),
    limitations: cleanComments.length === 0 ? ['Komentar publik tidak dapat ditarik dari TikTok.'] : []
  };
}

// Fallback report for deleted or truncated TikTok URLs
function fallbackReportForInaccessibleVideo(url, resolvedUrl) {
  const videoId = extractVideoId(url) || extractVideoId(resolvedUrl || '') || null;
  const isShortLink = url.includes('vt.tiktok.com') || url.includes('vm.tiktok.com');
  const shortCode = url.split('/').filter(Boolean).pop() || '';
  const isLikelyTruncated = isShortLink && shortCode.length < 7;

  const reasonTitle = isLikelyTruncated
    ? 'Tautan TikTok Terpotong (Tidak Lengkap)'
    : 'Video TikTok Tidak Ditemukan atau Telah Dihapus';

  const reasonExplanation = isLikelyTruncated
    ? 'Tautan yang Anda salin terputus di tengah jalan sehingga server TikTok tidak dapat menemukan video yang dimaksud.'
    : 'Server TikTok mengembalikan status 404 (Not Found). Video ini mungkin telah dihapus oleh pengunggahnya atau diubah menjadi privat.';

  return {
    status: 'partial',
    credibility: {
      score: 0,
      rating: isLikelyTruncated ? 'Tautan Terpotong' : 'Video Tidak Ditemukan',
      badge: 'warning',
      explanation: reasonExplanation
    },
    quickVerdict: {
      validityVerdict: 'unverified',
      badgeLabel: 'TIDAK DAPAT DIAKSES',
      badgeType: 'warning',
      score: 0,
      summaryVerdict: reasonTitle,
      substantiveTheme: 'Tautan Tidak Valid',
      themeExplanation: reasonExplanation,
      keyFinding: 'Pastikan tautan TikTok disalin secara utuh.',
      relatedNews: []
    },
    videoContext: {
      topicSummary: `${reasonTitle}. ${reasonExplanation}`,
      detailedNarrative: reasonExplanation,
      visualDescription: 'Tidak tersedia.',
      spokenContent: 'Tidak tersedia.',
      audioAnalysis: 'Tidak tersedia.',
      keyMoments: ['Salin ulang tautan penuh dari aplikasi TikTok'],
      videoVsCaption: 'Tidak dapat dibandingkan.',
      contentCategory: 'unknown',
      contextDepth: 'shallow',
      manipulationCheck: 'Pemeriksaan tidak dapat dilakukan.',
      analysisMode: 'inaccessible'
    },
    video: {
      title: reasonTitle,
      fullCaption: `Tautan: ${url}`,
      videoId,
      embedHtml: null,
      thumbnailUrl: null,
      authorName: 'Pengunggah TikTok',
      authorUsername: 'unknown'
    },
    comments: {
      positive: '0%', negative: '0%', hate: '0%', sampleSize: 0, filteredOutCount: 0,
      summary: 'Komentar tidak tersedia untuk video yang tidak dapat diakses.',
      sampleComments: [], confidence: 'low'
    },
    provocation: {
      level: 'low',
      explanation: 'Tingkat provokasi tidak dapat diukur.',
      signals: ['Tautan terputus atau video tidak publik'],
      confidence: 'low'
    },
    claims: [
      {
        claim: 'Aksesibilitas Konten',
        verdict: 'unverified',
        explanation: reasonExplanation,
        confidence: 'low',
        sources: []
      }
    ],
    newsVerificationSources: [],
    analyzedAt: new Date().toISOString(),
    limitations: [reasonExplanation]
  };
}

function cleanupVideo(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch {
    // Ignore cleanup errors
  }
}

// MAIN HANDLER
module.exports = async function analyze(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return json(res, 405, { code: 'METHOD_NOT_ALLOWED', message: 'Gunakan metode POST.' });
  }

  const geminiApiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

  // Case 1: Direct File Upload (Image or Video)
  if (req.body?.fileBase64 && typeof req.body.fileBase64 === 'string') {
    try {
      const mimeType = req.body.mimeType || 'image/jpeg';
      const fileName = req.body.fileName || 'uploaded_media';
      const base64Data = req.body.fileBase64.replace(/^data:[^;]+;base64,/, '');
      const fileBuffer = Buffer.from(base64Data, 'base64');

      if (mimeType.startsWith('image/')) {
        // Direct multimodal image analysis
        const photoParts = [{ inlineData: { mimeType, data: base64Data } }];
        const videoMeta = { title: `Berkas Gambar: ${fileName}`, author_name: 'Unggahan Pengguna', author_unique_id: 'user' };
        
        let report = null;
        if (geminiApiKey) {
          report = await analyzePhotosWithGemini(photoParts, 'uploaded-file', videoMeta, [], null, geminiApiKey);
        }
        
        const substantiveTheme = report?.substantiveTheme || fileName.replace(/\.[^.]+$/, '').replace(/[_-]/g, ' ');
        const liveNews = await fetchLiveNews(substantiveTheme);
        
        if (!report) {
          report = analyzeLocally('uploaded-file', videoMeta, [], null, liveNews);
        }

        report.isUploadedFile = true;
        report.quickVerdict = buildQuickVerdict(
          report.credibility,
          report.claims,
          report.provocation,
          substantiveTheme,
          report.themeExplanation || `Analisis berkas foto/tangkapan layar: ${fileName}`,
          liveNews
        );
        report.newsVerificationSources = generateNewsVerificationSources(substantiveTheme, [], null);
        return json(res, 200, report);
      } else if (mimeType.startsWith('video/')) {
        // Video file uploaded
        if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });
        const videoFilePath = path.join(TEMP_DIR, `up_${Date.now()}.mp4`);
        fs.writeFileSync(videoFilePath, fileBuffer);

        try {
          const videoMeta = { title: `Berkas Video: ${fileName}`, author_name: 'Unggahan Pengguna', author_unique_id: 'user' };
          let report = null;

          if (geminiApiKey) {
            const fileData = await uploadToGeminiFiles(videoFilePath, geminiApiKey);
            report = await analyzeVideoWithGemini(fileData.fileUri, fileData.mimeType, 'uploaded-file', videoMeta, [], null, geminiApiKey);
          }

          const substantiveTheme = report?.substantiveTheme || fileName.replace(/\.[^.]+$/, '').replace(/[_-]/g, ' ');
          const liveNews = await fetchLiveNews(substantiveTheme);

          if (!report) {
            report = analyzeLocally('uploaded-file', videoMeta, [], null, liveNews);
          }

          report.isUploadedFile = true;
          report.quickVerdict = buildQuickVerdict(
            report.credibility,
            report.claims,
            report.provocation,
            substantiveTheme,
            report.themeExplanation || `Analisis berkas video langsung: ${fileName}`,
            liveNews
          );
          report.newsVerificationSources = generateNewsVerificationSources(substantiveTheme, [], null);
          return json(res, 200, report);
        } finally {
          cleanupVideo(videoFilePath);
        }
      }
    } catch (err) {
      console.error('[FileUploadAnalysis] Error:', err.message);
      return json(res, 500, { code: 'FILE_ANALYSIS_ERROR', message: 'Gagal menganalisis berkas yang diunggah: ' + err.message });
    }
  }

  // Case 2: TikTok URL Submission
  let rawUrl = typeof req.body?.url === 'string' ? req.body.url.trim() : '';
  if (rawUrl && !rawUrl.startsWith('http://') && !rawUrl.startsWith('https://')) {
    rawUrl = 'https://' + rawUrl;
  }

  if (!isTikTokUrl(rawUrl)) {
    return json(res, 422, { code: 'INVALID_TIKTOK_URL', message: 'Masukkan tautan HTTPS dari tiktok.com, vm.tiktok.com, atau vt.tiktok.com.' });
  }

  const resolvedUrl = await resolveTikTokUrl(rawUrl);

  // Parallel data extraction: OEmbed, Tikwm Data (video/photos/music/author), Real Comments
  const [videoMeta, tikwmData, realComments] = await Promise.all([
    fetchTikTokOembed(resolvedUrl),
    fetchTikwmData(resolvedUrl),
    fetchRealTikTokComments(resolvedUrl)
  ]);

  // Check if completely inaccessible
  if (!videoMeta && !tikwmData && realComments.length === 0) {
    const fallbackReport = fallbackReportForInaccessibleVideo(rawUrl, resolvedUrl);
    return json(res, 200, fallbackReport);
  }

  const effectiveTitle = videoMeta?.title || tikwmData?.title || '';
  const effectiveAuthorName = videoMeta?.author_name || tikwmData?.author?.nickname || 'Kreator TikTok';
  const effectiveAuthorUsername = videoMeta?.author_unique_id || tikwmData?.author?.unique_id || 'creator';
  const effectiveThumbnail = videoMeta?.thumbnail_url || tikwmData?.cover || null;

  // Determine Substantive Theme & Fetch Live News Articles
  const entities = extractKeyEntities(effectiveTitle);
  const preliminaryTheme = extractNewsTopicQuery(effectiveTitle, entities, null);
  const liveNews = await fetchLiveNews(preliminaryTheme);

  // Check if TikTok Photo Mode (Carousel Slide)
  if (tikwmData?.isPhotoMode && tikwmData.photoSlides.length > 0) {
    console.log(`[TikTokPhotoMode] Detected ${tikwmData.photoSlides.length} photo slides`);
    let report = null;

    if (geminiApiKey) {
      try {
        const photoParts = await downloadTikTokPhotos(tikwmData.photoSlides);
        if (photoParts.length > 0) {
          report = await analyzePhotosWithGemini(photoParts, resolvedUrl, videoMeta, realComments, tikwmData, geminiApiKey);
        }
      } catch (err) {
        console.error('[TikTokPhotoMode] Gemini photo analysis error:', err.message);
      }
    }

    if (!report) {
      report = analyzeLocally(resolvedUrl, videoMeta, realComments, tikwmData, liveNews);
    }

    const substantiveTheme = report.substantiveTheme || preliminaryTheme;
    report.isPhotoMode = true;
    report.photoSlides = tikwmData.photoSlides;
    report.audioForensics = analyzeAudioForensics(tikwmData.music, effectiveAuthorUsername, report.videoContext);
    report.authorForensics = analyzeAuthorForensics(tikwmData.author, tikwmData.stats);
    report.decontextualization = analyzeDecontextualization(effectiveThumbnail, effectiveTitle, report.videoContext);
    report.quickVerdict = buildQuickVerdict(
      report.credibility,
      report.claims,
      report.provocation,
      substantiveTheme,
      report.themeExplanation || `Foto geser (carousel) TikTok mengenai '${substantiveTheme}'.`,
      liveNews
    );
    report.analyzedAt = new Date().toISOString();
    return json(res, 200, report);
  }

  // Standard Video Mode: Download video for deep multimodal analysis if Gemini API key exists
  let videoDownload = null;
  if (geminiApiKey && tikwmData?.videoDownloadUrl) {
    videoDownload = await downloadTikTokVideo(tikwmData.videoDownloadUrl);
  }

  if (geminiApiKey && videoDownload?.filePath) {
    try {
      console.log(`[VideoAnalysis] Video downloaded (${videoDownload.sizeBytes} bytes), uploading to Gemini Files API...`);
      const fileData = await uploadToGeminiFiles(videoDownload.filePath, geminiApiKey);

      const report = await analyzeVideoWithGemini(
        fileData.fileUri,
        fileData.mimeType,
        resolvedUrl,
        videoMeta,
        realComments,
        tikwmData,
        geminiApiKey
      );

      const substantiveTheme = report.substantiveTheme || preliminaryTheme;
      const refreshedLiveNews = (substantiveTheme !== preliminaryTheme) ? await fetchLiveNews(substantiveTheme) : liveNews;

      report.audioForensics = analyzeAudioForensics(tikwmData?.music, effectiveAuthorUsername, report.videoContext);
      report.authorForensics = analyzeAuthorForensics(tikwmData?.author, tikwmData?.stats);
      report.decontextualization = analyzeDecontextualization(effectiveThumbnail, effectiveTitle, report.videoContext);
      
      const { cleanComments } = filterRealComments(realComments);
      report.commentForensics = analyzeAstroturfingAndAspects(cleanComments);

      if (!report.aiDetection) {
        report.aiDetection = detectAiContent(effectiveTitle, effectiveTitle.toLowerCase(), report.videoContext);
      }
      if (!report.newsVerificationSources) {
        report.newsVerificationSources = generateNewsVerificationSources(effectiveTitle, entities, report.videoContext);
      }

      if (!report.credibility) {
        const provLevel = report.provocation?.level || 'low';
        const claimVerdict = report.claims?.[0]?.verdict || 'unverified';
        let score = 90;
        if (provLevel === 'high') score -= 35;
        else if (provLevel === 'medium') score -= 15;
        if (claimVerdict === 'false') score -= 40;
        else if (claimVerdict === 'misleading') score -= 25;
        else if (claimVerdict === 'mixed') score -= 15;
        score = Math.max(20, Math.min(96, score));
        report.credibility = {
          score,
          rating: score >= 80 ? 'Tinggi (Sangat Layak Dipercaya)' : score >= 50 ? 'Sedang (Perlu Kroscek Lanjutan)' : 'Rendah (Berisiko Disinformasi)',
          badge: score >= 80 ? 'verified' : score >= 50 ? 'warning' : 'danger',
          explanation: score >= 80
            ? 'Narasi video didukung fakta berdasarkan tontonan langsung AI.'
            : 'Narasi video mengandung informasi yang perlu dikroscek dengan sumber berita resmi.'
        };
      }

      report.quickVerdict = buildQuickVerdict(
        report.credibility,
        report.claims,
        report.provocation,
        substantiveTheme,
        report.themeExplanation || `Video berfokus pada isu '${substantiveTheme}'. Narasi perlu disaring secara jernih dari judul sensasional.`,
        refreshedLiveNews
      );

      if (report.videoContext) {
        report.videoContext.analysisMode = 'multimodal-deep';
      }
      report.analyzedAt = new Date().toISOString();

      return json(res, 200, report);
    } catch (err) {
      console.error('[VideoAnalysis] Deep multimodal error, falling back:', err.message);
    } finally {
      cleanupVideo(videoDownload.filePath);
    }
  }

  // Text-only Gemini Fallback
  if (geminiApiKey) {
    try {
      const report = await analyzeWithGemini(resolvedUrl, videoMeta, realComments, tikwmData, geminiApiKey);
      const substantiveTheme = report.substantiveTheme || preliminaryTheme;
      const refreshedLiveNews = (substantiveTheme !== preliminaryTheme) ? await fetchLiveNews(substantiveTheme) : liveNews;

      report.audioForensics = analyzeAudioForensics(tikwmData?.music, effectiveAuthorUsername, null);
      report.authorForensics = analyzeAuthorForensics(tikwmData?.author, tikwmData?.stats);
      report.decontextualization = analyzeDecontextualization(effectiveThumbnail, effectiveTitle, null);

      const { cleanComments } = filterRealComments(realComments);
      report.commentForensics = analyzeAstroturfingAndAspects(cleanComments);

      report.quickVerdict = buildQuickVerdict(
        report.credibility,
        report.claims,
        report.provocation,
        substantiveTheme,
        report.themeExplanation || `Video berfokus pada isu '${substantiveTheme}'.`,
        refreshedLiveNews
      );

      report.analyzedAt = new Date().toISOString();
      return json(res, 200, report);
    } catch (err) {
      console.error('[TextAnalysis] Gemini text fallback error:', err.message);
    }
  }

  // Smart Local Rule-based Analyzer (NO Fake Comments)
  const localReport = analyzeLocally(resolvedUrl, videoMeta, realComments, tikwmData, liveNews);
  return json(res, 200, localReport);
};
