export default function Settings() {
  return (
    <div className="p-6">
      <h2 className="text-xl font-bold mb-4">Settings</h2>
      <div className="space-y-4">
        <div className="bg-gray-900 rounded-lg border border-gray-800 p-4">
          <label className="block text-sm text-gray-400 mb-1">HTTP Port</label>
          <input
            type="number"
            defaultValue={7771}
            disabled
            className="bg-gray-800 text-white border border-gray-700 rounded px-3 py-1.5 text-sm"
          />
          <p className="text-xs text-gray-500 mt-1">Restart required to change port.</p>
        </div>
      </div>
    </div>
  );
}
