import { Playlist, Track } from '@spotify/web-api-ts-sdk';
import { LoaderResponse as HomePageLoaderResponse } from '../pages/HomePage';
import { useLoaderData } from 'react-router-dom';
import { useMemo, useState } from 'react';
import { Form } from 'react-bootstrap';

const truncateString = (str?: string, num?: number) => {
  if (!str) return '';
  if (!num) return str;
  return str.length > num ? str.slice(0, num) + '...' : str;
};

const trackMatches = (searchQuery: string, track: Track) =>
  !!track &&
  `${track.name} ${track.artists.map(({ name }) => name).join(' ')} ${
    track.album.name
  }`
    .toLowerCase()
    .includes(searchQuery);

type Props = {
  playlist: Playlist<Track>;
  index: number;
  searchQuery: string;
};
const PlaylistRow = (props: Props) => {
  const { playlist, index, searchQuery } = props;
  const {
    id,
    name,
    description,
    tracks,
    owner,
    external_urls: { spotify: href } = {},
  } = playlist;

  const { profile } = useLoaderData() as HomePageLoaderResponse;

  const [showTracks, setShowTracks] = useState(false);
  const [includeNonMatchingTracks, setIncludeNonMatchingTracks] =
    useState(false);

  const isOwner = owner.id === profile?.id;
  const hasMissingOrExtraTracks = tracks.items.length !== tracks.total;

  const matchesSearchTerm = useMemo(() => {
    if (!searchQuery) return true;
    return (
      name.toLowerCase().includes(searchQuery) ||
      owner.display_name.toLowerCase().includes(searchQuery) ||
      description.toLowerCase().includes(searchQuery) ||
      tracks.items.some((track) => trackMatches(searchQuery, track.track))
    );
  }, [searchQuery, name, owner.display_name, description, tracks]);

  if (!matchesSearchTerm) return null;

  return (
    <>
      <tr key={`playlist-${id}`}>
        <td>{index + 1}</td>
        <td>
          <Form.Check
            type="switch"
            id="show-tracks"
            label="Show Tracks"
            checked={showTracks}
            onChange={(e) => setShowTracks(e.target.checked)}
          />
          <Form.Check
            type="switch"
            id="include-non-matching-tracks"
            label="Include Non-Matching Tracks"
            checked={includeNonMatchingTracks}
            onChange={(e) => setIncludeNonMatchingTracks(e.target.checked)}
          />
        </td>
        <td>
          <a target="_blank" href={href} rel="noreferrer">
            <strong>{name}</strong>
          </a>
        </td>
        <td className={isOwner ? 'fw-bold' : ''}>
          {isOwner ? 'me' : owner.display_name}
        </td>
        <td>{truncateString(description, 50)}</td>
        <td className={hasMissingOrExtraTracks ? 'bg-danger' : ''}>
          {tracks.items.length}
          {hasMissingOrExtraTracks ? ` / ${tracks.total}` : ''}
        </td>
      </tr>
      {showTracks && (
        <>
          <tr>
            <th colSpan={6}>Tracks</th>
          </tr>
          <tr>
            <th>#</th>
            {/* <th></th> */}
            <th colSpan={2}>Artist</th>
            <th colSpan={1}>Track</th>
            <th colSpan={1}>Album</th>
          </tr>

          {tracks.items.map(({ track }, index) =>
            includeNonMatchingTracks || trackMatches(searchQuery, track) ? (
              <tr key={track.id}>
                <td>{index}</td>
                {/* <td>
                <Button
                  onClick={() => playPlaylistTrack(track.uri, index)}
                  color="primary"
                >
                  ►
                </Button>
              </td> */}
                <td colSpan={2}>
                  {track.artists.map((artist) => artist.name).join(', ')}
                </td>
                <td colSpan={1}>{track.name}</td>
                <td colSpan={1}>{track.album.name}</td>
              </tr>
            ) : (
              <></>
            )
          )}
        </>
      )}
    </>
  );
};

export default PlaylistRow;
