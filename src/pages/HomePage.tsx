import {
  Dispatch,
  SetStateAction,
  useCallback,
  useEffect,
  useState,
} from 'react';
import { LoaderFunction, useLoaderData } from 'react-router-dom';

import { Col, Form, Row } from 'react-bootstrap';
import {
  AuthorizationCodeWithPKCEStrategy,
  Devices,
  Page,
  PlaybackState,
  SimplifiedPlaylist,
  SpotifyApi,
  UserProfile,
} from '@spotify/web-api-ts-sdk';

import Playlists from '../components/Playlists';

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

export type LoaderResponse = {
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

export const loader: LoaderFunction = async ({
  request,
}): Promise<LoaderResponse> => {
  const sdk = await getSdk();

  let profile, playlistPage, devices;

  if (sdk) {
    const profilePromise = sdk.currentUser.profile();
    const playlistPagePromise = sdk.currentUser.playlists.playlists();
    const devicesPromise = sdk.player.getAvailableDevices();

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

  const [selectedDeviceId, setSelectedDeviceId] = useState('');

  const playPlaylistTrack = useCallback(
    (playlistUri: string, songUri: string, offsetPosition: number) => {
      if (!sdk) return;

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

  return sdk ? (
    <>
      <Row className="align-items-center">
        <Col xs="auto">
          <ProfileInfo />
        </Col>
        <Col className="flex-grow-1" xs={6} sm={4}>
          <DevicesInput
            selectedDeviceId={selectedDeviceId}
            setSelectedDeviceId={setSelectedDeviceId}
          />
        </Col>
      </Row>
      <Playlists playPlaylistTrack={playPlaylistTrack} />
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

type DevicesInputProps = {
  selectedDeviceId: string;
  setSelectedDeviceId: Dispatch<SetStateAction<string>>;
};
const DevicesInput = (props: DevicesInputProps) => {
  const { selectedDeviceId, setSelectedDeviceId } = props;

  const { devices } = useLoaderData() as LoaderResponse;

  useEffect(
    () =>
      setSelectedDeviceId(
        (selectedDeviceId) =>
          devices?.devices?.find(({ is_active }) => is_active)?.id ||
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

export default HomePage;
