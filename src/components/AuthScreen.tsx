import { useState } from 'react';
import { useAuthActions } from '@convex-dev/auth/react';
import { Loader2 } from 'lucide-react';
import { Button } from './Button';

export function AuthScreen() {
  const { signIn } = useAuthActions();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [flow, setFlow] = useState<'signIn' | 'signUp'>('signIn');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await signIn('password', { email, password, flow });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Sign in failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="h-full w-full bg-bg text-ink flex items-center justify-center p-6">
      <form onSubmit={submit} className="w-full max-w-sm bg-card border border-line rounded-2xl p-7 shadow-sm">
        <div className="mb-6">
          <div className="text-[11px] uppercase tracking-[0.18em] text-ink-6 font-semibold">Slidesmith</div>
          <h1 className="text-[22px] font-semibold mt-2">{flow === 'signIn' ? 'Sign in' : 'Create account'}</h1>
          <p className="text-[13px] text-ink-5 mt-1">This workspace is private. Use the account authorized by its owner.</p>
        </div>

        <label className="block text-[11px] text-ink-5 mb-1" htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="w-full h-10 bg-card border border-line rounded-lg px-3 text-[13px] outline-none focus:border-ink-7 focus:ring-2 focus:ring-ink/10"
        />

        <label className="block text-[11px] text-ink-5 mt-4 mb-1" htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="w-full h-10 bg-card border border-line rounded-lg px-3 text-[13px] outline-none focus:border-ink-7 focus:ring-2 focus:ring-ink/10"
        />

        {error && <p className="text-[12px] text-red-600 mt-3" role="alert">{error}</p>}

        <div className="mt-5">
          <Button
            type="submit"
            variant="primary"
            fullWidth
            disabled={submitting}
            icon={submitting ? <Loader2 size={13} className="animate-spin" /> : undefined}
          >
            {submitting ? 'Please wait…' : flow === 'signIn' ? 'Sign in' : 'Create account'}
          </Button>
          <button
            type="button"
            className="w-full mt-3 text-[12px] text-ink-5 hover:text-ink"
            onClick={() => { setError(null); setFlow((current) => current === 'signIn' ? 'signUp' : 'signIn'); }}
          >
            {flow === 'signIn' ? 'First time here? Create the allowed account' : 'Already registered? Sign in'}
          </button>
        </div>
      </form>
    </main>
  );
}
