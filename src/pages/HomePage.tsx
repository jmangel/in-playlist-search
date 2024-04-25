import { useSpotify } from '../hooks/useSpotify';
import { SearchResults, SpotifyApi } from '@spotify/web-api-ts-sdk';
import { useEffect, useState } from 'react'

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

function HomePage() {

  const sdk = useSpotify(
    // import.meta.env.VITE_SPOTIFY_CLIENT_ID,
    clientId,
    // import.meta.env.VITE_REDIRECT_TARGET,
    redirectUrl,
    scopes,
  );

  return sdk
    ? (<SpotifySearch sdk={sdk} />)
    : (<></>);
}

function SpotifySearch({ sdk }: { sdk: SpotifyApi}) {
  const [results, setResults] = useState<SearchResults<["artist"]>>({} as SearchResults<["artist"]>);

  useEffect(() => {
    (async () => {
      // @ts-ignore
      const results = await sdk.search("The Beatles", ["artist"]);
      setResults(() => results);
    })();
  }, [sdk]);

  const tableRows = results.artists?.items.map((artist) => {
    return (
      <tr key={artist.id}>
        <td>{artist.name}</td>
        <td>{artist.popularity}</td>
        <td>{artist.followers.total}</td>
      </tr>
    );
  });

  return (
    <>
      <h1>Spotify Search for The Beatles</h1>
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Popularity</th>
            <th>Followers</th>
          </tr>
        </thead>
        <tbody>
          {tableRows}
        </tbody>
      </table>
    </>
  )
}

export default HomePage;