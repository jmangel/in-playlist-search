import { LoaderFunction, defer } from 'react-router-dom';

import { Col, Container, Row } from 'react-bootstrap';
import {
  AuthorizationCodeWithPKCEStrategy,
  Page,
  SimplifiedPlaylist,
  SpotifyApi,
  UserProfile,
} from '@spotify/web-api-ts-sdk';

import 'react-toastify/dist/ReactToastify.css';

import DeferredPlaylists from '../components/DeferredPlaylists';
import { Artist, Playlist, playlistDatabase, Track as DBTrack } from '../db';
import DeferredProfileInfo from '../components/DeferredProfileInfo';
import DiskUsageAlert from '../components/DiskUsageAlert';
import { ToastContainer } from 'react-toastify';

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
  missingFromSpotify?: boolean;
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
  return (
    <Container fluid className="d-grid gap-2">
      <ToastContainer />
      <Row className="align-items-center">
        <DeferredProfileInfo />
      </Row>
      <DeferredPlaylists />
      <DiskUsageAlert />
    </Container>
  );
}

export default HomePage;
