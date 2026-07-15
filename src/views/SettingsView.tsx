import { useEffect, useState } from 'react';
import { Check, X, Loader2, KeyRound, Trash2, Info, Images } from 'lucide-react';
import { useAction, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import type { AppConfig, Project, SocialAccount, ModelOption } from '../types';
import { ViewHeader } from '../components/ViewHeader';
import { Button } from '../components/Button';
import { PackPicker } from '../components/PackPicker';
import { uploadFile } from '../lib/api';
import { bundledImagePaths, bundledPacks } from '../lib/bundledLibrary';

interface SettingsViewProps {
  config: AppConfig;
  project: Project;
  accounts: SocialAccount[];
  canDelete: boolean;
  onSave: (patch: {
    model?: string;
    name?: string;
    defaults?: Project['defaults'];
    imagePacks?: string[];
  }) => Promise<void>;
  onDeleteProject: () => void;
  onReloadAccounts: () => void;
}

const POSTBRIDGE_URL = 'https://post-bridge.com?atp=clip-factory';

const PostBridgeLink = ({ children }: { children: React.ReactNode }) => (
  <a href={POSTBRIDGE_URL} target="_blank" rel="noreferrer" className="text-ink-4 underline hover:text-ink">
    {children}
  </a>
);

const inputClass =
  'w-full h-9 bg-card border border-line rounded-lg px-3 text-[13px] text-ink ' +
  'placeholder:text-ink-6 outline-none transition-colors ' +
  'focus:border-ink-7 focus:ring-2 focus:ring-ink/10';

export function SettingsView({
  config,
  project,
  accounts,
  canDelete,
  onSave,
  onDeleteProject,
  onReloadAccounts,
}: SettingsViewProps) {
  const listModels = useAction(api.openrouter.listModels);
  const testOpenrouter = useAction(api.openrouter.test);
  const testPostbridge = useAction(api.postbridge.test);
  const createImagePack = useMutation(api.imagePacks.create);
  const generateUploadUrl = useMutation(api.images.generateUploadUrl);
  const registerImage = useMutation(api.images.register);
  const [model, setModel] = useState(config.model);
  const [name, setName] = useState(project.name);
  const [mode, setMode] = useState(project.defaults.mode);
  const [selected, setSelected] = useState<number[]>(project.defaults.socialAccountIds);
  const [imagePacks, setImagePacks] = useState<string[]>(project.imagePacks);
  const [models, setModels] = useState<ModelOption[]>([]);
  const [modelFilter, setModelFilter] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [test, setTest] = useState<{ postbridge: boolean; openrouter: boolean; errors: Record<string, string> } | null>(null);
  const [libraryImport, setLibraryImport] = useState<{ done: number; total: number } | null>(null);

  useEffect(() => {
    listModels({ projectId: project.id }).then(setModels).catch(() => setModels([]));
  }, [listModels, project.id]);

  const save = async () => {
    setSaving(true);
    setSaved(false);
    setSaveError(null);
    try {
      await onSave({
        model,
        name,
        defaults: { socialAccountIds: selected, mode },
        imagePacks,
      });
      onReloadAccounts();
      setSaved(true);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const runTest = async () => {
    setTesting(true);
    setTest(null);
    try {
      await save();
      const errors: Record<string, string> = {};
      const [openrouterResult, postbridgeResult] = await Promise.all([
        testOpenrouter({ projectId: project.id }).then(() => true).catch((error) => {
          errors.openrouter = error instanceof Error ? error.message : String(error);
          return false;
        }),
        testPostbridge({ projectId: project.id }).then(() => true).catch((error) => {
          errors.postbridge = error instanceof Error ? error.message : String(error);
          return false;
        }),
      ]);
      setTest({ openrouter: openrouterResult, postbridge: postbridgeResult, errors });
      onReloadAccounts();
    } finally {
      setTesting(false);
    }
  };

  const toggleAccount = (id: number) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const importBundledLibrary = async () => {
    const total = bundledPacks.reduce((count, pack) => count + bundledImagePaths(pack).length, 0);
    setLibraryImport({ done: 0, total });
    setSaveError(null);
    let done = 0;
    try {
      for (const pack of bundledPacks) {
        const imagePackId = await createImagePack({
          name: pack.name,
          slug: pack.slug,
          description: pack.description,
          source: 'bundled',
        });
        for (const path of bundledImagePaths(pack)) {
          const response = await fetch(`/library/${path}`);
          if (!response.ok) throw new Error(`Could not load bundled image ${path}.`);
          const blob = await response.blob();
          const storageId = await uploadFile(blob, () => generateUploadUrl({}));
          await registerImage({
            storageId,
            imagePackId,
            kind: 'library',
            mimeType: blob.type || 'image/jpeg',
            originalName: path,
          });
          setLibraryImport({ done: ++done, total });
        }
      }
      setImagePacks(bundledPacks.map((pack) => pack.name));
      setSaved(true);
    } catch (cause) {
      setSaveError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLibraryImport(null);
    }
  };

  const filtered = modelFilter
    ? models.filter(
        (m) =>
          m.id.toLowerCase().includes(modelFilter.toLowerCase()) ||
          m.name.toLowerCase().includes(modelFilter.toLowerCase())
      )
    : models;

  return (
    <>
      <ViewHeader
        title="Settings"
        subtitle="Project defaults and secure integration status. Secrets stay in Convex environment variables."
      />

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto p-8 space-y-8">
          {/* Project */}
          <Section
            title="Project"
            description="A project is one brand/account. Its Brain and default posting accounts are separate — your API keys and model are shared across all projects."
          >
            <Field label="Project name">
              <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
            </Field>
            {canDelete && (
              <Button variant="danger-ghost" icon={<Trash2 size={13} />} onClick={onDeleteProject}>
                Delete this project
              </Button>
            )}
          </Section>

          {/* Integration secrets are deployment environment variables, never browser state. */}
          <Section
            title="Integrations"
            description="API keys are configured by the deployment owner as OPENROUTER_API_KEY and POST_BRIDGE_API_KEY. They are never returned to this browser or stored in project documents."
          >
            <IntegrationStatus label="post-bridge" configured={config.keys.postbridge} test={test?.postbridge} error={test?.errors?.postbridge} />
            <IntegrationStatus label="OpenRouter" configured={config.keys.openrouter} test={test?.openrouter} error={test?.errors?.openrouter} />
            <Field label="Model" hint={`Pick any model OpenRouter offers${models.length ? ` (${models.length} available)` : ''}.`}>
              <input
                value={modelFilter}
                onChange={(e) => setModelFilter(e.target.value)}
                placeholder="Filter models… e.g. claude, gpt, llama"
                className={`${inputClass} mb-2`}
              />
              <select value={model} onChange={(e) => setModel(e.target.value)} className={inputClass}>
                {model && !filtered.some((m) => m.id === model) && <option value={model}>{model}</option>}
                {filtered.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </Field>
          </Section>

          {/* Posting defaults (per project) */}
          <Section
            title="Posting defaults"
            description="Which connected accounts this project posts to, and whether to schedule directly or save as a draft in post-bridge."
          >
            {accounts.length === 0 ? (
              <p className="text-[12px] text-ink-5">
                No connected accounts yet. Configure POST_BRIDGE_API_KEY for the Convex deployment,
                hit Test, then connect accounts at <PostBridgeLink>post-bridge.com</PostBridgeLink> — they'll appear here.
              </p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {accounts.map((a) => (
                  <label
                    key={a.id}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-lg border border-line bg-card cursor-pointer hover:border-line-2"
                  >
                    <input type="checkbox" checked={selected.includes(a.id)} onChange={() => toggleAccount(a.id)} />
                    <span className="text-[13px] text-ink font-medium">{a.username}</span>
                    <span className="text-[11px] text-ink-5 uppercase tracking-wide">{a.platform}</span>
                  </label>
                ))}
              </div>
            )}

            <Field label="Default mode">
              <div className="flex gap-2">
                <Button variant={mode === 'draft' ? 'primary' : 'secondary'} onClick={() => setMode('draft')}>
                  Save as draft
                </Button>
                <Button variant={mode === 'schedule' ? 'primary' : 'secondary'} onClick={() => setMode('schedule')}>
                  Schedule directly
                </Button>
              </div>
            </Field>
            <DraftNote />
          </Section>

          {/* Background packs (per project) */}
          <Section
            title="Background packs"
            description="Which image packs new slideshows pull backgrounds from when you hit Generate. Select none to generate with plain gradients."
          >
            <PackPicker selected={imagePacks} onChange={setImagePacks} />
            <Button
              variant="secondary"
              icon={libraryImport ? <Loader2 size={13} className="animate-spin" /> : <Images size={13} />}
              onClick={() => void importBundledLibrary()}
              disabled={libraryImport !== null}
            >
              {libraryImport
                ? `Importing ${libraryImport.done} / ${libraryImport.total}…`
                : 'Import bundled library to Convex Storage'}
            </Button>
            <p className="text-[11px] text-ink-6">
              Safe to run again: existing pack images are detected by name and the duplicate upload is removed.
            </p>
          </Section>

          <div className="flex items-center gap-3 pt-2">
            <Button
              variant="primary"
              size="lg"
              icon={saving ? <Loader2 size={13} className="animate-spin" /> : <KeyRound size={13} />}
              onClick={save}
              disabled={saving}
            >
              {saving ? 'Saving…' : 'Save settings'}
            </Button>
            <Button variant="secondary" size="lg" onClick={runTest} disabled={testing || saving}>
              {testing ? <Loader2 size={13} className="animate-spin" /> : null}
              Test connection
            </Button>
            {saved && !saveError && (
              <span className="text-[12px] text-emerald-600 flex items-center gap-1">
                <Check size={13} /> Saved
              </span>
            )}
            {saveError && (
              <span className="text-[12px] text-red-600 flex items-center gap-1">
                <X size={13} /> {saveError}
              </span>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

export function DraftNote() {
  return (
    <div className="flex items-start gap-2 p-3 rounded-lg bg-surface border border-line">
      <Info size={13} className="text-ink-5 mt-0.5 shrink-0" />
      <p className="text-[12px] text-ink-4 leading-snug">
        <span className="font-medium text-ink-3">Drafts vs. scheduling:</span> drafts land in your
        post-bridge inbox to post by hand. You won't get analytics back on drafts — TikTok only
        reports on content it publishes itself — but posting manually avoids automation detection,
        so reach potential is often higher. Scheduling posts automatically and does report analytics.
      </p>
    </div>
  );
}

function TestBadge({ ok, error }: { ok?: boolean; error?: string }) {
  if (ok === undefined) return null;
  return ok ? (
    <p className="text-[11px] text-emerald-600 mt-1 flex items-center gap-1">
      <Check size={11} /> Connected
    </p>
  ) : (
    <p className="text-[11px] text-red-600 mt-1 flex items-center gap-1">
      <X size={11} /> {error || 'Failed'}
    </p>
  );
}

function IntegrationStatus({ label, configured, test, error }: { label: string; configured: boolean; test?: boolean; error?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border border-line bg-card">
      <span className="text-[13px] font-medium text-ink">{label}</span>
      <span className={`text-[11px] ${configured ? 'text-emerald-600' : 'text-amber-600'}`}>
        {configured ? 'Configured' : 'Not configured'}
      </span>
      <TestBadge ok={test} error={error} />
    </div>
  );
}

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-[13px] font-semibold text-ink uppercase tracking-widest">{title}</h2>
        <p className="text-[12px] text-ink-5 mt-1">{description}</p>
      </div>
      {children}
    </section>
  );
}

function Field({ label, hint, children }: { label: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[11px] text-ink-5 mb-1 block">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-ink-6 mt-1">{hint}</p>}
    </div>
  );
}
