import Conf from 'conf';
import fs from 'fs';
import path from 'path';

interface Config {
  apiKey?: string;
  baseUrl: string;
  activeBinId?: string;
  globalActiveBinId?: string;
  activeBinsByWorkspace?: Record<string, string>;
  recentBinsByWorkspace?: Record<string, string[]>;
  hasSeenFeedbackPrompt?: boolean;
}

const config = new Conf<Config>({
  projectName: 'curlme-cli',
  defaults: {
    baseUrl: 'https://curlme.io'
  }
});

// Helper to get the actual API URL, prioritising env var
export const getBaseUrl = () => {
  let url = process.env.CURLME_API_URL || config.get('baseUrl');
  if (url && !url.startsWith('http')) {
    url = `http://${url}`;
  }
  return url;
};

const getGitRoot = (startDir: string): string | null => {
  let current = path.resolve(startDir);
  while (true) {
    if (fs.existsSync(path.join(current, '.git'))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
};

export const getWorkspaceKey = () => {
  const gitRoot = getGitRoot(process.cwd());
  return gitRoot ?? path.resolve(process.cwd());
};

export const getActiveBin = (global = false) => {
  if (global) {
    return config.get('globalActiveBinId');
  }
  const workspace = getWorkspaceKey();
  const map = config.get('activeBinsByWorkspace') ?? {};
  return map[workspace] ?? config.get('activeBinId') ?? config.get('globalActiveBinId');
};

export const setActiveBin = (id: string, global = false) => {
  if (global) {
    config.set('globalActiveBinId', id);
    return;
  }
  const workspace = getWorkspaceKey();
  const map = config.get('activeBinsByWorkspace') ?? {};
  map[workspace] = id;
  config.set('activeBinsByWorkspace', map);
  config.set('activeBinId', id);
};

export const clearActiveBin = (global = false) => {
  if (global) {
    config.delete('globalActiveBinId');
    return;
  }
  const workspace = getWorkspaceKey();
  const map = config.get('activeBinsByWorkspace') ?? {};
  delete map[workspace];
  config.set('activeBinsByWorkspace', map);
  if (config.get('activeBinId')) {
    config.delete('activeBinId');
  }
};

export const getRecentBins = (global = false) => {
  if (global) {
    const globalActive = config.get('globalActiveBinId');
    return globalActive ? [globalActive] : [];
  }
  const workspace = getWorkspaceKey();
  const map = config.get('recentBinsByWorkspace') ?? {};
  return map[workspace] ?? [];
};

export const pushRecentBin = (id: string, global = false) => {
  if (global) return;
  const workspace = getWorkspaceKey();
  const map = config.get('recentBinsByWorkspace') ?? {};
  const current = map[workspace] ?? [];
  const next = [id, ...current.filter((value) => value !== id)].slice(0, 10);
  map[workspace] = next;
  config.set('recentBinsByWorkspace', map);
};

export default config;