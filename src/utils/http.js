const DEFAULT_HEADERS = {
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.8,*/*;q=0.7",
  "accept-language": "ro-RO,ro;q=0.9,en-US;q=0.7,en;q=0.6",
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36"
};

async function request(url, { headers = {}, method = "GET", body } = {}) {
  const response = await fetch(url, {
    method,
    headers: {
      ...DEFAULT_HEADERS,
      ...headers
    },
    body,
    redirect: "follow"
  });
  if (!response.ok) {
    throw new Error(`Client error '${response.status} ${response.statusText}' for url '${url}'`);
  }
  return response;
}

export async function getText(url, options = {}) {
  const response = await request(url, options);
  return response.text();
}

export async function getJson(url, options = {}) {
  const response = await request(url, {
    ...options,
    headers: {
      accept: "application/json",
      "x-requested-with": "XMLHttpRequest",
      ...(options.headers ?? {})
    }
  });
  return response.json();
}

export async function postJson(url, payload, options = {}) {
  const response = await request(url, {
    ...options,
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      ...(options.headers ?? {})
    },
    body: JSON.stringify(payload)
  });
  return response.json();
}

export { DEFAULT_HEADERS };
