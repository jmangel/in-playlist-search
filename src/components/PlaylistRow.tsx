import { Playlist, Track } from '@spotify/web-api-ts-sdk';
import { LoaderResponse as HomePageLoaderResponse } from '../pages/HomePage';
import { useLoaderData } from 'react-router-dom';
import { useState } from 'react';
import { Col, Form, Row } from 'react-bootstrap';

const truncateString = (str?: string, num?: number) => {
  if (!str) return '';
  if (!num) return str;
  return str.length > num ? str.slice(0, num) + '...' : str;
};

type Props = {
  playlist: Playlist<Track>;
  index: number;
};
const PlaylistRow = (props: Props) => {
  const { playlist, index } = props;
  const { id, name, description, tracks, owner } = playlist;

  const { profile } = useLoaderData() as HomePageLoaderResponse;

  const [showAllTracks, setShowAllTracks] = useState(false);

  const isOwner = owner.id === profile?.id;
  const hasMissingOrExtraTracks = tracks.items.length !== tracks.total;

  return (
    <>
      <tr key={`playlist-${id}`}>
        <td>{index + 1}</td>
        <td>
          <Form.Check
            type="switch"
            id="show-all-tracks"
            label="Show All Tracks"
            checked={showAllTracks}
            onChange={(e) => setShowAllTracks(e.target.checked)}
          />
        </td>
        <td>{name}</td>
        <td className={isOwner ? 'fw-bold' : ''}>
          {isOwner ? 'me' : owner.display_name}
        </td>
        <td>{truncateString(description, 50)}</td>
        <td className={hasMissingOrExtraTracks ? 'bg-danger' : ''}>
          {tracks.items.length}
          {hasMissingOrExtraTracks ? ` / ${tracks.total}` : ''}
        </td>
      </tr>
      {showAllTracks && (
        <Row>
          <Col>
            <ul>
              {tracks.items.map((track) => (
                <li key={track.track.id}>
                  {track.track.artists.map((artist) => artist.name).join(', ')}{' '}
                  - {track.track.name}
                </li>
              ))}
            </ul>
          </Col>
        </Row>
      )}
    </>
  );
};

export default PlaylistRow;
