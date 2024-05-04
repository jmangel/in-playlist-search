import { Table } from 'react-bootstrap';
import PlaylistRow from './PlaylistRow';
import { Snapshot } from '../pages/HomePage';

type Props = {
  playlistsDetails: {
    [playlistId: string]: Snapshot;
  };
  searchQuery: string;
  playPlaylistTrack: (
    playlistUri: string,
    songUri: string,
    offsetPosition: number
  ) => void;
  copySnapshot: (snapshot: Snapshot) => void;
};
const PlaylistsTable = (props: Props) => {
  const { playlistsDetails, searchQuery, playPlaylistTrack, copySnapshot } =
    props;
  return (
    <Table striped bordered hover responsive className="table-sm">
      <thead>
        <tr>
          <th>#</th>
          <th>Name</th>
          <th>Owner</th>
          <th>Description</th>
          <th>Tracks</th>
        </tr>
      </thead>
      <tbody>
        {Object.values(playlistsDetails)?.map((playlist, index) => (
          <PlaylistRow
            key={playlist.id}
            playlist={playlist}
            index={index}
            searchQuery={searchQuery}
            playPlaylistTrack={playPlaylistTrack}
            copySnapshot={copySnapshot}
          />
        ))}
      </tbody>
    </Table>
  );
};

export default PlaylistsTable;
