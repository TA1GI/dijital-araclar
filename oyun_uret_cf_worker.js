export default {
  async fetch(request, env) {
    // Sadece POST isteklerine izin ver ve CORS ayarlarını yap
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        }
      });
    }

    if (request.method !== "POST") {
      return new Response("Sadece POST desteklenir", { status: 405 });
    }

    // Cloudflare paneline gireceğiniz gizli API anahtarı
    const apiKey = env.GEMINI_API_KEY; 
    const modelName = 'gemini-3.0-flash'; // Kullanıcının tercihi olan, hızlı ve bedava limiti yuksek surum
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

    try {
      // Frontend'den (oyun_uret.html) gelen JSON paketini (prompt'ları) al
      const payload = await request.text();

      // Yapay Zekaya (Google Gemini) gizlice gönder
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload
      });

      const data = await response.text();

      // Gemini'den gelen sonucu GitHub Pages'teki sitemize geri gönder
      return new Response(data, {
        status: response.status,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Content-Type": "application/json"
        }
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Content-Type": "application/json"
        }
      });
    }
  }
};
