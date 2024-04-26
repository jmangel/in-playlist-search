import { Playlist, Track } from '@spotify/web-api-ts-sdk';
import { LoaderResponse as HomePageLoaderResponse } from '../pages/HomePage';
import { useLoaderData } from 'react-router-dom';
import { useMemo, useState } from 'react';
import { Form } from 'react-bootstrap';
import * as DOMPurify from 'dompurify';

const DEFAULT_DOMPURIFY_URI_REGEX =
  /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i;

const MODIFIED_URI_REGEX = new RegExp(
  DEFAULT_DOMPURIFY_URI_REGEX.source.replace('tel|', 'tel|spotify|'),
  DEFAULT_DOMPURIFY_URI_REGEX.flags
);

const trackMatches = (searchQuery: string, track: Track) => {
  if (!track) return false;

  const searchWords = searchQuery.split(' ');
  const matchableString = `${track.name} ${track.artists
    .map(({ name }) => name)
    .join(' ')} ${track.album.name}`.toLowerCase();

  return searchWords.every((word) => matchableString.includes(word));
};

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

  const trackRows = showTracks
    ? tracks.items.map(({ track }, index) =>
        includeNonMatchingTracks || trackMatches(searchQuery, track) ? (
          <tr key={track.id}>
            <td>{index + 1}</td>
            <td>
              {/* <Button
                onClick={() => playPlaylistTrack(track.uri, index)}
                color="primary"
              >
                ►
              </Button> */}
            </td>
            <td colSpan={1}>{track.name}</td>
            <td colSpan={2}>
              {track.artists.map((artist) => artist.name).join(', ')}
            </td>
            <td colSpan={1}>{track.album.name}</td>
          </tr>
        ) : (
          <></>
        )
      )
    : [];

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
        </td>
        <td>
          <a target="_blank" href={href} rel="noreferrer">
            <strong>{name}</strong>
          </a>
        </td>
        <td className={isOwner ? 'fw-bold' : ''}>
          {isOwner ? 'me' : owner.display_name}
        </td>
        <td
          dangerouslySetInnerHTML={{
            __html: DOMPurify.sanitize(description, {
              USE_PROFILES: { html: true },
              ALLOWED_URI_REGEXP: MODIFIED_URI_REGEX,
            }),
          }}
        ></td>
        <td className={hasMissingOrExtraTracks ? 'bg-danger' : ''}>
          {tracks.items.length}
          {hasMissingOrExtraTracks ? ` / ${tracks.total}` : ''}
        </td>
      </tr>
      {trackRows.length > 0 && (
        <>
          <tr>
            <th colSpan={6} className="border-0 border-bottom border-success">
              <div className="d-flex">
                Tracks{' '}
                <Form.Check
                  type="switch"
                  id="include-non-matching-tracks"
                  label="Include Non-Matching Tracks"
                  checked={includeNonMatchingTracks}
                  onChange={(e) =>
                    setIncludeNonMatchingTracks(e.target.checked)
                  }
                  className="ms-2"
                />
              </div>
            </th>
          </tr>
          <tr>
            <th>#</th>
            <th></th>
            <th colSpan={1}>Track</th>
            <th colSpan={2}>Artist</th>
            <th colSpan={1}>Album</th>
          </tr>

          {trackRows}

          <tr>
            <th colSpan={6} className="border-0 border-bottom border-primary">
              More Playlists
            </th>
          </tr>
        </>
      )}
    </>
  );
};

export default PlaylistRow;
