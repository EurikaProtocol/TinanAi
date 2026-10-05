export default function Privacy() {
  return (
    <div className="max-w-3xl space-y-3 text-slate-300 text-sm">
      <h1 className="text-3xl font-bold text-slate-100">Privacy</h1>
      <p>Draft and project records are stored in your browser (localStorage/sessionStorage). Files hashed on the Verify page never leave your device.</p>
      <p>If an AI API is configured, the text you type for analysis is sent to it. Do not enter secrets, keys or seed phrases anywhere.</p>
      <p>Blockchain transactions are public. This is a template notice; have it reviewed by counsel.</p>
    </div>
  );
}
