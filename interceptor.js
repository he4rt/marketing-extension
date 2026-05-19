const GRAPHQL_PATH = '/i/api/graphql/';

function extractEndpointName(url) {
  const idx = url.indexOf(GRAPHQL_PATH);
  if (idx === -1) return null;
  const after = url.substring(idx + GRAPHQL_PATH.length);
  const parts = after.split('/');
  if (parts.length < 2) return null;
  const endpointWithParams = parts[1];
  return endpointWithParams.split('?')[0];
}

const originalFetch = window.fetch;
window.fetch = function(...args) {
  const [resource] = args;
  const url = typeof resource === 'string' ? resource : resource?.url || '';
  const endpoint = extractEndpointName(url);

  if (endpoint) {
    return originalFetch.apply(this, args).then(async (response) => {
      try {
        const clone = response.clone();
        const data = await clone.json();
        window.postMessage({
          type: 'X_GRAPHQL_RESPONSE',
          endpoint,
          url,
          payload: data
        }, '*');
      } catch (e) {}
      return response;
    });
  }

  return originalFetch.apply(this, args);
};

const originalXHROpen = XMLHttpRequest.prototype.open;
const originalXHRSend = XMLHttpRequest.prototype.send;

XMLHttpRequest.prototype.open = function(method, url, ...rest) {
  this._url = url;
  this._endpoint = extractEndpointName(url);
  return originalXHROpen.call(this, method, url, ...rest);
};

XMLHttpRequest.prototype.send = function(...args) {
  if (this._endpoint) {
    const endpoint = this._endpoint;
    const url = this._url;
    this.addEventListener('load', function() {
      try {
        const data = JSON.parse(this.responseText);
        window.postMessage({
          type: 'X_GRAPHQL_RESPONSE',
          endpoint,
          url,
          payload: data
        }, '*');
      } catch (e) {}
    });
  }
  return originalXHRSend.apply(this, args);
};
