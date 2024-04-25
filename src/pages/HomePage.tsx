import {
  AuthorizationCodeWithPKCEStrategy,
  Devices,
  SimplifiedPlaylist,
  SpotifyApi,
  UserProfile,
} from '@spotify/web-api-ts-sdk';
import { useEffect, useState } from 'react';
import { Form, Table } from 'react-bootstrap';
import { LoaderFunction, useLoaderData } from 'react-router-dom';
import Bottleneck from 'bottleneck';

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

const playlistFields =
  'name,owner(id),description,snapshot_id,tracks.items(track(artists.name),track(id,name,uri,album(name)))';

type LoaderResponse = {
  sdk?: SpotifyApi;
  profile?: UserProfile;
  playlists?: SimplifiedPlaylist[];
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

const SPOTIFY_RATE_LIMIT_WINDOW_SECONDS = 30;
const SPOTIFY_APPROXIMATE_REQUESTS_PER_WINDOW = 120; // internet says 90
const requestQueue = new Bottleneck({
  reservoir: SPOTIFY_APPROXIMATE_REQUESTS_PER_WINDOW,
  reservoirRefreshAmount: SPOTIFY_APPROXIMATE_REQUESTS_PER_WINDOW,
  reservoirRefreshInterval: SPOTIFY_RATE_LIMIT_WINDOW_SECONDS * 1000,
  maxConcurrent: SPOTIFY_APPROXIMATE_REQUESTS_PER_WINDOW,
  minTime: 50,
  trackDoneStatus: true,
});

requestQueue.on('failed', async (error, info) => {
  if (error.message.includes('rate limit')) {
    return SPOTIFY_RATE_LIMIT_WINDOW_SECONDS * 1000;
  }
});

export const loader: LoaderFunction = async ({
  request,
}): Promise<LoaderResponse> => {
  const sdk = await getSdk();

  let profile, playlists, devices;

  if (sdk) {
    const profilePromise = requestQueue.schedule(() =>
      sdk.currentUser.profile()
    );
    const devicesPromise = requestQueue.schedule(() =>
      sdk.player.getAvailableDevices()
    );

    const scheduleGettingPlaylistsPage = async (offset = 0) => {
      return requestQueue.schedule(() =>
        sdk.currentUser.playlists
          .playlists(undefined, offset)
          .then(async (playlistMetadataPage) => {
            const playlistPromises = playlistMetadataPage.items.map(
              async ({ id }) =>
                requestQueue.schedule(() =>
                  sdk.playlists.getPlaylist(id, undefined, playlistFields)
                )
            );

            const playlistsDetails = await Promise.all(playlistPromises);

            return {
              playlistMetadataPage,
              playlistsDetails,
            };
          })
      );
    };

    const playlistsPromise = scheduleGettingPlaylistsPage().then(
      async ({ playlistMetadataPage }) => {
        const { total, limit } = playlistMetadataPage;
        let { items } = playlistMetadataPage;

        let offset = limit;

        let promises = [];

        while (offset < total) {
          promises.push(scheduleGettingPlaylistsPage(offset));

          offset += limit;
        }

        const responses = await Promise.all(promises);

        items = responses.reduce(
          (acc, { playlistMetadataPage: { items } }) => acc.concat(items),
          items
        );

        return items;
      }
    );

    // TODO: handle only a finite number of requests in the loader; handle the rest in the component with visible progress
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

    [profile, playlists, devices] = await Promise.all([
      profilePromise,
      playlistsPromise,
      devicesPromise,
    ]);
  }

  return {
    sdk,
    profile,
    playlists,
    devices,
  };
};

function HomePage() {
  const { sdk } = useLoaderData() as LoaderResponse;

  return sdk ? (
    <>
      <ProfileInfo />
      <DevicesInput />
      <PlaylistsMetadata />
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

const PlaylistsMetadata = () => {
  const { playlists } = useLoaderData() as LoaderResponse;

  const tableRows = playlists?.map(
    ({ id, name, description, tracks }, index) => {
      return (
        <tr key={`playlist-${id}`}>
          <td>{index + 1}</td>
          <td>{name}</td>
          <td>{truncateString(description, 50)}</td>
          <td>{tracks?.total}</td>
        </tr>
      );
    }
  );

  return (
    <>
      <h1>Your Playlists</h1>
      <Table striped bordered hover>
        <thead>
          <tr>
            <th>#</th>
            <th>Name</th>
            <th>Description</th>
            <th>Total Tracks</th>
          </tr>
        </thead>
        <tbody>{tableRows}</tbody>
      </Table>
    </>
  );
};

export default HomePage;
