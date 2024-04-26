import { Playlist, Track } from '@spotify/web-api-ts-sdk';
import { LoaderResponse as HomePageLoaderResponse } from '../pages/HomePage';
import { useLoaderData } from 'react-router-dom';

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

  const isOwner = owner.id === profile?.id;
  const isMissingTracks = tracks.items.length < tracks.total;

  return (
    <tr key={`playlist-${id}`}>
      <td>{index + 1}</td>
      <td>{name}</td>
      <td className={isOwner ? 'fw-bold' : ''}>
        {isOwner ? 'me' : owner.display_name}
      </td>
      <td>{truncateString(description, 50)}</td>
      <td className={isMissingTracks ? 'bg-danger' : ''}>
        {tracks.items.length}
        {isMissingTracks ? ` / ${tracks.total}` : ''}
      </td>
    </tr>
  );
};

export default PlaylistRow;
