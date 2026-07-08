async function apiRequest(url, options = {}) {
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    },
    ...options
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error((data && data.message) || '请求失败');
  }

  return data;
}

function postJson(url, body) {
  return apiRequest(url, {
    method: 'POST',
    body: JSON.stringify(body)
  });
}

function putJson(url, body) {
  return apiRequest(url, {
    method: 'PUT',
    body: JSON.stringify(body)
  });
}
