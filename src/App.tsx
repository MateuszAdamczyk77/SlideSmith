import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuthActions } from '@convex-dev/auth/react';
import { Authenticated, AuthLoading, Unauthenticated, useAction, useMutation, useQuery } from 'convex/react';
import { api } from '../convex/_generated/api';
import type { Id } from '../convex/_generated/dataModel';
import { Sidebar } from './components/Sidebar';
import { ScheduleModal } from './components/ScheduleModal';
import { BulkScheduleModal } from './components/BulkScheduleModal';
import { GenerateModal } from './components/GenerateModal';
import { SlideshowEditorModal } from './components/SlideshowEditorModal';
import { AuthScreen } from './components/AuthScreen';
import { QueueView } from './views/QueueView';
import { LibraryView } from './views/LibraryView';
import { ScheduleView } from './views/ScheduleView';
import { ResultsView } from './views/ResultsView';
import { BrainView } from './views/BrainView';
import { SettingsView } from './views/SettingsView';
import { renderSlideshow } from './lib/render';
import { mapAccounts, uploadPng } from './lib/api';
import type { Project, Slideshow, Slide, SocialAccount, BrainState, ViewKey } from './types';

export default function App() {
  return (
    <>
      <AuthLoading>
        <CenteredMessage>Checking session…</CenteredMessage>
      </AuthLoading>
      <Unauthenticated><AuthScreen /></Unauthenticated>
      <Authenticated><SlidesmithApp /></Authenticated>
    </>
  );
}

function SlidesmithApp() {
  const { signOut } = useAuthActions();
  const config = useQuery(api.config.get, {});
  const queueResult = useQuery(api.slideshows.listQueue, {});
  const packsResult = useQuery(api.imagePacks.list, {});
  const queue = useMemo(() => queueResult ?? [], [queueResult]);
  const packs = useMemo(() => packsResult ?? [], [packsResult]);
  const ensureDefaultProject = useMutation(api.projects.ensureDefault);
  const createProject = useMutation(api.projects.create);
  const saveModel = useMutation(api.config.saveModel);
  const updateProject = useMutation(api.projects.update);
  const removeProject = useMutation(api.projects.remove);
  const activateProject = useMutation(api.projects.activate);
  const updateSlideshow = useMutation(api.slideshows.update);
  const removeSlideshow = useMutation(api.slideshows.remove);
  const generateUploadUrl = useMutation(api.images.generateUploadUrl);
  const registerImage = useMutation(api.images.register);
  const generateSlideshows = useAction(api.openrouter.generate);
  const listAccounts = useAction(api.postbridge.listAccounts);
  const schedulePost = useAction(api.postbridge.schedule);

  const [activeView, setActiveView] = useState<ViewKey>('queue');
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [generating, setGenerating] = useState(false);
  const [scheduling, setScheduling] = useState<Slideshow | null>(null);
  const [editing, setEditing] = useState<Slideshow | null>(null);
  const [selectedIds, setSelectedIds] = useState<Id<'slideshows'>[]>([]);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasOpenrouter = Boolean(config?.keys.openrouter);
  const hasPostbridge = Boolean(config?.keys.postbridge);
  const activeProject: Project | undefined = config?.projects.find(
    (project) => project.id === config.activeProjectId,
  ) ?? config?.projects[0];

  const loadAccounts = useCallback(async () => {
    if (!activeProject || !hasPostbridge) return setAccounts([]);
    try {
      setAccounts(mapAccounts(await listAccounts({ projectId: activeProject.id })));
    } catch {
      setAccounts([]);
    }
  }, [activeProject, hasPostbridge, listAccounts]);

  useEffect(() => {
    if (config && config.projects.length === 0) void ensureDefaultProject({});
  }, [config, ensureDefaultProject]);

  useEffect(() => {
    let cancelled = false;
    if (!activeProject || !hasPostbridge) return;
    listAccounts({ projectId: activeProject.id }).then(
      (raw) => { if (!cancelled) setAccounts(mapAccounts(raw)); },
      () => { if (!cancelled) setAccounts([]); },
    );
    return () => { cancelled = true; };
  }, [activeProject, hasPostbridge, listAccounts]);

  const validSelectedIds = selectedIds.filter((id) => queue.some((show) => show.id === id));
  const visibleView: ViewKey = activeView === 'queue' && !hasOpenrouter && !hasPostbridge
    ? 'settings'
    : activeView;

  const generate = async (count: number, selectedPackNames: string[]) => {
    if (!activeProject || !config) return;
    setError(null);
    setGenerating(true);
    try {
      const imagePackIds = packs
        .filter((pack) => selectedPackNames.includes(pack.name))
        .map((pack) => pack.id);
      await generateSlideshows({
        projectId: activeProject.id,
        count,
        model: config.model,
        imagePackIds,
      });
      setGenerateOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setGenerating(false);
    }
  };

  const saveEdits = async (patch: { slides: Slide[]; caption: string; hashtags: string[] }) => {
    if (!editing) return;
    await updateSlideshow({
      slideshowId: editing.id,
      caption: patch.caption,
      hashtags: patch.hashtags,
      slides: patch.slides.map((slide, position) => ({
        externalId: slide.id,
        position,
        text: slide.text,
        ...(slide.imageId ? { imageId: slide.imageId } : {}),
        ...(slide.bgFrom ? { bgFrom: slide.bgFrom } : {}),
        ...(slide.bgTo ? { bgTo: slide.bgTo } : {}),
      })),
    });
    setEditing(null);
  };

  const publish = async (
    show: Slideshow,
    options: { socialAccounts: number[]; mode: 'draft' | 'schedule'; scheduledAt: string | null },
  ) => {
    if (!activeProject) throw new Error('No active project.');
    const blobs = await renderSlideshow(show);
    const storageIds: Id<'_storage'>[] = [];
    for (const [index, blob] of blobs.entries()) {
      const storageId = await uploadPng(blob, () => generateUploadUrl({}));
      await registerImage({
        storageId,
        projectId: activeProject.id,
        slideshowId: show.id,
        kind: 'rendered',
        mimeType: 'image/png',
        originalName: `${show.id}-${index + 1}.png`,
      });
      storageIds.push(storageId);
    }
    await schedulePost({
      projectId: activeProject.id,
      slideshowId: show.id,
      caption: `${show.caption}${show.hashtags.length ? ` ${show.hashtags.map((tag) => `#${tag}`).join(' ')}` : ''}`,
      storageIds,
      ...options,
    });
  };

  if (!config || !activeProject) return <CenteredMessage>Loading…</CenteredMessage>;

  return (
    <div className="flex h-full w-full bg-bg text-ink">
      <Sidebar
        activeView={visibleView}
        onSelectView={setActiveView}
        queueCount={queue.length}
        scheduledCount={0}
        projects={config.projects}
        activeProjectId={activeProject.id}
        onSwitchProject={(projectId) => void activateProject({ projectId })}
        onNewProject={() => void createProject({}).then(() => setActiveView('settings'))}
        onSignOut={() => void signOut()}
      />
      <main className="flex-1 h-full overflow-hidden flex flex-col">
        {error && visibleView !== 'settings' && (
          <div className="px-8 py-2 bg-red-50 border-b border-red-200 text-[12px] text-red-700">{error}</div>
        )}

        {visibleView === 'queue' && (
          <QueueView
            slideshows={queue}
            generating={generating}
            canGenerate={hasOpenrouter}
            onGenerate={() => setGenerateOpen(true)}
            selectedIds={validSelectedIds}
            onApprove={(id) => setScheduling(queue.find((show) => show.id === id) || null)}
            onReject={(slideshowId) => void removeSlideshow({ slideshowId })}
            onEdit={(id) => setEditing(queue.find((show) => show.id === id) || null)}
            onToggleSelect={(id) => setSelectedIds((previous) => previous.includes(id) ? previous.filter((item) => item !== id) : [...previous, id])}
            onSelectAll={() => setSelectedIds(queue.map((show) => show.id))}
            onClearSelection={() => setSelectedIds([])}
            onBulkSchedule={() => setBulkOpen(true)}
          />
        )}
        {visibleView === 'library' && <LibraryView />}
        {visibleView === 'schedule' && <ScheduleView configured={hasPostbridge} projectId={activeProject.id} />}
        {visibleView === 'results' && <ResultsView configured={hasPostbridge} projectId={activeProject.id} />}
        {visibleView === 'brain' && (
          <BrainView
            brain={activeProject.brain}
            onChange={(brain: BrainState) => void updateProject({ projectId: activeProject.id, brain })}
          />
        )}
        {visibleView === 'settings' && (
          <SettingsView
            key={activeProject.id}
            config={config}
            project={activeProject}
            accounts={accounts}
            canDelete={config.projects.length > 1}
            onSave={async (patch) => {
              if (patch.model !== undefined) await saveModel({ model: patch.model });
              await updateProject({
                projectId: activeProject.id,
                ...(patch.name !== undefined ? { name: patch.name } : {}),
                ...(patch.defaults ? { defaults: patch.defaults } : {}),
                ...(patch.imagePacks ? { imagePacks: patch.imagePacks } : {}),
              });
            }}
            onDeleteProject={() => void removeProject({ projectId: activeProject.id })}
            onReloadAccounts={() => void loadAccounts()}
          />
        )}
      </main>

      {scheduling && (
        <ScheduleModal
          slideshow={scheduling}
          accounts={accounts}
          defaults={activeProject.defaults}
          projectId={activeProject.id}
          onClose={() => setScheduling(null)}
          onConfirm={(options) => publish(scheduling, options)}
        />
      )}
      {editing && <SlideshowEditorModal slideshow={editing} onClose={() => setEditing(null)} onSave={saveEdits} />}
      {bulkOpen && validSelectedIds.length > 0 && (
        <BulkScheduleModal
          slideshows={queue.filter((show) => validSelectedIds.includes(show.id))}
          accounts={accounts}
          defaults={activeProject.defaults}
          projectId={activeProject.id}
          onSchedule={publish}
          onClose={() => { setBulkOpen(false); setSelectedIds([]); }}
          onDone={() => { setBulkOpen(false); setSelectedIds([]); setActiveView('schedule'); }}
        />
      )}
      {generateOpen && (
        <GenerateModal
          defaultPacks={activeProject.imagePacks}
          generating={generating}
          onClose={() => setGenerateOpen(false)}
          onGenerate={generate}
        />
      )}
    </div>
  );
}

function CenteredMessage({ children }: { children: React.ReactNode }) {
  return <div className="h-full w-full flex items-center justify-center bg-bg text-ink-5 text-[13px]">{children}</div>;
}
