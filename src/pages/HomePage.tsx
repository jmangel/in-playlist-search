import {
  AuthorizationCodeWithPKCEStrategy,
  Devices,
  Page,
  Playlist,
  SimplifiedPlaylist,
  SpotifyApi,
  Track,
  UserProfile,
} from '@spotify/web-api-ts-sdk';
import { useCallback, useEffect, useState } from 'react';
import { Form, ProgressBar, Table } from 'react-bootstrap';
import { LoaderFunction, useLoaderData } from 'react-router-dom';
import useBottleneck from '../hooks/useBottleneck';

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

const PLAYLIST_FIELDS =
  'name,owner(id),description,snapshot_id,tracks.total,tracks.items(track(artists.name),track(id,name,uri,album(name)))';

// const SPOTIFY_GREEN = '#1DB954';

type LoaderResponse = {
  sdk?: SpotifyApi;
  profile?: UserProfile;
  playlistPage?: Page<SimplifiedPlaylist>;
  devices?: Devices;
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

export const SPOTIFY_RATE_LIMIT_WINDOW_SECONDS = 30;
const SPOTIFY_APPROXIMATE_REQUESTS_PER_WINDOW = 120; // internet says 90
const SPOTIFY_BOTTLENECK_OPTIONS = {
  reservoir: SPOTIFY_APPROXIMATE_REQUESTS_PER_WINDOW,
  reservoirRefreshAmount: SPOTIFY_APPROXIMATE_REQUESTS_PER_WINDOW,
  reservoirRefreshInterval: SPOTIFY_RATE_LIMIT_WINDOW_SECONDS * 1000,
  maxConcurrent: SPOTIFY_APPROXIMATE_REQUESTS_PER_WINDOW,
  minTime: 50,
  trackDoneStatus: true,
};

export const loader: LoaderFunction = async ({
  request,
}): Promise<LoaderResponse> => {
  const sdk = await getSdk();

  let profile, playlistPage, devices;

  if (sdk) {
    const profilePromise = sdk.currentUser.profile();
    const playlistPagePromise = sdk.currentUser.playlists.playlists();
    const devicesPromise = sdk.player.getAvailableDevices();

    // TODO: search field
    // TODO: play button
    // TODO: use bottleneck library to avoid 429s
    // TODO: handle 429s (re-queue)
    // TODO: handle 401s (refresh token)
    // TODO: restore/save copy of playlist (button)
    // TODO: allow refreshing devices (button)
    // TODO: cache playlists
    // TODO: get cached playlists
    // TODO: use refresh token?
    // TODO: get track features (uniq set across all playlist tracks)

    [profile, playlistPage, devices] = await Promise.all([
      profilePromise,
      playlistPagePromise,
      devicesPromise,
    ]);
  }

  return {
    sdk,
    profile,
    playlistPage,
    devices,
  };
};

function HomePage() {
  const { sdk } = useLoaderData() as LoaderResponse;

  return sdk ? (
    <>
      <ProfileInfo />
      <DevicesInput />
      <Playlists />
    </>
  ) : (
    <></>
  );
}

const ProfileInfo = () => {
  const { profile } = useLoaderData() as LoaderResponse;

  const { display_name: name, external_urls: { spotify: url = '' } = {} } =
    profile || {};

  return name ? (
    <h1>
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

const DevicesInput = () => {
  const { devices } = useLoaderData() as LoaderResponse;
  const [selectedDeviceId, setSelectedDeviceId] = useState('');

  useEffect(
    () =>
      setSelectedDeviceId(
        (selectedDeviceId) =>
          devices?.devices?.find(({ is_active }) => is_active)?.id ||
          selectedDeviceId ||
          ''
      ),
    [devices]
  );

  return (
    <div className="d-flex">
      <Form.Label className="flex-shrink-0 pr-1">Playing on</Form.Label>
      <Form.Select
        className="flex-grow-1 mx-2"
        name="select"
        value={selectedDeviceId}
        onChange={(e) => setSelectedDeviceId(e.target.value)}
      >
        <option value=""></option>
        {devices?.devices
          ?.filter(({ id }) => !!id)
          .map(({ name, id }) => (
            <option key={`device-${id}`} value={id!}>
              {name}
            </option>
          ))}
      </Form.Select>
      {/* <Button onClick={loadDevices} className="flex-shrink-0">
        Refresh devices
      </Button> */}
    </div>
  );
};

const truncateString = (str?: string, num?: number) => {
  if (!str) return '';
  if (!num) return str;
  return str.length > num ? str.slice(0, num) + '...' : str;
};

const Playlists = () => {
  const { playlistPage: firstPlaylistPage, sdk } =
    useLoaderData() as LoaderResponse;

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
            .then((playlist) =>
              setPlaylistsDetails((playlistsDetails) => ({
                ...playlistsDetails,
                [id]: playlist,
              }))
            )
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

export default HomePage;
