import { useCallback, useEffect, useState } from 'react';
import { useLoaderData } from 'react-router-dom';

import { ProgressBar, Table } from 'react-bootstrap';
import {
  Page,
  Playlist,
  SimplifiedPlaylist,
  Track,
} from '@spotify/web-api-ts-sdk';

import { LoaderResponse as HomePageLoaderResponse } from '../pages/HomePage';
import useBottleneck from '../hooks/useBottleneck';

export const SPOTIFY_RATE_LIMIT_WINDOW_SECONDS = 30;
const SPOTIFY_APPROXIMATE_REQUESTS_PER_WINDOW = 120; // internet says 90
const SPOTIFY_BOTTLENECK_OPTIONS = {
  reservoir: SPOTIFY_APPROXIMATE_REQUESTS_PER_WINDOW,
  reservoirRefreshAmount: SPOTIFY_APPROXIMATE_REQUESTS_PER_WINDOW,
  reservoirRefreshInterval: SPOTIFY_RATE_LIMIT_WINDOW_SECONDS * 1000,
  maxConcurrent: SPOTIFY_APPROXIMATE_REQUESTS_PER_WINDOW,
  minTime: 250,
  trackDoneStatus: true,
};

const PLAYLIST_FIELDS =
  'name,owner(id,display_name),description,snapshot_id,tracks.total,tracks.items(track(artists.name),track(id,name,uri,album(name)))';

// const SPOTIFY_GREEN = '#1DB954';

const truncateString = (str?: string, num?: number) => {
  if (!str) return '';
  if (!num) return str;
  return str.length > num ? str.slice(0, num) + '...' : str;
};

const Playlists = () => {
  const { playlistPage: firstPlaylistPage, sdk } =
    useLoaderData() as HomePageLoaderResponse;

  const { requestQueue, counts } = useBottleneck(SPOTIFY_BOTTLENECK_OPTIONS);

  const loading =
    !!counts?.RECEIVED ||
    !!counts?.QUEUED ||
    !!counts?.RUNNING ||
    !!counts?.EXECUTING;

  const [playlistsDetails, setPlaylistsDetails] = useState<{
    [key: string]: Playlist<Track>;
  }>();

  const queueLoadPlaylistDetails = useCallback(
    (playlistPage: Page<SimplifiedPlaylist>) => {
      if (!!sdk && !!playlistPage?.items)
        playlistPage.items.map(async ({ id }) =>
          requestQueue
            .schedule(() =>
              sdk.playlists.getPlaylist(id, undefined, PLAYLIST_FIELDS)
            )
            .then((playlist) => {
              playlist.id = id;
              setPlaylistsDetails((playlistsDetails) => ({
                ...playlistsDetails,
                [id]: playlist,
              }));
            })
        );
    },
    [sdk, requestQueue]
  );

  const queueLoadPlaylistPage = useCallback(
    async (offset = 0) => {
      return requestQueue.schedule(() =>
        sdk!.currentUser.playlists
          .playlists(undefined, offset)
          .then(queueLoadPlaylistDetails)
      );
    },
    [sdk, requestQueue, queueLoadPlaylistDetails]
  );

  useEffect(() => {
    if (!firstPlaylistPage || !sdk) return;

    queueLoadPlaylistDetails(firstPlaylistPage);

    const { total, limit } = firstPlaylistPage;

    let offset = limit;

    while (offset < total) {
      queueLoadPlaylistPage(offset);

      offset += limit;
    }
  }, [sdk, firstPlaylistPage, queueLoadPlaylistDetails, queueLoadPlaylistPage]);

  const numLoaded = Object.keys(playlistsDetails || {}).length;
  const numTotal = firstPlaylistPage?.total || 0;

  return (
    <>
      <h1>Your Playlists</h1>
      <ProgressBar
        animated={loading}
        now={numLoaded}
        max={numTotal}
        label={`${numLoaded} / ${numTotal}`}
        variant="success"
        // style={{ backgroundColor: SPOTIFY_GREEN }}
      />
      <Table striped bordered hover>
        <thead>
          <tr>
            <th>#</th>
            <th>Name</th>
            <th>Description</th>
            <th>Tracks</th>
          </tr>
        </thead>
        <tbody>
          {Object.values(playlistsDetails || {})?.map(
            ({ id, name, description, tracks }, index) => {
              const isMissingTracks = tracks.items.length < tracks.total;
              return (
                <tr key={`playlist-${id}`}>
                  <td>{index + 1}</td>
                  <td>{name}</td>
                  <td>{truncateString(description, 50)}</td>
                  <td className={isMissingTracks ? 'bg-danger' : ''}>
                    {tracks.items.length}
                    {isMissingTracks ? ` / ${tracks.total}` : ''}
                  </td>
                </tr>
              );
            }
          )}
        </tbody>
      </Table>
    </>
  );
};

export default Playlists;
