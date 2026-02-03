export type BackendEnv = 'local' | 'prod';

const ENV_KEY = 'groupguard_env';
const LOCAL_URL = import.meta.env.VITE_LOCAL_API_URL || 'http://localhost:3001/api/v1';
// Public Production Endpoint (GCP)
const PROD_URL = import.meta.env.VITE_PROD_API_URL || 'http://35.212.148.66/api/v1';

export const getBackendEnv = (): BackendEnv => {
  return (localStorage.getItem(ENV_KEY) as BackendEnv) || 'local';
};

export const setBackendEnv = (env: BackendEnv) => {
  localStorage.setItem(ENV_KEY, env);
  // Force reload to apply changes globally if needed, or rely on React state
  window.location.reload();
};

export const getBackendUrl = (): string => {
  const env = getBackendEnv();
  return env === 'prod' ? PROD_URL : LOCAL_URL;
};
