import { useMemo } from 'react';
import { Loader2 } from 'lucide-react';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import type { LibraryImage } from '../types';
import { ViewHeader } from '../components/ViewHeader';

export function LibraryView() {
  const images = useQuery(api.images.list, {});

  const groups = useMemo(() => {
    const map = new Map<string, LibraryImage[]>();
    for (const stored of images ?? []) {
      if (!stored.url) continue;
      const img: LibraryImage = {
        id: stored.id,
        url: stored.url,
        pack: stored.pack,
        packId: stored.packId ?? undefined,
        source: stored.source,
      };
      if (!map.has(img.pack)) map.set(img.pack, []);
      map.get(img.pack)!.push(img);
    }
    return [...map.entries()];
  }, [images]);

  return (
    <>
      <ViewHeader
        title="Library"
        subtitle="Curated background images for your slides, organized into aesthetic packs."
      />

      <div className="flex-1 overflow-y-auto">
        {/* Packs */}
        <div className="p-8">
          <div className="max-w-5xl mx-auto space-y-8">
            {images === undefined ? (
              <div className="flex items-center justify-center py-16 text-ink-5 text-[13px] gap-2">
                <Loader2 size={14} className="animate-spin" /> Loading library…
              </div>
            ) : (
              groups.map(([pack, imgs]) => (
                <div key={pack}>
                  <div className="flex items-baseline gap-3 mb-3">
                    <h2 className="text-[13px] font-semibold text-ink uppercase tracking-widest">{pack}</h2>
                    <span className="text-[11px] text-ink-6">{imgs.length}</span>
                  </div>
                  <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
                    {imgs.map((img) => (
                      <div key={img.id} className="group relative aspect-[9/16] rounded-lg overflow-hidden bg-raised">
                        <img src={img.url ?? undefined} alt="" loading="lazy" className="w-full h-full object-cover" />
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </>
  );
}
