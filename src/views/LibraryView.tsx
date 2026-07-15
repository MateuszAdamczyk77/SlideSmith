import { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { LibraryImage } from '../types';
import { ViewHeader } from '../components/ViewHeader';
import { getLibrary } from '../lib/api';

export function LibraryView() {
  const [images, setImages] = useState<LibraryImage[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => getLibrary().then(setImages).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  const groups = useMemo(() => {
    const map = new Map<string, LibraryImage[]>();
    for (const img of images || []) {
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
            {error && <p className="text-[12px] text-red-600">{error}</p>}
            {images === null ? (
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
                        <img src={img.url} alt="" loading="lazy" className="w-full h-full object-cover" />
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
