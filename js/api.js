// js/api.js
import NProgress from 'nprogress';

export async function apiRequest(action, payload = null) {
  const url  = `api/api.php?action=${action}`;
  const opts = {
    method: payload ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json' },
    body:    payload ? JSON.stringify(payload) : undefined
  };

  NProgress.start();
  const res = await fetch(url, opts);
  NProgress.done();

  if (!res.ok) throw new Error(`API "${action}" a échoué (${res.status})`);
  const data = await res.json();
  return data;
}
