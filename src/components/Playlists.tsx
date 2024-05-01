import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLoaderData } from 'react-router-dom';

import { Col, Form, ProgressBar, Row, Table } from 'react-bootstrap';
import {
  Page,
  Playlist,
  PlaylistedTrack,
  SimplifiedPlaylist,
  Track,
} from '@spotify/web-api-ts-sdk';

import { LoaderResponse as HomePageLoaderResponse } from '../pages/HomePage';
import useBottleneck from '../hooks/useBottleneck';
import PlaylistRow from './PlaylistRow';
import { playlistDatabase } from '../db';

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

const APPROXIMATE_PIXELS_PER_LABEL_CHARACTER = 6;
const createProgressLabel = (
  numFullyLoaded: number,
  numLoaded: number,
  numTotal: number
) => {
  let numeratorString = `${numLoaded}`;
  const denominatorString = `${numTotal}`;

  let numPartiallyLoaded = numLoaded - numFullyLoaded;
  if (numPartiallyLoaded > 0)
    numeratorString += ` (${numPartiallyLoaded} partial)`;

  return `${numeratorString} / ${denominatorString}`;
};

const putTrackPageInDb = async (
  snapshotId: string,
  offset: number,
  items: PlaylistedTrack<Track>[]
) => {
  playlistDatabase.artists.bulkPut(
    items.flatMap(({ track: { artists } }) =>
      artists.map(({ id, name }) => ({ id, name }))
    )
  );
  playlistDatabase.tracks.bulkPut(
    items.map(({ track: { id, name, album, artists, uri } }) => ({
      id: id,
      name: name,
      albumName: album.name,
      artistIds: artists.map(({ id }) => id),
      uri: uri,
    }))
  );
  const updateObject = items.reduce(
    (acc, { track: { id } }, index) => ({
      ...acc,
      [`trackIds.${offset + index}`]: id,
    }),
    {}
  );
  playlistDatabase.playlistSnapshots.update(snapshotId, updateObject);
};

type Props = {
  playPlaylistTrack: (
    playlistUri: string,
    songUri: string,
    offsetPosition: number
  ) => void;
};
const Playlists = (props: Props) => {
  const { playPlaylistTrack } = props;
  const { playlistPage: firstPlaylistPage, sdk } =
    useLoaderData() as HomePageLoaderResponse;

  const [searchQuery, setSearchQuery] = useState('');

  const { requestQueue, counts } = useBottleneck(SPOTIFY_BOTTLENECK_OPTIONS);

  const loading =
    !!counts?.RECEIVED ||
    !!counts?.QUEUED ||
    !!counts?.RUNNING ||
    !!counts?.EXECUTING;

  const [playlistsPages, setPlaylistsPages] = useState<
    Page<SimplifiedPlaylist>[]
  >([]);
  const [allPlaylistPagesLoaded, setAllPlaylistPagesLoaded] = useState(false);

  const [playlistsDetails, setPlaylistsDetails] = useState<{
    [key: string]: Playlist<Track>;
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

                tracksPage.items.forEach((track, index) => {
                  playlist.tracks.items[offset + index] = track;
                });

                putTrackPageInDb(
                  playlist.snapshot_id,
                  offset,
                  tracksPage.items
                );

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
        playlistPage.items.map(
          async ({ id, external_urls, uri, snapshot_id }) =>
            requestQueue
              .schedule(() =>
                sdk.playlists.getPlaylist(id, undefined, PLAYLIST_FIELDS)
              )
              .then((playlist) => {
                playlist.id = id;
                playlist.external_urls = external_urls;
                playlist.uri = uri;

                setPlaylistsDetails((playlistsDetails) => ({
                  ...playlistsDetails,
                  [id]: playlist,
                }));

                const { limit, total, items } = playlist.tracks;

                playlistDatabase.playlists.put({
                  id,
                  owner: {
                    id: playlist.owner.id,
                    display_name: playlist.owner.display_name,
                  },
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
              })
        );
    },
    [sdk, requestQueue, queueLoadTracksPage]
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
        ({ tracks }) => tracks.items.length === tracks.total
      ).length,
    [playlistsDetails]
  );

  const progressLabelMinWidth = useMemo(() => {
    const maxPossibleCharacters = createProgressLabel(
      numTotal - 1,
      numTotal,
      numTotal
    ).length;
    return maxPossibleCharacters * APPROXIMATE_PIXELS_PER_LABEL_CHARACTER;
  }, [numTotal]);

  return (
    <>
      <Row className="d-flex justify-content-start mb-2 align-items-center">
        <Col xs="auto">
          <h1>Your Playlists</h1>
        </Col>
        <Col>
          <Form.Control
            type="text"
            placeholder="Search by song, artist, album, or playlist name or description"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value.toLowerCase())}
          />
        </Col>
      </Row>
      <ProgressBar>
        <ProgressBar
          animated={loading}
          now={numFullyLoaded}
          max={numTotal}
          label={createProgressLabel(numFullyLoaded, numLoaded, numTotal)}
          variant="success"
          style={{ minWidth: progressLabelMinWidth }}
          // style={{ backgroundColor: SPOTIFY_GREEN }}
        />
      </ProgressBar>
      <Table striped bordered hover responsive>
        <thead>
          <tr>
            <th>#</th>
            <th>Name</th>
            <th>Owner</th>
            <th>Description</th>
            <th>Tracks</th>
          </tr>
        </thead>
        <tbody>
          {Object.values(playlistsDetails || {})?.map((playlist, index) => (
            <PlaylistRow
              key={playlist.id}
              playlist={playlist}
              index={index}
              searchQuery={searchQuery}
              playPlaylistTrack={playPlaylistTrack}
            />
          ))}
        </tbody>
      </Table>
    </>
  );
};

export default Playlists;
