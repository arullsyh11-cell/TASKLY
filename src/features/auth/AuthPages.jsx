import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { TasklyLogo } from '../../components/brand/TasklyLogo.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Input } from '../../components/ui/Input.jsx';
import { useAuthStore } from '../../stores/useAuthStore.js';
import { repo } from '../../services/repositories/index.js';

function AuthShell({ title, subtitle, children }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--color-bg)] px-4 py-10 text-[var(--color-text-primary)]">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-start gap-3">
          <TasklyLogo variant="lockup" size="lg" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-text-primary)]">{title}</h1>
            <p className="mt-1 text-sm text-[var(--color-text-secondary)]">{subtitle}</p>
          </div>
        </div>

        <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
          {children}
        </div>
      </div>
    </div>
  );
}

export function LoginPage() {
  const user = useAuthStore((s) => s.user);
  const login = useAuthStore((s) => s.login);
  const navigate = useNavigate();
  const location = useLocation();
  const redirectTo = location.state?.from || '/dashboard';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (user) {
    return <Navigate to={redirectTo} replace />;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setErrorMsg('');
    if (!email.trim() || !password) {
      setErrorMsg('Email and password are required.');
      return;
    }
    setSubmitting(true);
    try {
      await login({ email: email.trim(), password });
      toast.success('Signed in to TASKLY workspace.');
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setErrorMsg(err.message || 'Sign in failed. Please check your credentials.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell title="Sign in to TASKLY" subtitle="Continue managing your tasks, sprints, and focus sessions.">
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {errorMsg && (
          <div role="alert" className="rounded-[var(--radius-sm)] border border-[var(--color-danger)]/40 bg-[var(--color-danger-bg)] px-3 py-2.5 text-xs font-medium text-[var(--color-danger)]">
            {errorMsg}
          </div>
        )}

        <Input
          label="Email"
          type="email"
          autoComplete="email"
          placeholder="email@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />

        <div className="relative">
          <Input
            label="Password"
            type={showPw ? 'text' : 'password'}
            autoComplete="current-password"
            placeholder="Minimum 8 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="pr-10"
            required
          />
          <button
            type="button"
            onClick={() => setShowPw((v) => !v)}
            aria-label={showPw ? 'Hide password' : 'Show password'}
            className="absolute right-2 top-[29px] inline-flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
          >
            {showPw ? <EyeOff className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" /> : <Eye className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />}
          </button>
        </div>

        <div className="flex justify-end">
          <Link to="/forgot-password" className="text-xs font-medium text-[var(--color-accent-text)] hover:underline">
            Forgot password?
          </Link>
        </div>

        <Button type="submit" isLoading={submitting} className="w-full">
          Sign In to Workspace
        </Button>

        <p className="pt-2 text-center text-xs text-[var(--color-text-secondary)]">
          Don&apos;t have an account?{' '}
          <Link to="/register" className="font-semibold text-[var(--color-accent-text)] hover:underline">
            Create New Account
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}

export function RegisterPage() {
  const user = useAuthStore((s) => s.user);
  const registerUser = useAuthStore((s) => s.register);
  const navigate = useNavigate();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [generalError, setGeneralError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const nextErrs = {};
    if (fullName.trim().length < 2) nextErrs.fullName = 'Full name must be at least 2 characters.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) nextErrs.email = 'Invalid email address.';
    if (password.length < 8) nextErrs.password = 'Password must be at least 8 characters.';
    setFieldErrors(nextErrs);
    setGeneralError('');
    if (Object.keys(nextErrs).length > 0) return;

    setSubmitting(true);
    try {
      await registerUser({ fullName: fullName.trim(), email: email.trim(), password });
      toast.success('Account created. Welcome to TASKLY.');
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setGeneralError(err.message || 'Failed to create account.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell title="Create TASKLY Account" subtitle="Set up your personal productivity workspace in seconds.">
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {generalError && (
          <div role="alert" className="rounded-[var(--radius-sm)] border border-[var(--color-danger)]/40 bg-[var(--color-danger-bg)] px-3 py-2.5 text-xs font-medium text-[var(--color-danger)]">
            {generalError}
          </div>
        )}

        <Input
          label="Full Name"
          type="text"
          autoComplete="name"
          placeholder="Your Name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          error={fieldErrors.fullName}
          required
        />

        <Input
          label="Email"
          type="email"
          autoComplete="email"
          placeholder="email@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={fieldErrors.email}
          required
        />

        <div className="relative">
          <Input
            label="Password"
            type={showPw ? 'text' : 'password'}
            autoComplete="new-password"
            placeholder="Minimum 8 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={fieldErrors.password}
            className="pr-10"
            required
          />
          <button
            type="button"
            onClick={() => setShowPw((v) => !v)}
            aria-label={showPw ? 'Hide password' : 'Show password'}
            className="absolute right-2 top-[29px] inline-flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
          >
            {showPw ? <EyeOff className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" /> : <Eye className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />}
          </button>
        </div>

        <Button type="submit" isLoading={submitting} className="w-full">
          Create Account
        </Button>

        <p className="pt-2 text-center text-xs text-[var(--color-text-secondary)]">
          Already have an account?{' '}
          <Link to="/login" className="font-semibold text-[var(--color-accent-text)] hover:underline">
            Sign In Here
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}

export function ForgotPasswordPage() {
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [localHintCode, setLocalHintCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleRequest(e) {
    e.preventDefault();
    setErr('');
    setMsg('');
    setLoading(true);
    try {
      const res = await repo.auth.forgotPassword(email.trim());
      setMsg(res.message);
      if (res.localResetCode) setLocalHintCode(res.localResetCode);
      setStep(2);
    } catch (error) {
      setErr(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleReset(e) {
    e.preventDefault();
    setErr('');
    setLoading(true);
    try {
      const res = await repo.auth.resetPassword({ email: email.trim(), code: code.trim(), newPassword });
      toast.success(res.message);
      navigate('/login');
    } catch (error) {
      setErr(error.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell title="Password Recovery" subtitle="Reset the password for your TASKLY account.">
      {err && (
        <div role="alert" className="mb-4 rounded-[var(--radius-sm)] border border-[var(--color-danger)]/40 bg-[var(--color-danger-bg)] px-3 py-2 text-xs text-[var(--color-danger)]">
          {err}
        </div>
      )}
      {msg && (
        <div className="mb-4 rounded-[var(--radius-sm)] border border-[var(--color-border-warm)] bg-[var(--color-surface-warm)] px-3 py-2 text-xs text-[var(--color-accent-text)]">
          <p>{msg}</p>
          {localHintCode && (
            <p className="mt-1 font-mono-num font-semibold">Local recovery code: {localHintCode}</p>
          )}
        </div>
      )}

      {step === 1 ? (
        <form onSubmit={handleRequest} className="space-y-4">
          <Input
            label="Registered Email"
            type="email"
            placeholder="email@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <Button type="submit" isLoading={loading} className="w-full">
            Send Recovery Code
          </Button>
        </form>
      ) : (
        <form onSubmit={handleReset} className="space-y-4">
          <Input
            label="Recovery Code"
            type="text"
            placeholder="6-digit code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            required
          />
          <Input
            label="New Password"
            type="password"
            placeholder="Minimum 8 characters"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
          />
          <Button type="submit" isLoading={loading} className="w-full">
            Save New Password
          </Button>
        </form>
      )}

      <p className="mt-4 text-center text-xs text-[var(--color-text-secondary)]">
        <Link to="/login" className="font-semibold text-[var(--color-accent-text)] hover:underline">
          Back to Sign In
        </Link>
      </p>
    </AuthShell>
  );
}
