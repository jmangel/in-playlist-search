import {
  Dispatch,
  SetStateAction,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  Device,
  Page,
  PlaybackState,
  PlaylistedTrack,
  SimplifiedPlaylist,
  SpotifyApi,
  Track as SpotifyTrack,
  UserProfile,
} from '@spotify/web-api-ts-sdk';

import {
  LoaderResponse,
  RememberedSnapshots,
  Snapshot,
  Track,
} from '../pages/HomePage';
import useBottleneck from '../hooks/useBottleneck';
import { playlistDatabase } from '../db';
import PlaylistsTable from './PlaylistsTable';
import PlaylistsProgressBar from './PlaylistsProgressBar';
import { Await, useLoaderData } from 'react-router-dom';
import { Button, Col, Form, Row } from 'react-bootstrap';

// unfortunately spotify can return an item that's just { track: null }
// even though the sdk types don't specify this
export type TracksItem = PlaylistedTrack<SpotifyTrack> | { track: null };

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
  items: TracksItem[]
) => {
  const presentItems = items.filter(
    ({ track }) => !!track?.id
  ) as PlaylistedTrack<SpotifyTrack>[];

  await playlistDatabase.artists.bulkPut(
    presentItems.flatMap(({ track: { artists } }) =>
      artists.filter(({ id }) => !!id).map(({ id, name }) => ({ id, name }))
    )
  );
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

function decodeHtml(input: string) {
  var doc = new DOMParser().parseFromString(input, 'text/html');
  return doc.documentElement.textContent;
}

type DeviceInputProps = {
  selectedDeviceId?: string;
  setSelectedDeviceId?: Dispatch<SetStateAction<string>>;
  sdk?: SpotifyApi;
};
const DeviceInput = (props: DeviceInputProps) => {
  const { selectedDeviceId, setSelectedDeviceId, sdk } = props;

  const [devices, setDevices] = useState([] as Device[]);

  const loadDevices = useCallback(() => {
    sdk?.player
      ?.getAvailableDevices?.()
      ?.then(({ devices }) => setDevices(devices));
  }, [sdk]);

  useEffect(loadDevices, [loadDevices]);

  useEffect(
    () =>
      setSelectedDeviceId?.(
        (selectedDeviceId) =>
          devices?.find(({ is_active }) => is_active)?.id ||
          selectedDeviceId ||
          ''
      ),
    [devices, setSelectedDeviceId]
  );

  return (
    <div className="d-flex align-items-center">
      <Form.Label className="flex-shrink-0 pr-1 mb-0">Playing on</Form.Label>
      <Form.Select
        className="flex-grow-1 mx-2"
        name="select"
        value={selectedDeviceId}
        disabled={!setSelectedDeviceId}
        onChange={(e) => setSelectedDeviceId?.(e.target.value)}
      >
        <option value=""></option>
        {devices
          ?.filter(({ id }) => !!id)
          .map(({ name, id }) => (
            <option key={`device-${id}`} value={id!}>
              {name}
            </option>
          ))}
      </Form.Select>
      <Button onClick={loadDevices} className="flex-shrink-0">
        Get devices
      </Button>
    </div>
  );
};

const SectionHeader = (props: {
  loading: boolean;
  searchQuery?: string;
  setSearchQuery?: Dispatch<SetStateAction<string>>;
  selectedDeviceId?: string;
  setSelectedDeviceId?: Dispatch<SetStateAction<string>>;
  sdk?: SpotifyApi;
  progressBarProps?: {
    numFullyLoaded: number;
    numLoaded: number;
    numTotal: number;
  };
}) => {
  const {
    loading,
    searchQuery,
    setSearchQuery,
    selectedDeviceId,
    setSelectedDeviceId,
    sdk,
    progressBarProps,
  } = props;
  const { numFullyLoaded, numLoaded, numTotal } = progressBarProps || {};

  let label;
  if (!progressBarProps) label = '0 / loading...';

  return (
    <>
      <Row className="d-flex justify-content-start align-items-center gy-2">
        <Col xs="auto">
          <h1 className="mb-0">Your Playlists</h1>
        </Col>
        <Col className="flex-grow-1" xs={8} md={4}>
          <DeviceInput
            selectedDeviceId={selectedDeviceId}
            setSelectedDeviceId={setSelectedDeviceId}
            sdk={sdk}
          />
        </Col>
      </Row>
      <Row className="d-flex justify-content-start align-items-center">
        <Col>
          <Form.Control
            type="text"
            placeholder="Search by song, artist, album, or playlist name or description"
            value={searchQuery}
            disabled={!setSearchQuery}
            onChange={(e) => setSearchQuery?.(e.target.value.toLowerCase())}
          />
        </Col>
      </Row>
      <PlaylistsProgressBar
        loading={loading}
        numFullyLoaded={numFullyLoaded || 0}
        numLoaded={numLoaded || 0}
        numTotal={numTotal || 1}
        label={label}
      />
    </>
  );
};

type Props = {
  rememberedSnapshots: RememberedSnapshots;
  firstPlaylistPage: Page<SimplifiedPlaylist>;
  sdk: SpotifyApi;
  profile: UserProfile;
};
const Playlists = (props: Props) => {
  const { rememberedSnapshots, firstPlaylistPage, sdk, profile } = props;

  const { requestQueue, counts } = useBottleneck(SPOTIFY_BOTTLENECK_OPTIONS);

  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
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

  const playPlaylistTrack = useCallback(
    (playlistUri: string, songUri: string, offsetPosition: number) => {
      if (!sdk) return;

      if (window.navigator.vibrate) window.navigator.vibrate(20);

      const playWithOffsetOptions = (offsetOptions: object) =>
        sdk.player.startResumePlayback(
          selectedDeviceId,
          playlistUri,
          undefined,
          offsetOptions
        );

      const playViaPositionOffset = () =>
        playWithOffsetOptions({
          position: offsetPosition,
        });

      const playViaSongUri = () =>
        playWithOffsetOptions({
          uri: songUri,
        });

      const waitThenCheckPlaybackState = () =>
        new Promise<PlaybackState>((resolve) => {
          setTimeout(() => sdk.player.getPlaybackState().then(resolve), 1000);
        });

      // TODO: handle 404 device not found

      // play from the position first, to force the device to load the playlist
      // (if we play with the specific song uri and it isn't loaded,
      // it will simply fail and the device won't load the playlist)
      playViaPositionOffset().then(() =>
        waitThenCheckPlaybackState().then((playbackState) => {
          const { item } = playbackState;
          if (item?.uri !== songUri) {
            // wait 2 seconds to let the device refresh the playlist
            setTimeout(() => {
              playViaSongUri().then(() => {
                // if songUri still isn't present on device, then spotify stops
                // playing, but still returns 204, so again we have to check the
                // playback state, and play via position offset if needed
                waitThenCheckPlaybackState().then((playbackState) => {
                  if (!playbackState?.is_playing) playViaPositionOffset();
                });
              });
            }, 2000);
          }
        })
      );
    },
    [sdk, selectedDeviceId]
  );

  const copySnapshot = useCallback(
    (snapshot: Snapshot) => {
      const { name, description, rememberedAt } = snapshot;

      const rememberedDate = rememberedAt ? new Date(rememberedAt) : new Date();
      let copiedDescription = `(copied on ${rememberedDate.toLocaleDateString(
        undefined,
        {
          dateStyle: 'short',
        }
      )})`;
      if (description) {
        copiedDescription += ` - ${decodeHtml(description)}`;
      }

      sdk.playlists
        .createPlaylist(profile.id, {
          name,
          description: copiedDescription,
          public: false,
          collaborative: false,
        })
        .then((playlist) => {
          const trackUris = snapshot.tracks.map(({ uri }) => uri);
          sdk.playlists.addItemsToPlaylist(playlist.id, trackUris);
        });
    },
    [sdk, profile]
  );

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
            const rememberedSnapshot = rememberedSnapshots[snapshot_id];
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
                  tracks: playlist.tracks.items
                    .map((item: TracksItem) => {
                      if (!item.track)
                        return {
                          id: '',
                          name: '',
                          albumName: '',
                          artistIds: [],
                          uri: '',
                          artists: [],
                          missingFromSpotify: true,
                        } as Track;

                      const {
                        track: { id, name, album, artists, uri },
                      } = item;

                      return {
                        id,
                        name,
                        albumName: album?.name,
                        artistIds: artists?.map(({ id }) => id),
                        artists,
                        uri,
                      };
                    })
                    .filter(Boolean),
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
      <SectionHeader
        loading={loading}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        selectedDeviceId={selectedDeviceId}
        setSelectedDeviceId={setSelectedDeviceId}
        sdk={sdk}
        progressBarProps={{ numFullyLoaded, numLoaded, numTotal }}
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

const DeferredPlaylists = () => {
  const { sdk, profile, playlistPage, rememberedSnapshots } =
    useLoaderData() as LoaderResponse;

  return (
    <Suspense fallback={<SectionHeader loading />}>
      <Await
        resolve={Promise.all([rememberedSnapshots, playlistPage, sdk, profile])}
        errorElement={<div>Error loading playlists</div>}
      >
        {([rememberedSnapshots, playlistPage, sdk, profile]) => (
          <Playlists
            profile={profile}
            rememberedSnapshots={rememberedSnapshots}
            firstPlaylistPage={playlistPage}
            sdk={sdk}
          />
        )}
      </Await>
    </Suspense>
  );
};

export default DeferredPlaylists;
