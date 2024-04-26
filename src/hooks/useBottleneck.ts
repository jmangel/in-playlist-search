// import { useMemo, useReducer } from 'react';
// import { AsyncState } from 'react-use/lib/useAsync';
// import Bottleneck from 'bottleneck';

import { useEffect, useMemo, useState } from 'react';
import Bottleneck from 'bottleneck';
import { SPOTIFY_RATE_LIMIT_WINDOW_SECONDS } from '../components/Playlists';

console.warn('searchme useBottleneck top-level, CREATING REQUEST QUEUE');

// const SPOTIFY_RATE_LIMIT_WINDOW_SECONDS = 30;
// const SPOTIFY_APPROXIMATE_REQUESTS_PER_WINDOW = 120; // internet says 90
// const requestQueue = new Bottleneck({
//   reservoir: SPOTIFY_APPROXIMATE_REQUESTS_PER_WINDOW,
//   reservoirRefreshAmount: SPOTIFY_APPROXIMATE_REQUESTS_PER_WINDOW,
//   reservoirRefreshInterval: SPOTIFY_RATE_LIMIT_WINDOW_SECONDS * 1000,
//   maxConcurrent: SPOTIFY_APPROXIMATE_REQUESTS_PER_WINDOW,
//   minTime: 50,
//   trackDoneStatus: true,
// });

// requestQueue.on('failed', async (error, info) => {
//   console.error(
//     'searchme queued request failed',
//     error,
//     info,
//     requestQueue.counts()
//   );

//   if (error.message.includes('rate limit')) {
//     return SPOTIFY_RATE_LIMIT_WINDOW_SECONDS * 1000;
//   }
// });

// requestQueue.on('done', function (info) {
//   console.warn('searchme on done', requestQueue.counts(), info);
// });

// Custom React hook
const useBottleneck = (options: Bottleneck.ConstructorOptions) => {
  const [counts, setCounts] = useState<Partial<Bottleneck.Counts>>();

  const requestQueue = useMemo(() => {
    console.warn('SEARCHME CREATING BOTTLENECK');
    return new Bottleneck(options);
  }, [options]);

  useEffect(() => {
    const onJobDone = (info: Bottleneck.EventInfoRetryable) => {
      setCounts(requestQueue.counts());
    };

    requestQueue.on('done', onJobDone);

    requestQueue.on('failed', async (error, info) => {
      console.error(
        'searchme queued request failed',
        error,
        info,
        requestQueue.counts()
      );

      if (error.message.includes('rate limit')) {
        return SPOTIFY_RATE_LIMIT_WINDOW_SECONDS * 1000;
      }
    });

    // Clean up: remove the event listener when the component using this hook unmounts
    return () => {
      requestQueue.removeAllListeners();
    };
  }, [requestQueue]);

  return { requestQueue, counts };
};

export default useBottleneck;
