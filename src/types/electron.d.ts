interface ElectronAPI {
  getServerStatus: () => Promise<{ running: boolean; port: number }>;
  getLogs: () => Promise<string[]>;
  getResolutionHistory: () => Promise<Array<{
    timestamp: number;
    filesRequested: number;
    filesResolved: number;
    status: string;
  }>>;
}

interface Window {
  electronAPI?: ElectronAPI;
}
