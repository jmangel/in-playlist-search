import { LoaderResponse as HomePageLoaderResponse } from '../pages/HomePage';
import { useLoaderData } from 'react-router-dom';
import { MouseEventHandler, useMemo, useState } from 'react';
import { Dropdown, Form } from 'react-bootstrap';
import * as DOMPurify from 'dompurify';
import { SPOTIFY_GREEN } from './DeferredPlaylists';
import { Snapshot, Track } from '../pages/HomePage';

const DEFAULT_DOMPURIFY_URI_REGEX =
  // eslint-disable-next-line no-useless-escape
  /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i;

const MODIFIED_URI_REGEX = new RegExp(
  DEFAULT_DOMPURIFY_URI_REGEX.source.replace('tel|', 'tel|spotify|'),
  DEFAULT_DOMPURIFY_URI_REGEX.flags
);

const QUEUE_PREVIEW_LENGTH = 5;

const doesMatchByWord = (searchQuery: string, matchableStrings: string[]) => {
  const matchableString = matchableStrings.join(' ').toLowerCase();

  const queryWords = searchQuery.toLowerCase().split(' ');
  return queryWords.every((word) => matchableString.includes(word));
};

const trackMatches = (searchQuery: string, track: Track) => {
  if (!track) return false;

  return doesMatchByWord(searchQuery, [
    track.name,
    ...track.artists.map(({ name }) => name),
    track.albumName,
  ]);
};

type IndexTableRowWithLinkButtonProps = {
  index: number;
  iconName: string;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  className?: string;
  actions?: JSX.Element;
};
const IndexTableRowWithLinkButton = ({
  index,
  iconName,
  onClick,
  className = '',
  actions,
}: IndexTableRowWithLinkButtonProps) => (
  <td>
    <div className="d-flex justify-content-end gap-1">
      {index + 1}
      {onClick && (
        <i
          role="button"
          className={`text-primary bi bi-${iconName} ${className}`}
          onClick={onClick}
        />
      )}
    </div>
    {actions && <div className="d-flex justify-content-end">{actions}</div>}
  </td>
);

type Props = {
  playlist: Snapshot;
  index: number;
  searchQuery: string;
  playPlaylistTrack: (
    playlistUri: string,
    songUri: string,
    offsetPosition: number
  ) => void;
  copySnapshot: (snapshot: Snapshot) => void;
};
const PlaylistRow = (props: Props) => {
  const { playlist, index, searchQuery, playPlaylistTrack, copySnapshot } =
    props;
  const { id, name, description, tracks, owner, spotifyUrl } = playlist;

  const { profile } = useLoaderData() as HomePageLoaderResponse;

  const [showTracks, setShowTracks] = useState(false);
  const [includeNonMatchingTracks, setIncludeNonMatchingTracks] =
    useState(false);

  const isOwner = owner.id === profile?.id;

  const matchesSearchTerm = useMemo(() => {
    if (!searchQuery) return true;
    return (
      doesMatchByWord(searchQuery, [name, owner.display_name, description]) ||
      tracks.some((track) => trackMatches(searchQuery, track))
    );
  }, [searchQuery, name, owner.display_name, description, tracks]);

  if (!matchesSearchTerm) return null;

  let queuePreviewIndex = -1;
  const trackRows = showTracks
    ? tracks.map((track, index) => {
        const isMatching = trackMatches(searchQuery, track);

        if (isMatching) queuePreviewIndex = index + QUEUE_PREVIEW_LENGTH;

        if (
          isMatching ||
          queuePreviewIndex >= index ||
          includeNonMatchingTracks
        ) {
          const shouldDiminishVisually =
            !isMatching || track.missingFromSpotify;

          const rowClass = `table-secondary ${
            shouldDiminishVisually ? 'small fst-italic fw-light' : ''
          }`;
          const cellClass = `text-break ${
            shouldDiminishVisually ? 'small' : ''
          }`;

          return (
            <tr key={track.id || track.uri} className={rowClass}>
              <IndexTableRowWithLinkButton
                index={index}
                iconName="play-circle-fill"
                className="text-success"
                onClick={
                  track.missingFromSpotify
                    ? undefined
                    : () => playPlaylistTrack(playlist.uri, track.uri, index)
                }
              />
              <td colSpan={1} className={cellClass}>
                {track.name}
              </td>
              <td colSpan={1} className={cellClass}>
                {track.artists.map((artist) => artist.name).join(', ')}
              </td>
              <td colSpan={1} className={cellClass}>
                {track.albumName}
              </td>
            </tr>
          );
        }

        return <></>;
      })
    : [];

  return (
    <>
      <tr key={`playlist-${id}`}>
        <IndexTableRowWithLinkButton
          index={index}
          iconName={`arrows-${showTracks ? 'collapse' : 'expand'}`}
          onClick={() => setShowTracks((prev) => !prev)}
          actions={
            <Dropdown focusFirstItemOnShow>
              <Dropdown.Toggle
                id="actions-dropdown"
                variant="link"
                className="p-0"
                size="sm"
              >
                ...
              </Dropdown.Toggle>

              <Dropdown.Menu>
                <Dropdown.Item
                  onClick={() => copySnapshot(playlist)}
                  className="btn btn-primary"
                >
                  Save Copy
                </Dropdown.Item>
              </Dropdown.Menu>
            </Dropdown>
          }
        />
        <td className="text-break">
          <a target="_blank" href={spotifyUrl} rel="noreferrer">
            <strong>{name}</strong>
          </a>
        </td>
        <td
          className={`text-break ${isOwner ? ' fw-bold' : ''}`}
          style={owner.id === 'spotify' ? { color: SPOTIFY_GREEN } : {}}
        >
          {isOwner ? 'me' : owner.display_name}
        </td>
        <td
          className="text-break"
          dangerouslySetInnerHTML={{
            __html: DOMPurify.sanitize(description, {
              USE_PROFILES: { html: true },
              ALLOWED_URI_REGEXP: MODIFIED_URI_REGEX,
            }),
          }}
        ></td>
      </tr>
      {trackRows.length > 0 && (
        <>
          <tr>
            <th colSpan={6} className="border-0 border-bottom border-success">
              <div className="d-flex gap-2">
                Tracks{' '}
                <Form.Check
                  type="switch"
                  id="include-non-matching-tracks"
                  label="Include Non-Matching Tracks"
                  checked={includeNonMatchingTracks}
                  onChange={(e) =>
                    setIncludeNonMatchingTracks(e.target.checked)
                  }
                />
              </div>
            </th>
          </tr>
          <tr className="table-secondary">
            <th>#</th>
            <th colSpan={1}>Track</th>
            <th colSpan={1}>Artist</th>
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
