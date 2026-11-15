import { useEffect, useState } from 'react';
import * as THREE from 'three';
import type { EarthTextures } from '../Globe';
export const TEXTURE_URLS = {
  surface: `${import.meta.env.BASE_URL}textures/land_ocean_ice_2048.jpg`,
  clouds: `${import.meta.env.BASE_URL}textures/cloud_combined_2048.jpg`,
  lights: `${import.meta.env.BASE_URL}textures/land_ocean_ice_lights_2048.jpg`,
};
export function useEarthTextures() {
  const [textures, setTextures] = useState<EarthTextures | null>(null);
  const [textureState, setTextureState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    const images: HTMLImageElement[] = [];
    const requests = (Object.entries(TEXTURE_URLS) as [keyof EarthTextures, string][]).map(([key, url]) => new Promise<[keyof EarthTextures, THREE.Texture]>((resolve, reject) => {
      const image = new Image();
      images.push(image);
      image.crossOrigin = 'anonymous';
      image.decoding = 'async';
      image.onload = () => {
        const loadedTexture = new THREE.Texture(image);
        loadedTexture.colorSpace = THREE.SRGBColorSpace;
        loadedTexture.anisotropy = 8;
        loadedTexture.needsUpdate = true;
        resolve([key, loadedTexture]);
      };
      image.onerror = () => reject(new Error(`NASA map failed to load: ${key}`));
      image.src = url;
    }));
    Promise.allSettled(requests).then((results) => {
      const loaded = results.flatMap((result) => result.status === 'fulfilled' ? [result.value] : []);
      if (!active || results.some((result) => result.status === 'rejected')) {
        loaded.forEach(([, loadedTexture]) => loadedTexture.dispose());
        if (active) setTextureState('error');
        return;
      }
      setTextures(Object.fromEntries(loaded) as unknown as EarthTextures);
      setTextureState('ready');
    });
    return () => {
      active = false;
      images.forEach((image) => { image.src = ''; });
    };
  }, [retry]);

  useEffect(() => () => {
    if (textures) Object.values(textures).forEach((texture) => texture.dispose());
  }, [textures]);

  return { textures, textureState, retryTextures: () => { setTextureState('loading'); setRetry(v => v + 1); } };
}
