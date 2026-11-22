import { DEFAULT_WP_URL } from './localwp.mjs';

export function createWpClient({ baseUrl = DEFAULT_WP_URL, token = '' } = {}) {
  const root = baseUrl.replace(/\/+$/, '');

  function buildUrl(route, { useRestRoute = false, query = null } = {}) {
    const cleanRoute = route.startsWith('/') ? route : `/${route}`;
    const q = new URLSearchParams();
    if (query && typeof query === 'object') {
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined && v !== null && v !== '') {
          q.set(k, String(v));
        }
      }
    }
    if (useRestRoute) {
      q.set('rest_route', `/f2e-bridge/v1${cleanRoute}`);
      return `${root}/index.php?${q.toString()}`;
    }
    const qs = q.toString();
    return `${root}/wp-json/f2e-bridge/v1${cleanRoute}${qs ? `?${qs}` : ''}`;
  }

  async function requestJson(url, { method = 'GET', body = null, auth = true, headers = {} } = {}) {
    const reqHeaders = {
      ...headers,
    };
    if (body !== null && !reqHeaders['Content-Type']) {
      reqHeaders['Content-Type'] = 'application/json';
    }
    if (auth === true && token) {
      reqHeaders.Authorization = `Bearer ${token}`;
    } else if (typeof auth === 'string' && auth !== '') {
      reqHeaders.Authorization = auth.startsWith('Bearer ') ? auth : `Bearer ${auth}`;
    }

    const res = await fetch(url, {
      method,
      headers: reqHeaders,
      body: body !== null ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
    });
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    return {
      status: res.status,
      ok: res.ok,
      headers: res.headers,
      text,
      json,
      url,
    };
  }

  return {
    baseUrl: root,
    buildUrl,

    async status({ search = '', auth = true, headers = {}, useRestRoute = false } = {}) {
      const url = buildUrl('/status', { useRestRoute, query: search ? { search } : null });
      return requestJson(url, { method: 'GET', auth, headers });
    },

    async statusViaRestRoute(opts = {}) {
      return this.status({ ...opts, useRestRoute: true });
    },

    async optionsPreflight(route = '/status', { origin = 'null', requestMethod = 'POST', requestHeaders = 'Authorization, Content-Type', useRestRoute = false } = {}) {
      const url = buildUrl(route, { useRestRoute });
      const res = await fetch(url, {
        method: 'OPTIONS',
        headers: {
          Origin: origin,
          'Access-Control-Request-Method': requestMethod,
          'Access-Control-Request-Headers': requestHeaders,
        },
      });
      const text = await res.text();
      return {
        status: res.status,
        headers: res.headers,
        text,
        url,
      };
    },

    async uploadAsset(payload, { auth = true, useRestRoute = false } = {}) {
      const url = buildUrl('/assets', { useRestRoute });
      return requestJson(url, { method: 'POST', body: payload, auth });
    },

    async uploadAssetsBatch(payload, { auth = true, useRestRoute = false } = {}) {
      const url = buildUrl('/assets/batch', { useRestRoute });
      return requestJson(url, { method: 'POST', body: payload, auth });
    },

    async syncDesignSystem(payload, { auth = true, useRestRoute = false } = {}) {
      const url = buildUrl('/design-system', { useRestRoute });
      return requestJson(url, { method: 'POST', body: payload, auth });
    },

    async importDocument(payload, { auth = true, useRestRoute = false } = {}) {
      const url = buildUrl('/import', { useRestRoute });
      return requestJson(url, { method: 'POST', body: payload, auth });
    },

    async getWpMedia(id, { auth = true } = {}) {
      const url = `${root}/wp-json/wp/v2/media/${id}`;
      return requestJson(url, { method: 'GET', auth });
    },

    async getFrontendPost(postId) {
      const url = `${root}/?p=${postId}`;
      const res = await fetch(url, { method: 'GET', redirect: 'follow' });
      const text = await res.text();
      return {
        status: res.status,
        ok: res.ok,
        headers: res.headers,
        text,
        url,
      };
    },

    async fetchUrl(targetUrl, init = {}) {
      const res = await fetch(targetUrl, init);
      const buf = Buffer.from(await res.arrayBuffer());
      return {
        status: res.status,
        ok: res.ok,
        headers: res.headers,
        buffer: buf,
        text: buf.toString('utf8'),
        url: targetUrl,
      };
    },

    toTargetOriginUrl(rawUrl) {
      try {
        const target = new URL(root);
        const parsed = new URL(rawUrl);
        if (parsed.hostname === target.hostname) {
          parsed.protocol = target.protocol;
          parsed.port = target.port;
          return parsed.toString();
        }
      } catch {
        // ignore
      }
      return rawUrl;
    },
  };
}
