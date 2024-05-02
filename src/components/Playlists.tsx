import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  Page,
  PlaylistedTrack,
  SimplifiedPlaylist,
  SpotifyApi,
  Track as SpotifyTrack,
} from '@spotify/web-api-ts-sdk';

import { Snapshot } from '../pages/HomePage';
import useBottleneck from '../hooks/useBottleneck';
import { playlistDatabase } from '../db';
import PlaylistsTable from './PlaylistsTable';
import PlaylistsProgressBar from './PlaylistsProgressBar';

export const SPOTIFY_GREEN = '#1DB954';

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

// a lower priority value is better, ie. will be run sooner
const REQUEST_QUEUE_PRIORITIES = {
  default: 5,
  extraPlaylistTracks: 4,
};

const PLAYLIST_ITEMS_FIELDS = 'track(id,name,uri,album(name)))';
const PLAYLIST_TRACKS_FIELDS = `offset,limit,items(track(artists(id,name)),${PLAYLIST_ITEMS_FIELDS}`;
const PLAYLIST_FIELDS = `name,owner(id,display_name),description,snapshot_id,tracks(total,offset,limit),tracks.items(track(artists(id,name)),${PLAYLIST_ITEMS_FIELDS}`;

const putTrackPageInDb = async (
  snapshotId: string,
  offset: number,
  items: PlaylistedTrack<SpotifyTrack>[]
) => {
  await playlistDatabase.artists.bulkPut(
    items.flatMap(({ track: { artists } }) =>
      artists.filter(({ id }) => !!id).map(({ id, name }) => ({ id, name }))
    )
  );
  const presentItems = items.filter(({ track }) => !!track.id);
  await playlistDatabase.tracks.bulkPut(
    presentItems.map(({ track: { id, name, album, artists, uri } }) => ({
      id: id,
      name: name,
      albumName: album.name,
      artistIds: artists.map(({ id }) => id),
      uri: uri,
    }))
  );
  const updateObject = presentItems.reduce(
    (acc, { track: { id } }, index) => ({
      ...acc,
      [`trackIds.${offset + index}`]: id,
    }),
    {}
  );
  await playlistDatabase.playlistSnapshots.update(snapshotId, updateObject);
};

type Props = {
  playPlaylistTrack: (
    playlistUri: string,
    songUri: string,
    offsetPosition: number
  ) => void;
  copySnapshot: (snapshot: Snapshot) => void;
  rememberedSnapshots: Snapshot[];
  firstPlaylistPage: Page<SimplifiedPlaylist>;
  sdk: SpotifyApi;
  searchQuery: string;
};
const Playlists = (props: Props) => {
  const {
    playPlaylistTrack,
    copySnapshot,
    rememberedSnapshots,
    firstPlaylistPage,
    sdk,
    searchQuery,
  } = props;

  const { requestQueue, counts } = useBottleneck(SPOTIFY_BOTTLENECK_OPTIONS);

  const [playlistsPages, setPlaylistsPages] = useState<
    Page<SimplifiedPlaylist>[]
  >([]);
  const [allPlaylistPagesLoaded, setAllPlaylistPagesLoaded] = useState(false);

  const loading =
    !allPlaylistPagesLoaded ||
    !!counts?.RECEIVED ||
    !!counts?.QUEUED ||
    !!counts?.RUNNING ||
    !!counts?.EXECUTING;

  const [playlistsDetails, setPlaylistsDetails] = useState<{
    [playlistId: string]: Snapshot;
  }>();

  const queueLoadTracksPage = useCallback(
    async (playlistId: string, offset = 0) => {
      return requestQueue.schedule(
        { priority: REQUEST_QUEUE_PRIORITIES.extraPlaylistTracks },
        () =>
          sdk!.playlists
            .getPlaylistItems(
              playlistId,
              undefined,
              PLAYLIST_TRACKS_FIELDS,
              undefined,
              offset
            )
            .then((tracksPage) => {
              setPlaylistsDetails((playlistsDetails) => {
                const playlist = playlistsDetails?.[playlistId];
                if (!playlist)
                  throw new Error(
                    'Loaded offset page of playlist tracks, but playlist not found in playlistsDetails'
                  );

                tracksPage.items.forEach(
                  ({ track: { id, name, album, artists, uri } }, index) => {
                    playlist.tracks[offset + index] = {
                      id,
                      name,
                      albumName: album.name,
                      artists,
                      artistIds: artists.map(({ id }) => id),
                      uri,
                    };
                  }
                );

                putTrackPageInDb(playlist.id, offset, tracksPage.items);

                return {
                  ...playlistsDetails,
                  [playlistId]: playlist,
                };
              });
            })
      );
    },
    [sdk, requestQueue]
  );

  const handleNewPlaylistPage = useCallback(
    (playlistPage: Page<SimplifiedPlaylist>) => {
      setPlaylistsPages((playlistsPages) => [...playlistsPages, playlistPage]);
      if (!playlistPage.next) setAllPlaylistPagesLoaded(true);

      if (!!sdk && !!playlistPage?.items)
        playlistPage.items.forEach(
          ({ id, external_urls, uri, snapshot_id }) => {
            const rememberedSnapshot = rememberedSnapshots.find(
              ({ playlistId, id: snapshotId }) =>
                playlistId === id && snapshotId === snapshot_id
            );
            if (rememberedSnapshot) {
              setPlaylistsDetails((playlistsDetails) => ({
                ...playlistsDetails,
                [id]: rememberedSnapshot,
              }));

              return;
            }

            return requestQueue
              .schedule(() =>
                sdk.playlists.getPlaylist(id, undefined, PLAYLIST_FIELDS)
              )
              .then((playlist) => {
                playlist.id = id;
                playlist.external_urls = external_urls;
                playlist.uri = uri;

                const snapshot = {
                  playlistId: id,
                  id: snapshot_id,
                  name: playlist.name,
                  description: playlist.description,
                  rememberedAt: new Date(),
                  totalTracks: playlist.tracks.total,
                  trackIds: [],
                  uri,
                  spotifyUrl: external_urls.spotify,
                  owner: playlist.owner,
                  tracks: playlist.tracks.items.map(
                    ({ track: { id, name, album, artists, uri } }) => ({
                      id,
                      name,
                      albumName: album.name,
                      artistIds: artists.map(({ id }) => id),
                      artists,
                      uri,
                    })
                  ),
                } as Snapshot;

                setPlaylistsDetails((playlistsDetails) => ({
                  ...playlistsDetails,
                  [id]: snapshot,
                }));

                const { limit, total, items } = playlist.tracks;

                playlistDatabase.playlists.put({
                  id,
                  owner: playlist.owner,
                  uri,
                  spotifyUrl: external_urls.spotify,
                });
                playlistDatabase.playlistSnapshots.put({
                  playlistId: id,
                  id: snapshot_id,
                  name: playlist.name,
                  description: playlist.description,
                  rememberedAt: new Date(),
                  totalTracks: total,
                  trackIds: [],
                });

                putTrackPageInDb(snapshot_id, 0, items);

                let offset = limit;

                while (offset < total) {
                  queueLoadTracksPage(id, offset);

                  offset += limit;
                }
              });
          }
        );
    },
    [sdk, requestQueue, rememberedSnapshots, queueLoadTracksPage]
  );

  const queueLoadPlaylistsPage = useCallback(
    async (offset = 0) => {
      return requestQueue.schedule(() =>
        sdk!.currentUser.playlists
          .playlists(undefined, offset)
          .then(handleNewPlaylistPage)
      );
    },
    [sdk, requestQueue, handleNewPlaylistPage]
  );

  useEffect(() => {
    if (!firstPlaylistPage || !sdk) return;

    handleNewPlaylistPage(firstPlaylistPage);

    const { total, limit } = firstPlaylistPage;

    let offset = limit;

    while (offset < total) {
      queueLoadPlaylistsPage(offset);

      offset += limit;
    }
  }, [sdk, firstPlaylistPage, handleNewPlaylistPage, queueLoadPlaylistsPage]);

  const numTotal = useMemo(
    () =>
      allPlaylistPagesLoaded
        ? new Set(
            playlistsPages.flatMap(({ items }) => items.map(({ id }) => id))
          ).size
        : firstPlaylistPage?.total || 0,
    [allPlaylistPagesLoaded, playlistsPages, firstPlaylistPage]
  );

  const numLoaded = Object.keys(playlistsDetails || {}).length;
  const numFullyLoaded = useMemo(
    () =>
      Object.values(playlistsDetails || {}).filter(
        ({ tracks, totalTracks }) => tracks.length === totalTracks
      ).length,
    [playlistsDetails]
  );

  return (
    <>
      <PlaylistsProgressBar
        loading={loading}
        numFullyLoaded={numFullyLoaded}
        numLoaded={numLoaded}
        numTotal={numTotal}
      />
      {playlistsDetails && (
        <PlaylistsTable
          playlistsDetails={playlistsDetails}
          searchQuery={searchQuery}
          playPlaylistTrack={playPlaylistTrack}
          copySnapshot={copySnapshot}
        />
      )}
    </>
  );
};

export default Playlists;
