import {
  Dispatch,
  SetStateAction,
  Suspense,
  useCallback,
  useEffect,
  useState,
} from 'react';
import { Await, LoaderFunction, defer, useLoaderData } from 'react-router-dom';

import { Alert, Button, Col, Form, Row } from 'react-bootstrap';
import {
  AuthorizationCodeWithPKCEStrategy,
  Device,
  Page,
  SimplifiedPlaylist,
  SpotifyApi,
  UserProfile,
} from '@spotify/web-api-ts-sdk';

import Playlists from '../components/Playlists';
import { Artist, Playlist, playlistDatabase, Track as DBTrack } from '../db';
import PlaylistsProgressBar from '../components/PlaylistsProgressBar';

const clientId = process.env.REACT_APP_CLIENT_ID || '';
const redirectUrl = `${process.env.REACT_APP_HOST_URI}/callback`;

const scopes = [
  'user-read-private',
  'user-read-email',
  'playlist-read-private',
  'playlist-modify-private',
  'playlist-modify-public',
  'user-read-playback-state',
  'user-modify-playback-state',
];

export type Track = {
  artists: Artist[];
  id: string;
  name: string;
  albumName: string;
  artistIds: string[];
  uri: string;
};
export type Snapshot = {
  owner: {
    id: string;
    display_name: string;
  };
  tracks: Track[];
  id: string;
  playlistId: string;
  name: string;
  description: string;
  rememberedAt: Date;
  totalTracks: number;
  trackIds: string[];
  uri: string;
  spotifyUrl: string;
};

export type RememberedSnapshots = {
  [snapshotId: string]: Snapshot;
};

export type LoaderResponse = {
  sdk: SpotifyApi | null;
  profile: UserProfile | null;
  playlistPage: Page<SimplifiedPlaylist> | null;
  rememberedSnapshots: RememberedSnapshots;
  diskUsageEstimation: StorageEstimate | null;
};

export const getSdk = async () => {
  const auth = new AuthorizationCodeWithPKCEStrategy(
    clientId,
    redirectUrl,
    scopes
  );
  const internalSdk = new SpotifyApi(auth);

  let sdk;

  try {
    const { authenticated } = await internalSdk.authenticate();

    if (authenticated) {
      sdk = internalSdk;
    }
  } catch (e: Error | unknown) {
    const error = e as Error;
    if (
      error &&
      error.message &&
      error.message.includes('No verifier found in cache')
    ) {
      console.error(
        "If you are seeing this error in a React Development Environment it's because React calls useEffect twice. Using the Spotify SDK performs a token exchange that is only valid once, so React re-rendering this component will result in a second, failed authentication. This will not impact your production applications (or anything running outside of Strict Mode - which is designed for debugging components).",
        error
      );
    } else {
      console.error(e);
    }
  }

  return sdk;
};

const formatBytes = (bytes: number) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

export const loader: LoaderFunction = async ({ request }) => {
  const sdk = await getSdk();

  const profilePromise = sdk?.currentUser?.profile() || Promise.resolve(null);
  const playlistPagePromise =
    sdk?.currentUser?.playlists?.playlists() || Promise.resolve(null);

  const playlists = await playlistDatabase.playlists.toArray();
  const snapshots = await playlistDatabase.playlistSnapshots.toArray();
  const allTracks = await playlistDatabase.tracks.toArray();
  const rememberedSnapshotsPromise = playlistDatabase.artists
    .toArray()
    .then((allArtists) => {
      const playlistsById = playlists.reduce((acc, playlist) => {
        acc[playlist.id] = playlist;
        return acc;
      }, {} as { [id: string]: Playlist });
      const tracksById = allTracks.reduce((acc, track) => {
        acc[track.id] = track;
        return acc;
      }, {} as { [id: string]: DBTrack });
      const artistsById = allArtists.reduce((acc, artist) => {
        acc[artist.id] = artist;
        return acc;
      }, {} as { [id: string]: Artist });
      const rememberedSnapshots = snapshots
        .map((snapshot): Snapshot | null => {
          const playlist = playlistsById[snapshot.playlistId];

          // skip snapshot if playlist info or any track ids are missing
          // TODO: allow partial remembered playlists, and load the missing pages from spotify if needed
          if (
            !playlist ||
            snapshot.trackIds.length < snapshot.totalTracks ||
            snapshot.trackIds.some((trackId) => !trackId)
          )
            return null;

          const tracks = [];
          // use a for loop instead of forEach here to allow early return from the outer `.map` function
          for (const trackId of snapshot.trackIds) {
            const track = tracksById[trackId];
            const artists = (track?.artistIds
              ?.map((artistId) => artistsById[artistId])
              ?.filter(Boolean) || []) as Artist[];

            // for now, throw away any snapshots with missing tracks or artists
            // TODO: allow partial remembered tracks, and load the missing pages from spotify if needed
            if (!track || !artists.length) return null;

            tracks.push({
              ...track,
              artists,
            });
          }

          const { owner } = playlist || {};

          return {
            ...snapshot,
            owner,
            tracks,
            spotifyUrl: playlist.spotifyUrl,
            uri: playlist.uri,
          };
        })
        .filter(Boolean)
        .reduce((acc, snapshot) => {
          const { id } = snapshot!;
          acc[id] = snapshot!;
          return acc;
        }, {} as RememberedSnapshots);

      return rememberedSnapshots;
    });

  const diskUsageEstimationPromise =
    navigator.storage?.estimate?.() || Promise.resolve(null);

  // TODO: save/copy button
  // TODO: use bottleneck library to avoid 429s
  // TODO: handle 429s (re-queue)
  // TODO: handle 401s (refresh token)
  // TODO: restore/save copy of playlist (button)
  // TODO: allow refreshing devices (button)
  // TODO: cache playlists
  // TODO: get cached playlists
  // TODO: use refresh token?
  // TODO: get track features (uniq set across all playlist tracks)

  return defer({
    sdk: Promise.resolve(sdk || null),
    profile: profilePromise,
    playlistPage: playlistPagePromise,
    rememberedSnapshots: rememberedSnapshotsPromise,
    diskUsageEstimation: diskUsageEstimationPromise,
  });
};

function HomePage() {
  const { sdk, profile } = useLoaderData() as LoaderResponse;

  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  return (
    <>
      <Row className="align-items-center mb-1">
        <Suspense fallback={<div>Getting your profile info...</div>}>
          <Await
            resolve={profile}
            errorElement={<div>Error loading your profile</div>}
          >
            {(profile) => (
              <Col xs="auto">
                <ProfileInfo profile={profile} />
              </Col>
            )}
          </Await>
        </Suspense>
        <Suspense fallback={<div>Connecting to spotify...</div>}>
          <Await
            resolve={sdk}
            errorElement={<div>Error connecting to spotify</div>}
          >
            {(sdk) => (
              <Col className="flex-grow-1" xs={6} md={4}>
                <DevicesInput
                  selectedDeviceId={selectedDeviceId}
                  setSelectedDeviceId={setSelectedDeviceId}
                  sdk={sdk}
                />
              </Col>
            )}
          </Await>
        </Suspense>
      </Row>
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
      <DeferredPlaylists
        searchQuery={searchQuery}
        selectedDeviceId={selectedDeviceId}
      />
      <DiskUsageAlert />
    </>
  );
}

const ProfileInfo = (props: { profile: UserProfile }) => {
  const { profile } = props;
  const { display_name: name, external_urls: { spotify: url = '' } = {} } =
    profile;

  return name ? (
    <h1 className="mb-0">
      Logged in as{' '}
      {url ? (
        <a target="_blank" href={url} rel="noreferrer">
          {name}
        </a>
      ) : (
        name
      )}
    </h1>
  ) : (
    <></>
  );
};

type DevicesInputProps = {
  selectedDeviceId: string;
  setSelectedDeviceId: Dispatch<SetStateAction<string>>;
  sdk: SpotifyApi;
};
const DevicesInput = (props: DevicesInputProps) => {
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
      setSelectedDeviceId(
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
        onChange={(e) => setSelectedDeviceId(e.target.value)}
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
        Refresh devices
      </Button>
    </div>
  );
};

const DeferredPlaylists = (props: {
  selectedDeviceId: string;
  searchQuery: string;
}) => {
  const { selectedDeviceId, searchQuery } = props;
  const { sdk, profile, playlistPage, rememberedSnapshots } =
    useLoaderData() as LoaderResponse;

  return (
    <Suspense
      fallback={
        <div>
          <PlaylistsProgressBar
            loading
            numFullyLoaded={0}
            numLoaded={0}
            numTotal={1}
            label="0 / loading..."
          />
        </div>
      }
    >
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
            selectedDeviceId={selectedDeviceId}
            searchQuery={searchQuery}
          />
        )}
      </Await>
    </Suspense>
  );
};

const DiskUsageAlert = () => {
  const { diskUsageEstimation } = useLoaderData() as LoaderResponse;
  return (
    <Suspense fallback={<></>}>
      <Await resolve={diskUsageEstimation} errorElement={<></>}>
        {(diskUsageEstimation) => {
          if (!diskUsageEstimation) return <></>;

          const { usage, quota } = diskUsageEstimation;
          const usagePercentage = (usage / quota) * 100;

          return (
            <Alert variant="info">
              Cached playlists are using {formatBytes(usage)} on disk,{' '}
              {usagePercentage.toFixed(2)}% of this app's storage quota.
            </Alert>
          );
        }}
      </Await>
    </Suspense>
  );
};

export default HomePage;
