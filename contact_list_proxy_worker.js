export default {
  async fetch(request) {
    // 1. CORS Ön İsteğine (Preflight) Yanıt Ver
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    // 2. İstek yapılan URL'yi al
    const url = new URL(request.url);
    const targetUrl = url.searchParams.get("url");

    // Eğer parametre olarak hedef site girilmemişse uyar
    if (!targetUrl) {
      return new Response("Lutfen '?url=Hedef_Site' seklinde bir parametre girin.", { status: 400 });
    }

    try {
      // 3. Hedef siteye (radioid.net) Cloudflare üzerinden isteği yap
      const response = await fetch(targetUrl, {
        method: request.method,
        headers: request.headers
      });

      // 4. Hedef siteden gelen cevaba CORS başlıklarını ekle (Tarayıcı engellemesin diye)
      const responseHeaders = new Headers(response.headers);
      responseHeaders.set('Access-Control-Allow-Origin', '*');

      // 5. Cevabı kullanıcıya geri döndür
      return new Response(response.body, {
        status: response.status,
        headers: responseHeaders
      });
      
    } catch (e) {
      return new Response("CORS Proxy Hatasi: " + e.message, { status: 500 });
    }
  }
};
