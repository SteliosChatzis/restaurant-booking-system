const backendOrigin = "https://restaurant-booking-system-r4k3.onrender.com";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/")) {
      const targetUrl = new URL(url.pathname + url.search, backendOrigin);
      const headers = new Headers(request.headers);

      headers.set("X-Forwarded-Proto", "https");
      headers.set("X-Forwarded-Host", url.host);
      headers.delete("Host");

      return fetch(
        new Request(targetUrl, {
          method: request.method,
          headers,
          body: request.body,
          redirect: "manual",
        })
      );
    }

    if (url.pathname === "/sardeles-admin" || url.pathname === "/sardeles-admin/") {
      const assetUrl = new URL(request.url);
      assetUrl.pathname = "/index.html";
      assetUrl.search = "?admin";
      return env.ASSETS.fetch(new Request(assetUrl, request));
    }

    return env.ASSETS.fetch(request);
  },
};
