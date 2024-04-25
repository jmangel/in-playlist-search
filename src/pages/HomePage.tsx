import {
  AuthorizationCodeWithPKCEStrategy,
  Devices,
  SimplifiedPlaylist,
  SpotifyApi,
  UserProfile,
} from '@spotify/web-api-ts-sdk';
import { useEffect, useState } from 'react';
import { Form } from 'react-bootstrap';
import { LoaderFunction, useLoaderData } from 'react-router-dom';

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

export const loader: LoaderFunction = async ({
  request,
}): Promise<LoaderResponse> => {
  const sdk = await getSdk();

  let profile, playlists, devices;

  if (sdk) {
    const profilePromise = sdk.currentUser.profile();
    const devicesPromise = sdk.player.getAvailableDevices();

    const playlistsPromise = sdk.currentUser.playlists
      .playlists()
      .then(async (playlistsResponse) => {
        const { total, limit } = playlistsResponse;
        let { items } = playlistsResponse;

        let offset = limit;

        let promises = [];

        while (offset < total) {
          promises.push(sdk.currentUser.playlists.playlists(undefined, offset));

          offset += limit;
        }

        const responses = await Promise.all(promises);

        items = responses.reduce((acc, { items }) => acc.concat(items), items);

        return items;
      });

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

  const tableRows = playlists?.map(({ id, name, description, tracks }) => {
    return (
      <tr key={id}>
        <td>{name}</td>
        <td>{truncateString(description, 50)}</td>
        <td>{tracks?.total}</td>
      </tr>
    );
  });

  return (
    <>
      <h1>Your Playlists</h1>
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Description</th>
            <th>Total Tracks</th>
          </tr>
        </thead>
        <tbody>{tableRows}</tbody>
      </table>
    </>
  );
};

export default HomePage;
