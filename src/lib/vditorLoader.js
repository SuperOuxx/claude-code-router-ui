let loadPromise = null;

const VDITOR_CSS_URL = 'https://unpkg.com/vditor/dist/index.css';
const VDITOR_JS_URL = 'https://unpkg.com/vditor/dist/index.min.js';

function ensureStylesheet() {
  if (document.querySelector('link[data-vditor-css="true"]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = VDITOR_CSS_URL;
  link.dataset.vditorCss = 'true';
  document.head.appendChild(link);
}

function ensureScript() {
  if (document.querySelector('script[data-vditor-js="true"]')) return;
  const script = document.createElement('script');
  script.src = VDITOR_JS_URL;
  script.async = true;
  script.dataset.vditorJs = 'true';
  document.head.appendChild(script);
}

export function loadVditor() {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Vditor can only be loaded in the browser.'));
  }

  if (window.Vditor) return Promise.resolve(window.Vditor);
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    try {
      ensureStylesheet();
      ensureScript();

      const script = document.querySelector('script[data-vditor-js="true"]');
      if (!script) {
        reject(new Error('Failed to inject Vditor script tag.'));
        return;
      }

      script.addEventListener('load', () => {
        if (window.Vditor) resolve(window.Vditor);
        else reject(new Error('Vditor loaded but window.Vditor is missing.'));
      }, { once: true });

      script.addEventListener('error', () => {
        reject(new Error(`Failed to load Vditor script: ${VDITOR_JS_URL}`));
      }, { once: true });
    } catch (err) {
      reject(err);
    }
  });

  return loadPromise;
}
