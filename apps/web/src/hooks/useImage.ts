import { useEffect, useState } from "react";

const cache = new Map<string, HTMLImageElement>();

/**
 * Loads an image element for a URL, caching per URL. Returns undefined while
 * loading or if the URL is empty.
 */
export function useImage(url: string | undefined): HTMLImageElement | undefined {
  const [image, setImage] = useState<HTMLImageElement | undefined>(() => {
    if (!url) {
      return undefined;
    }
    return cache.get(url);
  });

  useEffect(() => {
    if (!url) {
      setImage(undefined);
      return;
    }
    const cached = cache.get(url);
    if (cached) {
      setImage(cached);
      return;
    }
    let alive = true;
    const img = new window.Image();
    img.onload = () => {
      cache.set(url, img);
      if (alive) {
        setImage(img);
      }
    };
    img.src = url;
    return () => {
      alive = false;
    };
  }, [url]);

  return image;
}

/** Natural dimensions of a previously cached image, if loaded. */
export function getCachedImageSize(url: string): { width: number; height: number } | null {
  const img = cache.get(url);
  if (!img?.naturalWidth) {
    return null;
  }
  return { width: img.naturalWidth, height: img.naturalHeight };
}
