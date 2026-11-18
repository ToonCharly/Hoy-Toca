// En GitHub Pages la API vive en Render; en local, la sirve el mismo origen.
globalThis.APP_CONFIG = {
  API: location.hostname.endsWith('.github.io')
    ? 'https://hoy-toca-tooncharly-api.onrender.com/api'
    : './api'
};
