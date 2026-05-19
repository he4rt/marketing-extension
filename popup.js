const handleInput = document.getElementById('handleInput');
const setHandleBtn = document.getElementById('setHandleBtn');
const tweetCountEl = document.getElementById('tweetCount');
const replyCountEl = document.getElementById('replyCount');
const exportBtn = document.getElementById('exportBtn');
const clearBtn = document.getElementById('clearBtn');
const emptyTweets = document.getElementById('emptyTweets');
const tweetList = document.getElementById('tweetList');
const endpointCountEl = document.getElementById('endpointCount');
const copyAllBtn = document.getElementById('copyAllBtn');
const emptyEndpoints = document.getElementById('emptyEndpoints');
const endpointList = document.getElementById('endpointList');

document.addEventListener('DOMContentLoaded', () => {
  chrome.runtime.sendMessage({ action: 'GET_HANDLE' }, (r) => {
    if (r?.handle) handleInput.value = r.handle;
  });
  loadTweets();
  loadEndpoints();

  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
      document.getElementById('tab-' + tab.dataset.tab).classList.remove('hidden');
    });
  });

  setHandleBtn.addEventListener('click', setHandle);
  handleInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') setHandle(); });
  exportBtn.addEventListener('click', handleExport);
  clearBtn.addEventListener('click', handleClear);
  copyAllBtn.addEventListener('click', handleCopyAll);
});

function setHandle() {
  const handle = handleInput.value.trim().replace(/^@/, '');
  if (!handle) return;
  handleInput.value = handle;
  chrome.runtime.sendMessage({ action: 'SET_HANDLE', handle }, () => {
    loadTweets();
  });
}

function loadTweets() {
  chrome.runtime.sendMessage({ action: 'GET_TWEETS' }, (r) => {
    if (!r) return;
    renderTweets(r.tweets || [], r.replyCount || 0);
  });
}

function renderTweets(tweets, replyCount) {
  tweetCountEl.textContent = `${tweets.length} tweet${tweets.length !== 1 ? 's' : ''}`;
  replyCountEl.textContent = `${replyCount} community replies`;
  const hasData = tweets.length > 0;
  exportBtn.disabled = !hasData;
  clearBtn.disabled = !hasData;

  if (!hasData) {
    emptyTweets.classList.remove('hidden');
    tweetList.classList.add('hidden');
    return;
  }

  emptyTweets.classList.add('hidden');
  tweetList.classList.remove('hidden');
  tweetList.innerHTML = '';

  for (const t of tweets) {
    const card = document.createElement('div');
    card.className = 'tweet-card';

    const typeClass = `tweet-type-${t.type}`;
    const date = t.created_at ? formatDate(t.created_at) : '';
    const text = t.type === 'retweet' ? `RT: ${t.retweeted_tweet?.text || t.text}` : t.text;
    const m = t.metrics;

    card.innerHTML = `
      <div class="tweet-top">
        <span class="tweet-type ${typeClass}">${t.type}</span>
        <span class="tweet-date">${date}</span>
      </div>
      <div class="tweet-text">${escapeHtml(text)}</div>
      <div class="tweet-metrics">
        <span><strong${m.favorite_count > 10 ? ' class="metric-highlight"' : ''}>${fmt(m.favorite_count)}</strong> likes</span>
        <span><strong>${fmt(m.retweet_count)}</strong> RTs</span>
        <span><strong>${fmt(m.reply_count)}</strong> replies</span>
        <span><strong>${fmt(m.view_count)}</strong> views</span>
      </div>
    `;

    card.addEventListener('click', () => {
      const author = t.author.screen_name;
      chrome.tabs.create({ url: `https://x.com/${author}/status/${t.tweet_id}` });
    });

    tweetList.appendChild(card);
  }
}

function handleExport() {
  chrome.runtime.sendMessage({ action: 'GET_EXPORT' }, (data) => {
    if (!data) return;
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const handle = data.tracked_account?.screen_name || 'export';
    a.href = url;
    a.download = `x-${handle}-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });
}

function handleClear() {
  chrome.runtime.sendMessage({ action: 'CLEAR_ALL' }, () => {
    loadTweets();
    loadEndpoints();
  });
}

function loadEndpoints() {
  chrome.runtime.sendMessage({ action: 'GET_ENDPOINTS' }, (r) => {
    if (!r) return;
    renderEndpoints(r.endpoints || {});
  });
}

function renderEndpoints(endpoints) {
  const names = Object.keys(endpoints);
  endpointCountEl.textContent = `${names.length} endpoint${names.length !== 1 ? 's' : ''}`;
  copyAllBtn.disabled = names.length === 0;

  if (!names.length) {
    emptyEndpoints.classList.remove('hidden');
    endpointList.classList.add('hidden');
    return;
  }

  emptyEndpoints.classList.add('hidden');
  endpointList.classList.remove('hidden');
  endpointList.innerHTML = '';

  for (const name of names.sort((a, b) => endpoints[b].count - endpoints[a].count)) {
    const ep = endpoints[name];
    const card = document.createElement('div');
    card.className = 'endpoint-card';
    card.innerHTML = `
      <div class="endpoint-info">
        <div class="endpoint-name">${escapeHtml(name)}</div>
        <div class="endpoint-meta">${ep.lastSeen ? new Date(ep.lastSeen).toLocaleTimeString() : ''}</div>
      </div>
      <span class="endpoint-count">${ep.count}</span>
      <button class="endpoint-copy" data-ep="${escapeHtml(name)}">Copy</button>
    `;
    card.querySelector('.endpoint-copy').addEventListener('click', (e) => {
      e.stopPropagation();
      copyEndpoint(name, e.target);
    });
    endpointList.appendChild(card);
  }
}

function copyEndpoint(name, btn) {
  chrome.runtime.sendMessage({ action: 'GET_ENDPOINT_PAYLOADS', endpoint: name }, (r) => {
    if (!r?.payloads?.length) return;
    navigator.clipboard.writeText(JSON.stringify(r.payloads, null, 2)).then(() => {
      const orig = btn.textContent;
      btn.textContent = 'OK!';
      setTimeout(() => { btn.textContent = orig; }, 1200);
    });
  });
}

function handleCopyAll() {
  chrome.runtime.sendMessage({ action: 'GET_ALL_RAW' }, (r) => {
    if (!r?.endpoints) return;
    navigator.clipboard.writeText(JSON.stringify(r.endpoints, null, 2)).then(() => {
      const orig = copyAllBtn.textContent;
      copyAllBtn.textContent = 'OK!';
      setTimeout(() => { copyAllBtn.textContent = orig; }, 1200);
    });
  });
}

function formatDate(str) {
  try {
    const d = new Date(str);
    const day = d.getDate().toString().padStart(2, '0');
    const mon = (d.getMonth() + 1).toString().padStart(2, '0');
    const h = d.getHours().toString().padStart(2, '0');
    const m = d.getMinutes().toString().padStart(2, '0');
    return `${day}/${mon} ${h}:${m}`;
  } catch { return str; }
}

function fmt(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}
