import { useCallback } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { useAbortableBlobUrl } from '@/hooks/useAbortableBlobUrl';
import { getAuth0AccessToken } from '@/lib/auth0AccessToken';
import { proxiedImageUrl } from '@/lib/imageProxy';

/** Headers for the backend image proxy (restricted pages). Never sent to IIIF itself. */
export function useProxyHeaders() {
  const { getAccessTokenSilently, isAuthenticated } = useAuth0();
  return useCallback(async (): Promise<HeadersInit | undefined> => {
    if (!isAuthenticated) return undefined;
    const token = await getAuth0AccessToken(getAccessTokenSilently);
    return token ? { Authorization: `Bearer ${token}` } : undefined;
  }, [getAccessTokenSilently, isAuthenticated]);
}

/** One page image: straight from IIIF, through the proxy when BDRC restricts that page. */
export function useScanImage(url: string | null, getHeaders: () => Promise<HeadersInit | undefined>) {
  return useAbortableBlobUrl(url, { fallbackSrc: proxiedImageUrl(url), getFallbackFetchHeaders: getHeaders });
}
