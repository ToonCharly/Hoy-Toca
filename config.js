// GitHub Pages sirve solo la PWA; para sincronización y push configura aquí la URL del backend.
// En local, el backend se sirve en el mismo origen.
globalThis.APP_CONFIG = {
  API: location.hostname.endsWith('.github.io') ? null : './api'
};
