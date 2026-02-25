import { useEffect, useState } from 'react';

interface ServerStatus {
  running: boolean;
  port: number;
}

export default function Dashboard() {
  const [status, setStatus] = useState<ServerStatus | null>(null);

  useEffect(() => {
    window.electronAPI?.getServerStatus().then(setStatus);
  }, []);

  return (
    <div className="p-6">
      <h2 className="text-xl font-bold mb-4">Dashboard</h2>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-gray-900 rounded-lg p-4 border border-gray-800">
          <p className="text-sm text-gray-400">Server Status</p>
          <p className="text-lg font-semibold mt-1">
            {status?.running ? (
              <span className="text-green-400">Running</span>
            ) : (
              <span className="text-red-400">Stopped</span>
            )}
          </p>
        </div>

        <div className="bg-gray-900 rounded-lg p-4 border border-gray-800">
          <p className="text-sm text-gray-400">Port</p>
          <p className="text-lg font-semibold mt-1 text-white">{status?.port ?? '\u2014'}</p>
        </div>
      </div>
    </div>
  );
}
