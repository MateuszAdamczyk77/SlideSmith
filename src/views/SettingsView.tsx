import { useEffect, useState } from 'react';
import { Check, X, Loader2, KeyRound, Trash2, Images } from 'lucide-react';
import { useAction, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import type { AppConfig, Project, ModelOption } from '../types';
import { ViewHeader } from '../components/ViewHeader';
import { Button } from '../components/Button';
import { PackPicker } from '../components/PackPicker';
import { uploadFile } from '../lib/api';
import { bundledImagePaths, bundledPacks } from '../lib/bundledLibrary';

interface SettingsViewProps {
  config: AppConfig;
  project: Project;
  canDelete: boolean;
  onSave: (patch: {
    model?: string;
    name?: string;
    imagePacks?: string[];
  }) => Promise<void>;
  onDeleteProject: () => void;
}

const inputClass =
  'w-full h-9 bg-card border border-line rounded-lg px-3 text-[13px] text-ink ' +
  'placeholder:text-ink-6 outline-none transition-colors ' +
  'focus:border-ink-7 focus:ring-2 focus:ring-ink/10';

export function SettingsView({
  config,
  project,
  canDelete,
  onSave,
  onDeleteProject,
}: SettingsViewProps) {
  const listModels = useAction(api.openrouter.listModels);
  const testOpenrouter = useAction(api.openrouter.test);
  const createImagePack = useMutation(api.imagePacks.create);
  const generateUploadUrl = useMutation(api.images.generateUploadUrl);
  const registerImage = useMutation(api.images.register);
  const [model, setModel] = useState(config.model);
  const [name, setName] = useState(project.name);
  const [imagePacks, setImagePacks] = useState<string[]>(project.imagePacks);
  const [models, setModels] = useState<ModelOption[]>([]);
  const [modelFilter, setModelFilter] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [test, setTest] = useState<{ openrouter: boolean; errors: Record<string, string> } | null>(null);
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
        imagePacks,
      });
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
      const openrouterResult = await testOpenrouter({ projectId: project.id }).then(() => true).catch((error) => {
        errors.openrouter = error instanceof Error ? error.message : String(error);
        return false;
      });
      setTest({ openrouter: openrouterResult, errors });
    } finally {
      setTesting(false);
    }
  };

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
            description="The OpenRouter key is configured by the deployment owner as OPENROUTER_API_KEY. It is never returned to this browser or stored in project documents."
          >
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
